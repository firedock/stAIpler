import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Knowledge layer — promote stage.
 *
 * Auto-promotes candidate atoms to provisional when the trust boundary
 * allows it (§3):
 *   - source_authority = 'source_document' (auto)
 *   - source_authority = 'user' (auto)
 *   - reinforced ≥ 3 across distinct sessions (auto)
 *
 * Stable is NEVER reachable from here. The schema allows system promotions
 * only up to 'provisional'; the only path to 'stable' is the review queue
 * action route with actor='user'.
 */

const REINFORCEMENT_THRESHOLD = 3;

export interface PromoteResult {
  runId: string | null;
  promoted: number;
  byRule: Record<string, number>;
  error?: string;
}

export interface CandidateAtom {
  id: string;
  project_id: string;
  status: string;
  source_authority: 'assistant' | 'user' | 'source_document' | 'mixed';
  reinforcement_count: number;
  distinct_session_count: number;
  authority_breakdown: Record<string, number> | null;
}

/**
 * Determine whether a candidate qualifies for auto-promotion to provisional,
 * and which rule fires. Returns null if the atom stays a candidate.
 */
export function pickRule(atom: CandidateAtom): string | null {
  if (atom.status !== 'candidate') return null;
  if (atom.source_authority === 'source_document') return 'source_document_authority';
  if (atom.source_authority === 'user') return 'user_authority';
  if (atom.reinforcement_count + atom.distinct_session_count >= REINFORCEMENT_THRESHOLD) {
    return 'reinforced_threshold';
  }
  // Mixed: only promote if the breakdown excludes assistant contribution.
  // Otherwise assistant-tainted mixtures remain candidates.
  if (atom.source_authority === 'mixed' && atom.authority_breakdown) {
    const assistantWeight = Number(atom.authority_breakdown.assistant ?? 0);
    if (assistantWeight <= 0) return 'mixed_no_assistant';
  }
  return null;
}

export async function applyPromotionRules(
  supabase: SupabaseClient,
  projectId: string,
  options: { atomIds?: string[] } = {},
): Promise<PromoteResult> {
  const { data: runRow } = await supabase
    .from('knowledge_pipeline_runs')
    .insert({
      project_id: projectId,
      stage: 'promote',
      status: 'running',
      counts: {},
    })
    .select('id')
    .single();

  const runId = runRow?.id as string | undefined;

  async function closeRun(counts: Record<string, unknown>, error?: string) {
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
    let query = supabase
      .from('knowledge_atoms')
      .select('id, project_id, status, source_authority, reinforcement_count, distinct_session_count, authority_breakdown')
      .eq('project_id', projectId)
      .eq('status', 'candidate');

    if (options.atomIds && options.atomIds.length > 0) {
      query = query.in('id', options.atomIds);
    }

    const { data } = await query;
    const atoms = (data ?? []) as CandidateAtom[];

    const byRule: Record<string, number> = {};
    const nowIso = new Date().toISOString();

    for (const atom of atoms) {
      const rule = pickRule(atom);
      if (!rule) continue;

      const { error: updErr } = await supabase
        .from('knowledge_atoms')
        .update({ status: 'provisional', promoted_at: nowIso })
        .eq('id', atom.id)
        .eq('status', 'candidate'); // guard against concurrent changes
      if (updErr) continue;

      await supabase.from('knowledge_atom_events').insert({
        atom_id: atom.id,
        project_id: projectId,
        event_type: 'auto_promoted',
        actor: 'system',
        trigger_ref: rule,
        payload: {
          from_status: 'candidate',
          to_status: 'provisional',
          source_authority: atom.source_authority,
          reinforcement_count: atom.reinforcement_count,
          distinct_session_count: atom.distinct_session_count,
          run_id: runId ?? null,
        },
      });

      byRule[rule] = (byRule[rule] ?? 0) + 1;
    }

    const promoted = Object.values(byRule).reduce((s, n) => s + n, 0);
    await closeRun({ promoted, by_rule: byRule, considered: atoms.length });
    return { runId: runId ?? null, promoted, byRule };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await closeRun({}, msg);
    return { runId: runId ?? null, promoted: 0, byRule: {}, error: msg };
  }
}
