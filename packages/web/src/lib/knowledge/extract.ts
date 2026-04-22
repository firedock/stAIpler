import type { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { decrypt } from '@/lib/crypto';

/**
 * Knowledge layer — extract stage.
 *
 * Runs on session close or explicit user trigger. Reads recent project_logs
 * rows, asks an LLM for candidate atoms (biased toward restraint), writes
 * them with status='candidate' and one 'extracted' event per atom, plus a
 * pipeline run row with stage='extract'.
 *
 * v1 policy (see docs/knowledge-v1.md §3):
 *  - Never emit atoms with status other than 'candidate'.
 *  - source_authority reflects where the claim was grounded in the transcript.
 *  - Dedupe / near-duplicate detection is NOT this stage's job — reconcile owns that.
 */

const EXTRACTOR_MODEL = 'claude-sonnet-4-5';
const MAX_ATOMS_PER_SESSION = 10;

type Authority = 'assistant' | 'user' | 'source_document' | 'mixed';
type AtomType = 'claim' | 'heuristic' | 'question' | 'answer' | 'decision_note';

interface LogRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

interface CandidateAtom {
  concept_slug: string;
  atom_type: AtomType;
  content: string;
  source_authority: Authority;
  source_log_ids: string[];
  confidence: number;
  authority_breakdown?: Record<string, number>;
}

export interface ExtractResult {
  runId: string | null;
  extractedCount: number;
  logCount: number;
  error?: string;
}

const EXTRACTOR_SYSTEM_PROMPT = `You are the extract stage of a knowledge pipeline for an AI agent project.
Your job: read a session transcript and produce durable knowledge atoms.

RULES
- BE RESTRAINED. Missing a few valid atoms is better than producing noise.
- Skip small talk, clarifying questions, tool confirmations, and session-local context.
- Only extract claims that could matter across FUTURE sessions.
- Never produce more than ${MAX_ATOMS_PER_SESSION} atoms. Prefer fewer.
- Never re-state the question the user asked — extract the *answer* or *decision*.
- If the transcript contains no durable knowledge, return {"atoms": []}.

For each atom, produce a JSON object with:
  concept_slug       kebab-case short id (e.g. "trust-hierarchy", "auth-flow")
  atom_type          one of: claim | heuristic | question | answer | decision_note
  content            one sentence, 280 chars max
  source_authority   "user" if grounded in a user assertion,
                     "assistant" if it's an inference the assistant offered,
                     "mixed" if both contributed materially.
                     Never use "source_document".
  source_log_ids     array of log ids that support this atom (required, non-empty)
  confidence         number in (0, 1]; start conservative (≤ 0.6) unless the
                     user explicitly asserted it.
  authority_breakdown  OPTIONAL. Required if source_authority = "mixed".
                       Object mapping authority names to weights summing to ~1.

Return strict JSON only, shape:
  {"atoms": [ ... ]}
No prose, no markdown fences, no commentary.`;

/**
 * Resolve a BYOK Anthropic key from agent_configs. Returns null if the
 * project's configured provider is not Anthropic or no key is stored.
 * Never falls back to server env vars — those would bill stAIpler for a
 * user-initiated action.
 */
async function resolveProjectAnthropicKey(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('provider, api_key_encrypted')
    .eq('project_id', projectId)
    .maybeSingle();
  if (!agentConfig || agentConfig.provider !== 'anthropic' || !agentConfig.api_key_encrypted) {
    return null;
  }
  try {
    return decrypt(agentConfig.api_key_encrypted);
  } catch {
    return null;
  }
}

function formatTranscript(logs: LogRow[]): string {
  return logs
    .map(l => `[id=${l.id}] ${l.role.toUpperCase()} (${l.created_at}):\n${l.content}`)
    .join('\n\n---\n\n');
}

function parseAtoms(raw: string): CandidateAtom[] {
  // Strip any accidental markdown fences
  let text = raw.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const atomsRaw = (parsed as { atoms?: unknown }).atoms;
  if (!Array.isArray(atomsRaw)) return [];

  const out: CandidateAtom[] = [];
  for (const a of atomsRaw) {
    if (!a || typeof a !== 'object') continue;
    const obj = a as Record<string, unknown>;
    const conceptSlug = typeof obj.concept_slug === 'string' ? obj.concept_slug.trim().toLowerCase() : '';
    const atomType = obj.atom_type as AtomType;
    const content = typeof obj.content === 'string' ? obj.content.trim() : '';
    const authority = obj.source_authority as Authority;
    const logIds = Array.isArray(obj.source_log_ids) ? obj.source_log_ids.filter((x): x is string => typeof x === 'string') : [];
    const confidence = typeof obj.confidence === 'number' ? Math.max(0, Math.min(1, obj.confidence)) : 0.4;
    const breakdownRaw = obj.authority_breakdown;
    const authorityBreakdown =
      breakdownRaw && typeof breakdownRaw === 'object' && !Array.isArray(breakdownRaw)
        ? (breakdownRaw as Record<string, number>)
        : undefined;

    if (!conceptSlug || !content) continue;
    if (!['claim', 'heuristic', 'question', 'answer', 'decision_note'].includes(atomType)) continue;
    if (!['assistant', 'user', 'mixed'].includes(authority)) continue; // block source_document
    if (logIds.length === 0) continue; // provenance required
    if (authority === 'mixed' && !authorityBreakdown) continue; // enforce DB constraint client-side

    out.push({
      concept_slug: conceptSlug,
      atom_type: atomType,
      content,
      source_authority: authority,
      source_log_ids: logIds,
      confidence,
      authority_breakdown: authorityBreakdown,
    });
  }
  return out.slice(0, MAX_ATOMS_PER_SESSION);
}

export async function extractFromLogs(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  options: {
    sinceIso?: string | null;
    sessionId?: string | null;
  } = {},
): Promise<ExtractResult> {
  const apiKey = await resolveProjectAnthropicKey(supabase, projectId);
  if (!apiKey) {
    return {
      runId: null,
      extractedCount: 0,
      logCount: 0,
      error: 'Knowledge extraction requires an Anthropic API key. Add one in Settings (provider: Anthropic).',
    };
  }

  // Open pipeline run
  const { data: runRow } = await supabase
    .from('knowledge_pipeline_runs')
    .insert({
      project_id: projectId,
      stage: 'extract',
      session_id: options.sessionId ?? null,
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
    // Fetch logs. Default window: since last successful extract run, else last 24h.
    let sinceIso = options.sinceIso ?? null;
    if (!sinceIso) {
      const { data: prior } = await supabase
        .from('knowledge_pipeline_runs')
        .select('completed_at')
        .eq('project_id', projectId)
        .eq('stage', 'extract')
        .eq('status', 'succeeded')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (prior?.completed_at) sinceIso = prior.completed_at;
      else sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    }

    const { data: logsData } = await supabase
      .from('project_logs')
      .select('id, role, content, created_at')
      .eq('project_id', projectId)
      .gte('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(100);

    const logs = (logsData ?? []) as LogRow[];
    if (logs.length === 0) {
      await closeRun({ extracted: 0, log_count: 0, skipped_reason: 0 } as Record<string, number>);
      return { runId: runId ?? null, extractedCount: 0, logCount: 0 };
    }

    // Call the LLM
    const anthropic = new Anthropic({ apiKey });
    const transcript = formatTranscript(logs);
    const message = await anthropic.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: 2048,
      system: EXTRACTOR_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Transcript:\n\n${transcript}\n\nReturn the JSON now.` }],
    });

    const raw = message.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('');

    const candidates = parseAtoms(raw);

    // Validate log ids reference the transcript we sent
    const validLogIds = new Set(logs.map(l => l.id));
    const cleaned = candidates
      .map(a => ({ ...a, source_log_ids: a.source_log_ids.filter(id => validLogIds.has(id)) }))
      .filter(a => a.source_log_ids.length > 0);

    if (cleaned.length === 0) {
      await closeRun({ extracted: 0, log_count: logs.length });
      return { runId: runId ?? null, extractedCount: 0, logCount: logs.length };
    }

    // Insert atoms (status='candidate', review_state='pending' by default)
    const atomRows = cleaned.map(a => ({
      project_id: projectId,
      concept_slug: a.concept_slug,
      atom_type: a.atom_type,
      content: a.content,
      status: 'candidate',
      source_authority: a.source_authority,
      authority_breakdown: a.authority_breakdown ?? null,
      confidence: a.confidence,
      review_state: 'pending',
      source_log_ids: a.source_log_ids,
    }));

    const { data: insertedAtoms, error: insertErr } = await supabase
      .from('knowledge_atoms')
      .insert(atomRows)
      .select('id');

    if (insertErr) {
      await closeRun({ extracted: 0, log_count: logs.length }, insertErr.message);
      return { runId: runId ?? null, extractedCount: 0, logCount: logs.length, error: insertErr.message };
    }

    // Emit 'extracted' event per atom
    const eventRows = (insertedAtoms ?? []).map((row, i) => ({
      atom_id: row.id,
      project_id: projectId,
      event_type: 'extracted',
      actor: 'system',
      trigger_ref: runId ?? 'extract',
      payload: {
        source_log_ids: cleaned[i].source_log_ids,
        source_authority: cleaned[i].source_authority,
        confidence: cleaned[i].confidence,
      },
    }));

    if (eventRows.length > 0) {
      await supabase.from('knowledge_atom_events').insert(eventRows);
    }

    await closeRun({ extracted: insertedAtoms?.length ?? 0, log_count: logs.length });
    return { runId: runId ?? null, extractedCount: insertedAtoms?.length ?? 0, logCount: logs.length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await closeRun({}, msg);
    return { runId: runId ?? null, extractedCount: 0, logCount: 0, error: msg };
  }
}
