import type { VisibleObject, StatusTone } from '@/components/visible-object';

/**
 * Adapters converting raw DB rows into the VisibleObject contract.
 * No UI component reads raw rows directly — everything goes through here.
 * See packages/web/docs/knowledge-v1.md §7.
 */

export interface AtomRow {
  id: string;
  concept_slug: string;
  atom_type: string;
  content: string;
  status: 'candidate' | 'provisional' | 'stable' | 'deprecated' | 'contradicted';
  source_authority: 'assistant' | 'user' | 'source_document' | 'mixed';
  authority_breakdown?: Record<string, number> | null;
  review_state: 'pending' | 'approved' | 'rejected' | 'edited' | 'deferred';
  is_pinned: boolean;
  source_log_ids?: string[];
  source_document_ids?: string[];
  handoff_ids?: string[];
  parent_atom_id?: string | null;
  superseded_by?: string | null;
  reinforcement_count: number;
  distinct_session_count: number;
  created_at: string;
  last_reinforced_at?: string | null;
  promoted_at?: string | null;
  deprecated_at?: string | null;
}

export interface AtomEventRow {
  id: string;
  event_type: string;
  actor: 'system' | 'user';
  trigger_ref: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

const statusTone: Record<AtomRow['status'], StatusTone> = {
  candidate: 'info',
  provisional: 'warning',
  stable: 'success',
  deprecated: 'neutral',
  contradicted: 'danger',
};

function explainStatus(atom: AtomRow): string {
  switch (atom.status) {
    case 'candidate':
      if (atom.review_state === 'pending') return 'Candidate awaiting review.';
      return `Candidate (${atom.source_authority}).`;
    case 'provisional':
      if (atom.is_pinned) return 'Pinned into the prompt view despite being provisional.';
      if (atom.source_authority === 'user') return 'Auto-promoted: user-asserted.';
      if (atom.source_authority === 'source_document') return 'Auto-promoted: grounded in source documents.';
      if (atom.reinforcement_count >= 3) return `Auto-promoted after ${atom.reinforcement_count}× reinforcement across ${atom.distinct_session_count} sessions.`;
      return 'Provisional.';
    case 'stable':
      return 'Approved as stable by user.';
    case 'deprecated':
      return atom.superseded_by ? 'Deprecated — superseded by a newer atom.' : 'Deprecated by user.';
    case 'contradicted':
      return 'Flagged contradicted; awaiting resolution.';
  }
}

export function atomToVisible(
  atom: AtomRow,
  options: {
    injectedNow?: boolean;
    withheldReason?: string;
    latestEvent?: AtomEventRow | null;
    actions?: VisibleObject['actions'];
  } = {},
): VisibleObject {
  const latest = options.latestEvent;
  return {
    identity: {
      id: atom.id,
      type: 'atom',
      label: atom.content,
      conceptSlug: atom.concept_slug,
    },
    status: {
      value: atom.status,
      tone: statusTone[atom.status],
      badge: `${atom.source_authority}${atom.is_pinned ? ' · pinned' : ''}`,
    },
    provenance: {
      sourceLogIds: atom.source_log_ids ?? [],
      sourceDocumentIds: atom.source_document_ids ?? [],
      handoffIds: atom.handoff_ids ?? [],
      parentAtomId: atom.parent_atom_id ?? undefined,
      supersededBy: atom.superseded_by ?? undefined,
    },
    explanation: {
      summary: explainStatus(atom),
      lastEventAt: latest?.created_at ?? atom.promoted_at ?? atom.created_at,
      lastEventType: latest?.event_type ?? 'created',
      lastActor: latest?.actor ?? 'system',
    },
    effect: {
      injectedNow: options.injectedNow ?? false,
      pinned: atom.is_pinned,
      withheldReason: options.withheldReason,
    },
    actions: options.actions ?? [],
  };
}

export interface PipelineRunRow {
  id: string;
  stage: 'extract' | 'reconcile' | 'review' | 'promote' | 'render' | 'inject';
  session_id: string | null;
  status: 'running' | 'succeeded' | 'failed';
  counts: Record<string, unknown>;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

export function pipelineRunToVisible(run: PipelineRunRow): VisibleObject {
  const tone: StatusTone =
    run.status === 'succeeded' ? 'success' : run.status === 'failed' ? 'danger' : 'info';
  const countsSummary = Object.entries(run.counts ?? {})
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  return {
    identity: {
      id: run.id,
      type: 'pipeline_run',
      label: `${run.stage} — ${run.status}${countsSummary ? ' — ' + countsSummary : ''}`,
    },
    status: { value: run.status, tone },
    provenance: run.session_id
      ? { extractedFrom: { sessionId: run.session_id, at: run.started_at } }
      : {},
    explanation: {
      summary: run.error ?? (run.status === 'running' ? 'Still running.' : 'Completed.'),
      lastEventAt: run.completed_at ?? run.started_at,
      lastEventType: run.status,
      lastActor: 'system',
    },
    effect: { injectedNow: false },
    actions: [],
  };
}

export interface InjectionDecisionRow {
  id: string;
  atom_id: string;
  decision: 'included' | 'excluded' | 'pinned';
  reason: string | null;
  token_cost: number;
  compiled_at: string;
}

export function decisionToVisible(
  dec: InjectionDecisionRow,
  atom: AtomRow,
): VisibleObject {
  const included = dec.decision === 'included' || dec.decision === 'pinned';
  return {
    identity: {
      id: `${dec.id}:${atom.id}`,
      type: 'injection_decision',
      label: atom.content,
      conceptSlug: atom.concept_slug,
    },
    status: {
      value: dec.decision,
      tone: included ? 'success' : 'warning',
      badge: dec.reason ?? undefined,
    },
    provenance: {
      sourceLogIds: atom.source_log_ids ?? [],
      sourceDocumentIds: atom.source_document_ids ?? [],
      handoffIds: atom.handoff_ids ?? [],
      supersededBy: atom.superseded_by ?? undefined,
    },
    explanation: {
      summary: included
        ? `Included in this compile (${dec.token_cost} tokens).`
        : `Excluded: ${dec.reason ?? 'no reason recorded'}.`,
      lastEventAt: dec.compiled_at,
      lastEventType: dec.decision,
      lastActor: 'system',
    },
    effect: {
      injectedNow: included,
      pinned: dec.decision === 'pinned',
      withheldReason: included ? undefined : dec.reason ?? undefined,
    },
    actions: [],
  };
}
