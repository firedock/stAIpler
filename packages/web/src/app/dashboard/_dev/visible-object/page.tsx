'use client';

import { ObjectCard, type VisibleObject } from '@/components/visible-object';

/**
 * VisibleObject contract demo page.
 *
 * Renders one card per object type so the contract is reviewable at a glance.
 * Protected by dashboard auth layout; intended for internal development.
 */

const mocks: VisibleObject[] = [
  {
    identity: { id: 'log-123', type: 'log', label: 'User: "The compiler should favor source docs over assistant synthesis."' },
    status: { value: 'user', tone: 'info' },
    provenance: { extractedFrom: { sessionId: 'sess-a1', at: new Date().toISOString() } },
    explanation: {
      summary: 'Raw message captured during session sess-a1.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'logged',
      lastActor: 'user',
    },
    effect: { injectedNow: false },
    actions: [
      { id: 'open', label: 'Open transcript', onInvoke: () => alert('Open transcript') },
    ],
  },
  {
    identity: {
      id: 'atom-1',
      type: 'atom',
      label: 'Compiled knowledge never overrides source-grounded context.',
      conceptSlug: 'trust-hierarchy',
    },
    status: { value: 'stable', tone: 'success' },
    provenance: {
      sourceLogIds: ['log-123', 'log-148'],
      sourceDocumentIds: ['doc-claude-md'],
      extractedFrom: { sessionId: 'sess-a1', at: new Date().toISOString() },
    },
    explanation: {
      summary: 'Promoted to stable by user after reinforcement across 4 sessions.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'user_approved',
      lastActor: 'user',
    },
    effect: { injectedNow: true, pinned: true },
    actions: [
      { id: 'edit', label: 'Edit', shortcut: 'e', onInvoke: () => alert('Edit atom') },
      { id: 'deprecate', label: 'Deprecate', shortcut: 'd', destructive: true, onInvoke: () => alert('Deprecate atom') },
    ],
  },
  {
    identity: { id: 'handoff-7', type: 'handoff', label: 'Session closed with an unresolved question about pgvector indexing thresholds.', conceptSlug: 'pgvector-tuning' },
    status: { value: 'active', tone: 'warning', badge: '72% confidence' },
    provenance: { extractedFrom: { sessionId: 'sess-a1', at: new Date().toISOString() } },
    explanation: {
      summary: 'Handoff created at session close; not yet promoted to atom candidate.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'handoff_created',
      lastActor: 'system',
    },
    effect: { injectedNow: true },
    actions: [
      { id: 'promote', label: 'Promote to atom', shortcut: 'p', onInvoke: () => alert('Promote to atom candidate') },
      { id: 'dismiss', label: 'Dismiss', shortcut: 'r', destructive: true, onInvoke: () => alert('Dismiss handoff') },
    ],
  },
  {
    identity: { id: 'article-42', type: 'article', label: 'Trust hierarchy', conceptSlug: 'trust-hierarchy' },
    status: { value: 'rendered', tone: 'neutral', badge: '6 atoms' },
    provenance: {},
    explanation: {
      summary: 'Rendered deterministically from 6 stable atoms.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'render',
      lastActor: 'system',
    },
    effect: { injectedNow: false },
    actions: [
      { id: 'view', label: 'View markdown', onInvoke: () => alert('Open article') },
    ],
  },
  {
    identity: { id: 'prompt-line-9', type: 'prompt_line', label: '- Compiled knowledge is supplemental, never authoritative over user docs.', conceptSlug: 'trust-hierarchy' },
    status: { value: 'included', tone: 'success' },
    provenance: { parentAtomId: 'atom-1' },
    explanation: {
      summary: 'Line from compact prompt view, sourced from stable atom atom-1.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'injected',
      lastActor: 'system',
    },
    effect: { injectedNow: true },
    actions: [
      { id: 'goto-atom', label: 'Go to atom', onInvoke: () => alert('Jump to atom-1') },
    ],
  },
  {
    identity: { id: 'conflict-3', type: 'conflict_pair', label: 'atom-1 and atom-58 make contradictory claims about memory decay.', conceptSlug: 'memory-decay' },
    status: { value: 'unresolved', tone: 'danger', badge: 'similarity 0.91' },
    provenance: { parentAtomId: 'atom-1' },
    explanation: {
      summary: 'Reconciler found near-duplicates with divergent claims. No auto-merge.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'similar_detected',
      lastActor: 'system',
    },
    effect: { injectedNow: false, withheldReason: 'contradicted' },
    actions: [
      { id: 'merge', label: 'Merge', shortcut: 'm', onInvoke: () => alert('Merge') },
      { id: 'keep-both', label: 'Keep both', shortcut: 'a', onInvoke: () => alert('Keep both') },
      { id: 'reject', label: 'Reject new', shortcut: 'r', destructive: true, onInvoke: () => alert('Reject') },
    ],
  },
  {
    identity: { id: 'run-1001', type: 'pipeline_run', label: 'extract — session sess-a1 produced 4 candidates' },
    status: { value: 'succeeded', tone: 'success' },
    provenance: { extractedFrom: { sessionId: 'sess-a1', at: new Date().toISOString() } },
    explanation: {
      summary: 'Completed in 2.1s. Counts: { candidates: 4, skipped: 12 }.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'completed',
      lastActor: 'system',
    },
    effect: { injectedNow: false },
    actions: [
      { id: 'open-run', label: 'Open run', onInvoke: () => alert('Open run detail') },
    ],
  },
  {
    identity: { id: 'decision-77', type: 'injection_decision', label: 'atom-58 excluded (superseded)', conceptSlug: 'memory-decay' },
    status: { value: 'excluded', tone: 'warning' },
    provenance: { supersededBy: 'atom-1' },
    explanation: {
      summary: 'Newer stable atom on the same concept won. Deprecation reason: superseded.',
      lastEventAt: new Date().toISOString(),
      lastEventType: 'excluded',
      lastActor: 'system',
    },
    effect: { injectedNow: false, withheldReason: 'superseded' },
    actions: [
      { id: 'goto-winner', label: 'Go to winner', onInvoke: () => alert('Jump to atom-1') },
    ],
  },
];

export default function VisibleObjectDemoPage() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">VisibleObject — contract demo</h1>
        <p className="text-sm text-slate-400 mt-1">
          One card per object type. This is the only path to rendering a
          knowledge object in the UI. See{' '}
          <code className="text-slate-200">packages/web/docs/knowledge-v1.md</code> §7.
        </p>
        <p className="text-xs text-slate-500 mt-2">
          Hover or focus a card, then press <kbd className="px-1 py-0.5 rounded bg-white/10 text-slate-200">?</kbd> to toggle the &quot;why is this here&quot; panel. Action shortcuts appear next to each button.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {mocks.map(m => (
          <ObjectCard key={m.identity.id} object={m} />
        ))}
      </div>
    </div>
  );
}
