import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Knowledge layer — inject stage.
 *
 * Runs on every prompt compile. Reads the compact knowledge_prompt_view and
 * writes one knowledge_injection_decisions row per eligible atom (included or
 * excluded with a reason). Also opens and closes a knowledge_pipeline_runs row
 * with stage='inject' for the compile.
 *
 * Prompt-view regeneration lives in the render stage; this function never
 * writes the prompt view itself.
 *
 * See packages/web/docs/knowledge-v1.md §3, §4, §6.
 */

const DEFAULT_TOKEN_BUDGET = 800;

export type ExclusionReason =
  | 'low_authority'
  | 'status_below_threshold'
  | 'pending_review'
  | 'contradicted'
  | 'superseded'
  | 'token_budget'
  | 'source_override'
  | 'manually_excluded';

interface AtomRow {
  id: string;
  status: 'candidate' | 'provisional' | 'stable' | 'deprecated' | 'contradicted';
  source_authority: 'assistant' | 'user' | 'source_document' | 'mixed';
  review_state: 'pending' | 'approved' | 'rejected' | 'edited' | 'deferred';
  is_pinned: boolean;
  reinforcement_count: number;
  distinct_session_count: number;
  superseded_by: string | null;
  content: string;
}

interface PromptViewRow {
  project_id: string;
  body_md: string;
  token_estimate: number;
  atom_ids: string[];
}

export interface InjectResult {
  bodyMd: string;
  tokenEstimate: number;
  runId: string | null;
  counts: {
    included: number;
    excluded: number;
    total: number;
  };
}

/**
 * Classify why an atom was not included in the compact prompt view.
 * Order matters: earlier reasons take precedence.
 */
function classifyExclusion(atom: AtomRow): ExclusionReason | null {
  if (atom.status === 'deprecated') {
    return atom.superseded_by ? 'superseded' : null; // skip: no reason to inject at all
  }
  if (atom.status === 'contradicted') return 'contradicted';
  if (atom.status === 'candidate') {
    if (atom.review_state === 'pending') return 'pending_review';
    // Assistant-only claims with no reinforcement are low-authority.
    if (
      atom.source_authority === 'assistant' &&
      atom.reinforcement_count === 0 &&
      atom.distinct_session_count <= 1
    ) {
      return 'low_authority';
    }
    return 'status_below_threshold';
  }
  if (atom.status === 'provisional' && !atom.is_pinned) {
    return 'status_below_threshold';
  }
  // stable, or provisional+pinned, but wasn't in the prompt view → didn't fit.
  return 'token_budget';
}

export async function injectKnowledgeLayer(
  supabase: SupabaseClient,
  projectId: string,
  sessionId: string | null,
  options: { tokenBudget?: number } = {},
): Promise<InjectResult> {
  const tokenBudget = options.tokenBudget ?? DEFAULT_TOKEN_BUDGET;

  // 1. Open pipeline run
  const { data: runRow, error: runErr } = await supabase
    .from('knowledge_pipeline_runs')
    .insert({
      project_id: projectId,
      stage: 'inject',
      session_id: sessionId,
      status: 'running',
      counts: {},
    })
    .select('id')
    .single();

  const runId = runErr ? null : (runRow?.id as string | null);

  try {
    // 2. Fetch eligible atoms (not deprecated-without-superseder — those are noise)
    const { data: atomsData } = await supabase
      .from('knowledge_atoms')
      .select('id, status, source_authority, review_state, is_pinned, reinforcement_count, distinct_session_count, superseded_by, content')
      .eq('project_id', projectId)
      .in('status', ['candidate', 'provisional', 'stable', 'deprecated', 'contradicted']);

    const atoms = (atomsData ?? []) as AtomRow[];

    // 3. Fetch current prompt view (may be missing)
    const { data: viewData } = await supabase
      .from('knowledge_prompt_view')
      .select('project_id, body_md, token_estimate, atom_ids')
      .eq('project_id', projectId)
      .maybeSingle();

    const view = (viewData as PromptViewRow | null) ?? {
      project_id: projectId,
      body_md: '',
      token_estimate: 0,
      atom_ids: [],
    };

    // 4. Compute decisions
    const includedIds = new Set<string>(view.atom_ids ?? []);
    const decisions: Array<{
      atom_id: string;
      decision: 'included' | 'excluded';
      reason: ExclusionReason | null;
      token_cost: number;
    }> = [];

    let totalIncludedTokens = 0;
    for (const atom of atoms) {
      if (includedIds.has(atom.id)) {
        const cost = Math.ceil((atom.content?.length ?? 0) / 4);
        totalIncludedTokens += cost;
        decisions.push({ atom_id: atom.id, decision: 'included', reason: null, token_cost: cost });
        continue;
      }
      const reason = classifyExclusion(atom);
      if (reason === null) continue; // deprecated without superseder — skip entirely
      decisions.push({ atom_id: atom.id, decision: 'excluded', reason, token_cost: 0 });
    }

    // 5. Enforce token budget — if the prompt view blew the budget, demote all
    //    included decisions on the overflowing atoms to token_budget exclusions.
    //    (The render stage is expected to stay within budget; this is a safety net.)
    const effectiveTokens = Math.min(totalIncludedTokens, view.token_estimate || totalIncludedTokens);
    if (effectiveTokens > tokenBudget) {
      for (const d of decisions) {
        if (d.decision === 'included') {
          d.decision = 'excluded';
          d.reason = 'token_budget';
          d.token_cost = 0;
        }
      }
    }

    // 6. Persist decisions (one row per atom considered)
    if (decisions.length > 0) {
      const rows = decisions.map(d => ({
        project_id: projectId,
        session_id: sessionId,
        inject_run_id: runId,
        atom_id: d.atom_id,
        decision: d.decision,
        reason: d.reason,
        token_cost: d.token_cost,
      }));
      await supabase.from('knowledge_injection_decisions').insert(rows);
    }

    const included = decisions.filter(d => d.decision === 'included').length;
    const excluded = decisions.filter(d => d.decision === 'excluded').length;

    // 7. Close pipeline run
    if (runId) {
      await supabase
        .from('knowledge_pipeline_runs')
        .update({
          status: 'succeeded',
          completed_at: new Date().toISOString(),
          counts: { included, excluded, total: decisions.length, token_estimate: view.token_estimate },
        })
        .eq('id', runId);
    }

    // 8. Return body for prompt assembly (empty when nothing is stable yet)
    const finalBody = effectiveTokens > tokenBudget ? '' : view.body_md ?? '';
    return {
      bodyMd: finalBody,
      tokenEstimate: finalBody ? view.token_estimate : 0,
      runId,
      counts: { included, excluded, total: decisions.length },
    };
  } catch (err) {
    if (runId) {
      await supabase
        .from('knowledge_pipeline_runs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        })
        .eq('id', runId);
    }
    // Never let knowledge-layer failures block the compile.
    return { bodyMd: '', tokenEstimate: 0, runId, counts: { included: 0, excluded: 0, total: 0 } };
  }
}

/**
 * Wrap the knowledge prompt view into a labeled section for prompt injection.
 * Kept as a small helper so the wrapping is uniform across callers.
 */
export function formatKnowledgeSection(bodyMd: string): string {
  if (!bodyMd.trim()) return '';
  return `## Knowledge\n\n${bodyMd.trim()}`;
}
