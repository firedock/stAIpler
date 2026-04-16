'use client';

/**
 * VisibleObject contract.
 *
 * Every object the user can see in the knowledge pipeline (log row, atom,
 * handoff, article, prompt line, conflict pair, pipeline run, injection
 * decision) is rendered through <ObjectCard>, conforming to this shape.
 *
 * This contract is the enforcement mechanism for CLAUDE.md's visibility rule:
 * "No durable system effect without a visible artifact, a visible reason, and
 * a visible path back to source."
 *
 * See packages/web/docs/knowledge-v1.md §7.
 */

import { useEffect, useRef, useState } from 'react';

export type VisibleObjectType =
  | 'log'
  | 'atom'
  | 'handoff'
  | 'article'
  | 'prompt_line'
  | 'conflict_pair'
  | 'pipeline_run'
  | 'injection_decision';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface VisibleObjectIdentity {
  id: string;
  type: VisibleObjectType;
  label: string;
  conceptSlug?: string;
}

export interface VisibleObjectStatus {
  value: string;
  tone: StatusTone;
  badge?: string;
}

export interface VisibleObjectProvenance {
  sourceLogIds?: string[];
  sourceDocumentIds?: string[];
  handoffIds?: string[];
  parentAtomId?: string;
  supersededBy?: string;
  extractedFrom?: { sessionId: string; at: string };
}

export interface VisibleObjectExplanation {
  summary: string;
  lastEventAt: string;
  lastEventType: string;
  lastActor: 'system' | 'user';
}

export interface VisibleObjectEffect {
  injectedNow: boolean;
  pinned?: boolean;
  withheldReason?: string;
}

export interface VisibleObjectAction {
  id: string;
  label: string;
  /** Single character, lowercase. Global convention:
   *  a=approve, m=merge, e=edit, r=reject, p=promote, d=demote/deprecate, ?=why */
  shortcut?: string;
  destructive?: boolean;
  onInvoke: () => void | Promise<void>;
}

export interface VisibleObject {
  identity: VisibleObjectIdentity;
  status: VisibleObjectStatus;
  provenance: VisibleObjectProvenance;
  explanation: VisibleObjectExplanation;
  effect: VisibleObjectEffect;
  actions: VisibleObjectAction[];
}

// ---------------------------------------------------------------------------
// Rendering helpers

const toneStyles: Record<StatusTone, { bg: string; text: string; border: string }> = {
  neutral: { bg: 'bg-slate-500/10', text: 'text-slate-200', border: 'border-slate-500/25' },
  info:    { bg: 'bg-indigo-500/10', text: 'text-indigo-200', border: 'border-indigo-500/25' },
  success: { bg: 'bg-emerald-500/10', text: 'text-emerald-200', border: 'border-emerald-500/25' },
  warning: { bg: 'bg-amber-500/10', text: 'text-amber-200', border: 'border-amber-500/25' },
  danger:  { bg: 'bg-rose-500/10', text: 'text-rose-200', border: 'border-rose-500/25' },
};

const typeLabel: Record<VisibleObjectType, string> = {
  log: 'Log',
  atom: 'Atom',
  handoff: 'Handoff',
  article: 'Article',
  prompt_line: 'Prompt line',
  conflict_pair: 'Conflict',
  pipeline_run: 'Pipeline run',
  injection_decision: 'Injection',
};

function formatAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function provenanceCount(p: VisibleObjectProvenance): number {
  return (
    (p.sourceLogIds?.length ?? 0) +
    (p.sourceDocumentIds?.length ?? 0) +
    (p.handoffIds?.length ?? 0) +
    (p.parentAtomId ? 1 : 0) +
    (p.supersededBy ? 1 : 0) +
    (p.extractedFrom ? 1 : 0)
  );
}

// ---------------------------------------------------------------------------
// Card

export interface ObjectCardProps {
  object: VisibleObject;
  /** When true, the card captures keyboard shortcuts while focused/hovered. */
  keyboardEnabled?: boolean;
}

