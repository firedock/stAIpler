'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ObjectCard } from '@/components/visible-object';
import { atomToVisible, decisionToVisible, type AtomRow, type InjectionDecisionRow } from '@/lib/knowledge/to-visible';

/**
 * Session Context Panel — right-side panel showing everything the agent
 * is using in the current session: instruction layers, source documents,
 * operational wisdom (handoffs), conflicts, gaps, compiled system prompt,
 * and today's AI communication logs.
 *
 * Resizable (drag the left edge) and pop-out capable (opens a dedicated
 * route in a new window) so power users can keep context visible while
 * working elsewhere.
 */

const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444', context: '#3b82f6', evals: '#6b7280',
  examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
  memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
  skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
};

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  'google-docs': 'Google Drive',
  'file-upload': 'File Upload',
  url: 'URL Import',
  notion: 'Notion',
  'ai-generated': 'AI Generated',
};

const CLASSIFICATION_ICONS: Record<string, { icon: string; color: string }> = {
  'fact': { icon: '●', color: 'text-emerald-300' },
  'inference': { icon: '◆', color: 'text-blue-300' },
  'heuristic': { icon: '▲', color: 'text-amber-300' },
  'unresolved-question': { icon: '?', color: 'text-purple-300' },
};

interface SessionContext {
  sourceDocuments: { id: string; title: string; provider: string; contentLength: number }[];
  layers: { layer: string; status: string; candidateCount: number; fileCount: number; hasContent: boolean }[];
  handoffs: { id: string; classification: string; content: string; effectiveConfidence: number; reinforcementCount: number }[];
  conflicts: { description: string; resolution: string }[];
  gaps: string[];
  systemPrompt: string | null;
  tokenEstimate: number;
}

interface LogEntry {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  mode: string | null;
  provider: string | null;
  model: string | null;
  token_estimate: number | null;
  created_at: string;
}

type Section = 'overview' | 'sources' | 'layers' | 'wisdom' | 'prompt' | 'logs' | 'knowledge';

interface InjectionState {
  run: { id: string; started_at: string; completed_at: string | null; status: string; counts: Record<string, unknown> } | null;
  decisions: InjectionDecisionRow[];
  atoms: AtomRow[];
  promptView: { body_md: string; token_estimate: number; atom_ids: string[]; rendered_at: string } | null;
}

interface SessionContextPanelProps {
  projectId: string;
  onClose?: () => void;
  /** When true, renders full-width (used on the pop-out route). */
  standalone?: boolean;
}

const MIN_WIDTH = 280;
const MAX_WIDTH = 900;
const DEFAULT_WIDTH = 384;
const WIDTH_STORAGE_KEY = 'staipler:context-panel-width';

