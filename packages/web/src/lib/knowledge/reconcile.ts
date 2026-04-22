import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { decrypt } from '@/lib/crypto';

/**
 * Knowledge layer — reconcile stage.
 *
 * For each atom without an embedding, compute one via OpenAI
 * text-embedding-3-small (1536 dims), store it, and run a nearest-neighbor
 * search against other atoms in the same project. Pairs above the similarity
 * threshold produce 'similar_detected' events on BOTH sides — surfaced to
 * the review queue as side-by-side candidates.
 *
 * v1 policy (docs/knowledge-v1.md §9 / Step 6):
 *   - NO auto-merge.
 *   - NO auto-contradict.
 *   - Surfacing only. The user is the reconciler.
 */

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMS = 1536;
const SIMILARITY_THRESHOLD = 0.85;
const MAX_MATCHES_PER_ATOM = 5;
const BATCH_EMBED_SIZE = 50;

export interface ReconcileResult {
  runId: string | null;
  embedded: number;
  pairsDetected: number;
  error?: string;
}

interface AtomNeedingEmbedding {
  id: string;
  content: string;
}

interface MatchRow {
  id: string;
  content: string;
  concept_slug: string;
  status: string;
  source_authority: string;
  similarity: number;
}

/**
 * Resolve a BYOK OpenAI key from agent_configs. Returns null unless the
 * project is configured with provider='openai'. Never falls back to server
 * env vars — embedding work on a hosted tier is not supported until billing ships.
 */
async function resolveProjectOpenAIKey(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('provider, api_key_encrypted')
    .eq('project_id', projectId)
    .maybeSingle();
  if (!agentConfig || agentConfig.provider !== 'openai' || !agentConfig.api_key_encrypted) {
    return null;
  }
  try {
    return decrypt(agentConfig.api_key_encrypted);
  } catch {
    return null;
  }
}

export async function reconcileAtoms(
  supabase: SupabaseClient,
  projectId: string,
): Promise<ReconcileResult> {
  const apiKey = await resolveProjectOpenAIKey(supabase, projectId);
  if (!apiKey) {
    // Reconcile is non-blocking: without an OpenAI BYOK, embeddings are skipped.
    // Atoms still reach the review queue — they just aren't deduped/clustered.
    return {
      runId: null,
      embedded: 0,
      pairsDetected: 0,
      error: 'Embedding reconciliation skipped: configure an OpenAI API key to enable similarity detection.',
    };
  }

  // Open pipeline run
  const { data: runRow } = await supabase
    .from('knowledge_pipeline_runs')
    .insert({
      project_id: projectId,
      stage: 'reconcile',
      status: 'running',
      counts: {},
    })
    .select('id')
    .single();

  const runId = runRow?.id as string | undefined;

  async function closeRun(counts: Record<string, number>, error?: string) {
    if (!runId) return;
    await supabase
      .from('knowledge_pipeline_runs')
      .update({
        status: error ? 'failed' : 'succeeded',
        completed_at: new Date().toISOString(),
        counts,
        error: error ?? null,
      })
      .eq('id', runId);
  }

  try {
    // 1. Fetch atoms missing an embedding
    const { data: toEmbed } = await supabase
      .from('knowledge_atoms')
      .select('id, content')
      .eq('project_id', projectId)
      .is('embedding', null)
      .limit(200);

    const atomsNeedingEmbedding = (toEmbed ?? []) as AtomNeedingEmbedding[];
    let embedded = 0;

    // 2. Embed in batches
    if (atomsNeedingEmbedding.length > 0) {
      const openai = new OpenAI({ apiKey });
      for (let i = 0; i < atomsNeedingEmbedding.length; i += BATCH_EMBED_SIZE) {
        const batch = atomsNeedingEmbedding.slice(i, i + BATCH_EMBED_SIZE);
        const resp = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch.map(a => a.content),
        });
        for (let j = 0; j < batch.length; j++) {
          const vec = resp.data[j]?.embedding;
          if (!vec || vec.length !== EMBEDDING_DIMS) continue;
          // pgvector accepts stringified array: "[0.1, 0.2, ...]"
          const vecString = `[${vec.join(',')}]`;
          const { error: updErr } = await supabase
            .from('knowledge_atoms')
            .update({ embedding: vecString })
            .eq('id', batch[j].id);
          if (!updErr) embedded++;
        }
      }
    }

    // 3. For each atom we just embedded (or any pending atom), run NN search.
    //    We re-fetch to get the stored embedding and rely on the RPC to do the work.
    const embeddedIds = atomsNeedingEmbedding.map(a => a.id);
    let pairsDetected = 0;

    if (embeddedIds.length > 0) {
      // Fetch the freshly-embedded atoms' content to re-embed as the query vector.
      // (Cheaper than reading vectors out of Postgres and reformatting.)
      const openai = new OpenAI({ apiKey });
      const { data: freshAtoms } = await supabase
        .from('knowledge_atoms')
        .select('id, content')
        .in('id', embeddedIds);

      const freshList = (freshAtoms ?? []) as AtomNeedingEmbedding[];
      const seenPairs = new Set<string>();

      for (let i = 0; i < freshList.length; i += BATCH_EMBED_SIZE) {
        const batch = freshList.slice(i, i + BATCH_EMBED_SIZE);
        const resp = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: batch.map(a => a.content),
        });

        for (let j = 0; j < batch.length; j++) {
          const vec = resp.data[j]?.embedding;
          if (!vec || vec.length !== EMBEDDING_DIMS) continue;
          const vecString = `[${vec.join(',')}]`;
          const atomId = batch[j].id;

          const { data: matches, error: rpcErr } = await supabase.rpc('match_knowledge_atoms', {
            p_project_id: projectId,
            p_query_embedding: vecString,
            p_exclude_id: atomId,
            p_threshold: SIMILARITY_THRESHOLD,
            p_limit: MAX_MATCHES_PER_ATOM,
          });

          if (rpcErr || !matches) continue;

          for (const m of matches as MatchRow[]) {
            // Dedupe symmetric pairs within this run
            const pairKey = [atomId, m.id].sort().join('::');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            const payload = {
              similarity: Number(m.similarity.toFixed(4)),
              matched_content: m.content,
              matched_concept_slug: m.concept_slug,
              matched_status: m.status,
              matched_source_authority: m.source_authority,
              run_id: runId ?? null,
            };

            // Write events on BOTH sides so the reconciliation is symmetrical
            await supabase.from('knowledge_atom_events').insert([
              {
                atom_id: atomId,
                project_id: projectId,
                event_type: 'similar_detected',
                actor: 'system',
                trigger_ref: runId ?? 'reconcile',
                payload: { ...payload, peer_atom_id: m.id },
              },
              {
                atom_id: m.id,
                project_id: projectId,
                event_type: 'similar_detected',
                actor: 'system',
                trigger_ref: runId ?? 'reconcile',
                payload: { ...payload, peer_atom_id: atomId, matched_content: batch[j].content },
              },
            ]);
            pairsDetected++;
          }
        }
      }
    }

    await closeRun({ embedded, pairs_detected: pairsDetected });
    return { runId: runId ?? null, embedded, pairsDetected };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await closeRun({}, msg);
    return { runId: runId ?? null, embedded: 0, pairsDetected: 0, error: msg };
  }
}