export function ObjectCard({ object, keyboardEnabled = true }: ObjectCardProps) {
  const [whyOpen, setWhyOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const [isActive, setIsActive] = useState(false);

  // Keyboard shortcuts — only fire when this card is hovered or focused.
  useEffect(() => {
    if (!keyboardEnabled || !isActive) return;

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (target?.isContentEditable) return;

      if (e.key === '?') {
        e.preventDefault();
        setWhyOpen(v => !v);
        return;
      }

      const action = object.actions.find(a => a.shortcut && a.shortcut === e.key.toLowerCase());
      if (action) {
        e.preventDefault();
        void action.onInvoke();
      }
    }

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboardEnabled, isActive, object.actions]);

  const tone = toneStyles[object.status.tone];
  const provCount = provenanceCount(object.provenance);

  return (
    <div
      ref={cardRef}
      tabIndex={0}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={() => setIsActive(false)}
      onFocus={() => setIsActive(true)}
      onBlur={() => setIsActive(false)}
      className={`rounded-lg border border-white/10 bg-white/[0.03] p-3 transition focus:outline-none focus:ring-1 focus:ring-purple-400/50 ${isActive ? 'border-white/20' : ''}`}
      data-visible-object-type={object.identity.type}
      data-visible-object-id={object.identity.id}
    >
      {/* Row 1: identity + status */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {typeLabel[object.identity.type]}
            </span>
            {object.identity.conceptSlug && (
              <span className="text-[10px] text-slate-500">· {object.identity.conceptSlug}</span>
            )}
          </div>
          <div className="text-sm text-slate-100 leading-snug break-words">
            {object.identity.label}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] ${tone.bg} ${tone.text} ${tone.border}`}>
            {object.status.value}
          </span>
          {object.status.badge && (
            <span className="text-[10px] text-slate-400">{object.status.badge}</span>
          )}
        </div>
      </div>

      {/* Row 2: effect strip */}
      <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
        {object.effect.injectedNow ? (
          <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-500/25">
            In context now
          </span>
        ) : object.effect.withheldReason ? (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/25">
            Withheld: {object.effect.withheldReason}
          </span>
        ) : (
          <span className="px-1.5 py-0.5 rounded bg-slate-500/15 text-slate-300 border border-slate-500/25">
            Not injected
          </span>
        )}
        {object.effect.pinned && (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-500/25">
            Pinned
          </span>
        )}
        {provCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-300 border border-white/10">
            {provCount} source{provCount === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Row 3: explanation */}
      <div className="mt-2 text-[11px] text-slate-300 leading-relaxed">
        {object.explanation.summary}
      </div>
      <div className="mt-1 text-[10px] text-slate-500">
        {object.explanation.lastEventType} · {object.explanation.lastActor} · {formatAt(object.explanation.lastEventAt)}
      </div>

      {/* Row 4: actions + why toggle */}
      {(object.actions.length > 0 || true) && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {object.actions.map(action => (
            <button
              key={action.id}
              onClick={() => void action.onInvoke()}
              className={`text-[11px] px-2 py-1 rounded-md border transition ${
                action.destructive
                  ? 'border-rose-500/25 text-rose-200 bg-rose-500/10 hover:bg-rose-500/20'
                  : 'border-white/10 text-slate-200 bg-white/[0.04] hover:bg-white/[0.08]'
              }`}
              title={action.shortcut ? `Shortcut: ${action.shortcut}` : undefined}
            >
              {action.label}
              {action.shortcut && (
                <span className="ml-1.5 text-[9px] text-slate-400">{action.shortcut}</span>
              )}
            </button>
          ))}
          <button
            onClick={() => setWhyOpen(v => !v)}
            className="ml-auto text-[11px] text-purple-300 hover:text-purple-200 transition"
            title="Shortcut: ?"
          >
            {whyOpen ? 'Hide why' : 'Why is this here?'}
          </button>
        </div>
      )}

      {/* Row 5: "why is this here" — provenance + explanation detail */}
      {whyOpen && (
        <div className="mt-3 pt-3 border-t border-white/10 text-[11px] text-slate-300 space-y-2">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Why it&apos;s at this status
            </div>
            <p className="leading-relaxed">{object.explanation.summary}</p>
          </div>

          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-1">
              Provenance
            </div>
            <ul className="space-y-0.5 text-[11px]">
              {object.provenance.extractedFrom && (
                <li>
                  Extracted from session{' '}
                  <code className="text-slate-200">{object.provenance.extractedFrom.sessionId}</code>{' '}
                  at {formatAt(object.provenance.extractedFrom.at)}
                </li>
              )}
              {(object.provenance.sourceLogIds ?? []).length > 0 && (
                <li>
                  Source logs:{' '}
                  {(object.provenance.sourceLogIds ?? []).map(id => (
                    <code key={id} className="text-slate-200 mr-1">{id}</code>
                  ))}
                </li>
              )}
              {(object.provenance.sourceDocumentIds ?? []).length > 0 && (
                <li>
                  Source documents:{' '}
                  {(object.provenance.sourceDocumentIds ?? []).map(id => (
                    <code key={id} className="text-slate-200 mr-1">{id}</code>
                  ))}
                </li>
              )}
              {(object.provenance.handoffIds ?? []).length > 0 && (
                <li>
                  Handoffs:{' '}
                  {(object.provenance.handoffIds ?? []).map(id => (
                    <code key={id} className="text-slate-200 mr-1">{id}</code>
                  ))}
                </li>
              )}
              {object.provenance.parentAtomId && (
                <li>Parent atom: <code className="text-slate-200">{object.provenance.parentAtomId}</code></li>
              )}
              {object.provenance.supersededBy && (
                <li>Superseded by: <code className="text-slate-200">{object.provenance.supersededBy}</code></li>
              )}
              {provCount === 0 && <li className="text-slate-500">No provenance recorded.</li>}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