export function SessionContextPanel({ projectId, onClose, standalone = false }: SessionContextPanelProps) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [showPromptFull, setShowPromptFull] = useState(false);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsError, setLogsError] = useState<string | null>(null);

  const [knowledge, setKnowledge] = useState<InjectionState | null>(null);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);

  // Initialize to DEFAULT_WIDTH on both server and first client render to avoid
  // a hydration mismatch, then hydrate the persisted value from localStorage
  // in an effect (client-only) once the tree is mounted.
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  useEffect(() => {
    if (standalone) return;
    const stored = Number(window.localStorage.getItem(WIDTH_STORAGE_KEY));
    if (stored >= MIN_WIDTH && stored <= MAX_WIDTH && stored !== DEFAULT_WIDTH) {
      setWidth(stored);
    }
  }, [standalone]);
  const draggingRef = useRef(false);

  useEffect(() => {
    async function fetchContext() {
      try {
        const res = await fetch(`/api/session-context?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setContext(data);
        } else {
          const data = await res.json();
          setError(data.error ?? 'Failed to load session context');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not connect to server');
      }
      setLoading(false);
    }
    fetchContext();
  }, [projectId]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    setLogsError(null);
    try {
      const res = await fetch(`/api/project-logs?projectId=${projectId}`);
      const data = await res.json();
      if (!res.ok) {
        setLogsError(data.error ?? 'Failed to load logs');
      } else {
        setLogs(data.logs ?? []);
      }
    } catch (err) {
      setLogsError(err instanceof Error ? err.message : 'Could not load logs');
    }
    setLogsLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (section === 'logs') loadLogs();
  }, [section, loadLogs]);

  const loadKnowledge = useCallback(async () => {
    setKnowledgeLoading(true);
    setKnowledgeError(null);
    try {
      const res = await fetch(`/api/knowledge/injection-state?projectId=${projectId}`);
      const data = await res.json();
      if (!res.ok) setKnowledgeError(data.error ?? 'Failed to load knowledge state');
      else setKnowledge(data as InjectionState);
    } catch (err) {
      setKnowledgeError(err instanceof Error ? err.message : 'Could not load knowledge state');
    }
    setKnowledgeLoading(false);
  }, [projectId]);

  useEffect(() => {
    if (section === 'knowledge') loadKnowledge();
  }, [section, loadKnowledge]);

  // Drag to resize
  useEffect(() => {
    if (standalone) return;
    function onMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      const newWidth = Math.min(Math.max(window.innerWidth - e.clientX, MIN_WIDTH), MAX_WIDTH);
      setWidth(newWidth);
    }
    function onUp() {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
      }
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [width, standalone]);

  function startDrag(e: React.MouseEvent) {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  function popOut() {
    const url = `/dashboard/context/${projectId}`;
    window.open(url, 'staipler-context', `width=${Math.max(width, 520)},height=900`);
    onClose?.();
  }

  if (loading) {
    return (
      <aside
        className={`${standalone ? 'w-full' : 'border-l border-white/10'} bg-[#0a0a14] flex items-center justify-center`}
        style={standalone ? undefined : { width }}
      >
        <p className="text-xs text-slate-400 animate-pulse">Loading session context...</p>
      </aside>
    );
  }

  if (error || !context) {
    return (
      <aside
        className={`${standalone ? 'w-full' : 'border-l border-white/10'} bg-[#0a0a14] p-4`}
        style={standalone ? undefined : { width }}
      >
        <p className="text-xs text-rose-300">{error ?? 'No context available'}</p>
      </aside>
    );
  }

  const populatedLayers = context.layers.filter(l => l.hasContent);
  const aiGeneratedCount = context.layers.filter(l => l.status === 'ai-generated').length;
  const sourceGroundedCount = context.layers.filter(l => l.status === 'source-grounded' || l.status === 'mixed').length;

  const sections: Section[] = ['overview', 'sources', 'layers', 'knowledge', 'wisdom', 'prompt', 'logs'];

  return (
    <aside
      className={`relative ${standalone ? 'w-full' : 'border-l border-white/10'} bg-[#0a0a14] flex flex-col h-full`}
      style={standalone ? undefined : { width, minWidth: MIN_WIDTH }}
    >
      {/* Drag handle */}
      {!standalone && (
        <div
          onMouseDown={startDrag}
          className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-purple-500/40 transition z-10"
          title="Drag to resize"
        />
      )}

      {/* Header */}
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-100">Session Context</h3>
          </div>
          <p className="text-[10px] text-slate-400 mt-0.5">What your agent is using</p>
        </div>
        <div className="flex items-center gap-1">
          {!standalone && (
            <button
              onClick={popOut}
              className="p-1 text-slate-300 hover:text-slate-100 transition"
              title="Pop out into a separate window"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7m0-7L10 14m-4-4H3v11h11v-3" />
              </svg>
            </button>
          )}
          {onClose && !standalone && (
            <button onClick={onClose} className="p-1 text-slate-300 hover:text-slate-100 transition" title="Close">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-white/10 overflow-x-auto">
        {sections.map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex-1 min-w-[60px] px-2 py-2 text-[10px] font-semibold uppercase tracking-wide transition ${
              section === s ? 'text-purple-200 border-b-2 border-purple-400' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {section === 'overview' && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-[10px] text-slate-300 uppercase tracking-wide mb-1.5 font-semibold">Agent expertise</div>
              <div className="flex flex-wrap gap-1">
                {sourceGroundedCount > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-200">{sourceGroundedCount} from your docs</span>}
                {aiGeneratedCount > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200">{aiGeneratedCount} AI-generated</span>}
                {context.gaps.length > 0 && <span className="text-[11px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-200">{context.gaps.length} gaps</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSection('sources')} className="bg-white/[0.04] hover:bg-white/[0.08] rounded-lg p-2.5 text-left transition">
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Sources</div>
                <div className="text-base font-semibold text-slate-50 mt-0.5">{context.sourceDocuments.length}</div>
              </button>
              <button onClick={() => setSection('layers')} className="bg-white/[0.04] hover:bg-white/[0.08] rounded-lg p-2.5 text-left transition">
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Active layers</div>
                <div className="text-base font-semibold text-slate-50 mt-0.5">{populatedLayers.length} / 12</div>
              </button>
              <button onClick={() => setSection('wisdom')} className="bg-white/[0.04] hover:bg-white/[0.08] rounded-lg p-2.5 text-left transition">
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Wisdom</div>
                <div className="text-base font-semibold text-slate-50 mt-0.5">{context.handoffs.length}</div>
              </button>
              <button onClick={() => setSection('prompt')} className="bg-white/[0.04] hover:bg-white/[0.08] rounded-lg p-2.5 text-left transition">
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Tokens</div>
                <div className="text-base font-semibold text-slate-50 mt-0.5">~{context.tokenEstimate.toLocaleString()}</div>
              </button>
            </div>

            {context.conflicts.length > 0 && (
              <div>
                <div className="text-[10px] text-amber-300 uppercase tracking-wide mb-1.5 flex items-center gap-1 font-semibold">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  {context.conflicts.length} unresolved conflict{context.conflicts.length > 1 ? 's' : ''}
                </div>
                <div className="text-[11px] text-slate-300">Review conflicts from the project dashboard</div>
              </div>
            )}

            <div className="pt-3 border-t border-white/10">
              <div className="text-[10px] text-slate-300 uppercase tracking-wide mb-1.5 font-semibold">Trust hierarchy</div>
              <div className="space-y-1">
                <div className="text-[11px] text-emerald-200">● Your documents (highest)</div>
                <div className="text-[11px] text-amber-200">● Operational wisdom (decaying)</div>
                <div className="text-[11px] text-slate-300">● AI-generated fills (lowest)</div>
              </div>
            </div>
          </div>
        )}

        {section === 'sources' && (
          <div className="p-4">
            {context.sourceDocuments.length === 0 ? (
              <p className="text-xs text-slate-300">No source documents connected yet.</p>
            ) : (
              <div className="space-y-2">
                {Object.entries(
                  context.sourceDocuments.reduce<Record<string, typeof context.sourceDocuments>>((acc, d) => {
                    if (!acc[d.provider]) acc[d.provider] = [];
                    acc[d.provider].push(d);
                    return acc;
                  }, {})
                ).map(([provider, docs]) => (
                  <div key={provider}>
                    <div className="text-[11px] font-semibold text-slate-200 mb-1">{PROVIDER_LABELS[provider] ?? provider}</div>
                    <div className="space-y-1">
                      {docs.map(doc => (
                        <div key={doc.id} className="px-2 py-1.5 rounded bg-white/[0.04] flex items-center justify-between">
                          <span className="text-[12px] text-slate-100 truncate flex-1 mr-2">{doc.title}</span>
                          <span className="text-[10px] text-slate-400">{(doc.contentLength / 1000).toFixed(1)}K</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {section === 'layers' && (
          <div className="p-4 space-y-1">
            {context.layers.map(l => (
              <div key={l.layer} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.04]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[l.layer] ?? '#94a3b8', opacity: l.hasContent ? 1 : 0.4 }} />
                  <span className={`text-[12px] capitalize ${l.hasContent ? 'text-slate-100' : 'text-slate-400'}`}>{l.layer}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {l.status === 'source-grounded' && <span className="text-[10px] text-emerald-300">docs</span>}
                  {l.status === 'ai-generated' && <span className="text-[10px] text-amber-300">AI</span>}
                  {l.status === 'mixed' && <span className="text-[10px] text-blue-300">mixed</span>}
                  {!l.hasContent && <span className="text-[10px] text-slate-500">empty</span>}
                  {l.candidateCount > 0 && <span className="text-[10px] text-slate-400">{l.candidateCount}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'wisdom' && (
          <div className="p-4">
            {context.handoffs.length === 0 ? (
              <p className="text-xs text-slate-300">No operational wisdom active for this session.</p>
            ) : (
              <div className="space-y-2">
                {context.handoffs.map(h => {
                  const cfg = CLASSIFICATION_ICONS[h.classification];
                  return (
                    <div key={h.id} className="px-2 py-2 rounded bg-white/[0.04]">
                      <div className="flex items-start gap-2">
                        <span className={`text-xs ${cfg.color}`}>{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[12px] text-slate-100 leading-relaxed">{h.content}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] text-slate-300">{Math.round(h.effectiveConfidence * 100)}% confidence</span>
                            {h.reinforcementCount > 0 && (
                              <span className="text-[10px] text-emerald-300">reinforced {h.reinforcementCount}x</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {section === 'prompt' && (
          <div className="p-4">
            {!context.systemPrompt ? (
              <p className="text-xs text-slate-300">No compiled system prompt yet.</p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Compiled prompt</div>
                  <button
                    onClick={() => setShowPromptFull(!showPromptFull)}
                    className="text-[11px] text-purple-300 hover:text-purple-200 transition"
                  >
                    {showPromptFull ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mb-2">~{context.tokenEstimate.toLocaleString()} tokens</p>
                <pre className={`text-[11px] font-mono text-slate-200 whitespace-pre-wrap break-words bg-white/[0.04] rounded p-2 ${showPromptFull ? '' : 'max-h-48 overflow-hidden'}`}>
                  {showPromptFull ? context.systemPrompt : context.systemPrompt.slice(0, 800) + (context.systemPrompt.length > 800 ? '...' : '')}
                </pre>
              </div>
            )}
          </div>
        )}

        {section === 'knowledge' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Knowledge layer</div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  What the compiler injected this compile, and what it withheld.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`/dashboard/${projectId}/knowledge`}
                  className="text-[11px] text-purple-300 hover:text-purple-200 transition"
                >
                  Pipeline →
                </a>
                <button
                  onClick={loadKnowledge}
                  className="text-[11px] text-purple-300 hover:text-purple-200 transition"
                >
                  Refresh
                </button>
              </div>
            </div>

            {knowledgeLoading && <p className="text-xs text-slate-300 animate-pulse">Loading knowledge state…</p>}
            {knowledgeError && <p className="text-xs text-rose-300">{knowledgeError}</p>}

            {!knowledgeLoading && !knowledgeError && knowledge && !knowledge.run && (
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-300">
                No inject run recorded yet. The knowledge layer will light up here on the next compile.
              </div>
            )}

            {!knowledgeLoading && !knowledgeError && knowledge && knowledge.run && (
              <>
                {(() => {
                  const included = knowledge.decisions.filter(d => d.decision === 'included' || d.decision === 'pinned');
                  const excluded = knowledge.decisions.filter(d => d.decision === 'excluded');
                  const atomById = new Map(knowledge.atoms.map(a => [a.id, a]));
                  const excludedByReason = new Map<string, typeof excluded>();
                  for (const d of excluded) {
                    const key = d.reason ?? 'unknown';
                    if (!excludedByReason.has(key)) excludedByReason.set(key, []);
                    excludedByReason.get(key)!.push(d);
                  }

                  return (
                    <>
                      <section>
                        <div className="text-[10px] text-emerald-300 uppercase tracking-wide font-semibold mb-2">
                          Included · {included.length}
                        </div>
                        {included.length === 0 ? (
                          <p className="text-[11px] text-slate-400">
                            No knowledge atoms are being injected this session.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {included.map(d => {
                              const atom = atomById.get(d.atom_id);
                              if (!atom) return null;
                              return (
                                <ObjectCard
                                  key={d.id}
                                  object={atomToVisible(atom, { injectedNow: true })}
                                />
                              );
                            })}
                          </div>
                        )}
                      </section>

                      <section>
                        <div className="text-[10px] text-amber-300 uppercase tracking-wide font-semibold mb-2">
                          Withheld · {excluded.length}
                        </div>
                        {excluded.length === 0 ? (
                          <p className="text-[11px] text-slate-400">
                            Every eligible atom is in context.
                          </p>
                        ) : (
                          <div className="space-y-3">
                            {Array.from(excludedByReason.entries()).map(([reason, items]) => (
                              <div key={reason}>
                                <div className="text-[10px] text-slate-400 mb-1">
                                  {reason} · {items.length}
                                </div>
                                <div className="space-y-2">
                                  {items.map(d => {
                                    const atom = atomById.get(d.atom_id);
                                    if (!atom) return null;
                                    return (
                                      <ObjectCard
                                        key={d.id}
                                        object={decisionToVisible(d, atom)}
                                      />
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </section>

                      <div className="pt-3 border-t border-white/10 text-[10px] text-slate-400">
                        Last inject run: {new Date(knowledge.run.started_at).toLocaleString()}
                        {knowledge.promptView && (
                          <> · prompt view ~{knowledge.promptView.token_estimate} tokens</>
                        )}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {section === 'logs' && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[10px] text-slate-300 uppercase tracking-wide font-semibold">Today&apos;s AI communication</div>
                <p className="text-[10px] text-slate-400 mt-0.5">{new Date().toLocaleDateString()}</p>
              </div>
              <button
                onClick={loadLogs}
                className="text-[11px] text-purple-300 hover:text-purple-200 transition"
                title="Refresh"
              >
                Refresh
              </button>
            </div>

            {logsLoading && <p className="text-xs text-slate-300 animate-pulse">Loading logs...</p>}
            {logsError && <p className="text-xs text-rose-300">{logsError}</p>}
            {!logsLoading && !logsError && logs.length === 0 && (
              <p className="text-xs text-slate-300">No AI communication logged today yet. Send a message in the chat to start.</p>
            )}

            {logs.length > 0 && (
              <div className="space-y-2">
                {logs.map(log => {
                  const isUser = log.role === 'user';
                  const time = new Date(log.created_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
                  return (
                    <div key={log.id} className={`px-2 py-2 rounded ${isUser ? 'bg-indigo-500/[0.08] border border-indigo-500/20' : 'bg-white/[0.04] border border-white/10'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[10px] font-semibold uppercase tracking-wide ${isUser ? 'text-indigo-200' : 'text-purple-200'}`}>
                          {isUser ? 'You' : 'Agent'}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                          {log.model && <span>{log.model}</span>}
                          <span>{time}</span>
                        </div>
                      </div>
                      <p className="text-[11px] text-slate-100 leading-relaxed whitespace-pre-wrap break-words">
                        {log.content.length > 400 ? log.content.slice(0, 400) + '…' : log.content}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
