'use client';

import { useState, useEffect } from 'react';

/**
 * Session Context Panel — right-side panel showing everything the agent
 * is using in the current session: instruction layers, source documents,
 * operational wisdom (handoffs), conflicts, gaps, and the compiled system prompt.
 *
 * Fulfills the visibility requirement: if a process is running or data is
 * flowing into the agent, the user can see it here in real time.
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
  'fact': { icon: '●', color: 'text-emerald-400' },
  'inference': { icon: '◆', color: 'text-blue-400' },
  'heuristic': { icon: '▲', color: 'text-amber-400' },
  'unresolved-question': { icon: '?', color: 'text-purple-400' },
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

type Section = 'overview' | 'sources' | 'layers' | 'wisdom' | 'prompt';

interface SessionContextPanelProps {
  projectId: string;
  onClose?: () => void;
}

export function SessionContextPanel({ projectId, onClose }: SessionContextPanelProps) {
  const [context, setContext] = useState<SessionContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [showPromptFull, setShowPromptFull] = useState(false);

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

  if (loading) {
    return (
      <aside className="w-80 border-l border-white/[0.04] bg-[#0a0a14] flex items-center justify-center">
        <p className="text-xs text-slate-600 animate-pulse">Loading session context...</p>
      </aside>
    );
  }

  if (error || !context) {
    return (
      <aside className="w-80 border-l border-white/[0.04] bg-[#0a0a14] p-4">
        <p className="text-xs text-red-400">{error ?? 'No context available'}</p>
      </aside>
    );
  }

  const populatedLayers = context.layers.filter(l => l.hasContent);
  const aiGeneratedCount = context.layers.filter(l => l.status === 'ai-generated').length;
  const sourceGroundedCount = context.layers.filter(l => l.status === 'source-grounded' || l.status === 'mixed').length;

  return (
    <aside className="w-80 border-l border-white/[0.04] bg-[#0a0a14] flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-300">Session Context</h3>
          </div>
          <p className="text-[9px] text-slate-700 mt-0.5">What your agent is using</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-600 hover:text-slate-400 transition">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Tab nav */}
      <div className="flex border-b border-white/[0.04]">
        {(['overview', 'sources', 'layers', 'wisdom', 'prompt'] as Section[]).map(s => (
          <button
            key={s}
            onClick={() => setSection(s)}
            className={`flex-1 px-1.5 py-2 text-[10px] font-medium uppercase tracking-wide transition ${
              section === s ? 'text-purple-300 border-b border-purple-500' : 'text-slate-600 hover:text-slate-400'
            }`}
          >
            {s === 'wisdom' ? 'Wisdom' : s}
          </button>
        ))}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {section === 'overview' && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1.5">Agent expertise</div>
              <div className="flex flex-wrap gap-1">
                {sourceGroundedCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">{sourceGroundedCount} from your docs</span>}
                {aiGeneratedCount > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">{aiGeneratedCount} AI-generated</span>}
                {context.gaps.length > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{context.gaps.length} gaps</span>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setSection('sources')} className="bg-white/[0.02] hover:bg-white/[0.04] rounded-lg p-2.5 text-left transition">
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">Sources</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">{context.sourceDocuments.length}</div>
              </button>
              <button onClick={() => setSection('layers')} className="bg-white/[0.02] hover:bg-white/[0.04] rounded-lg p-2.5 text-left transition">
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">Active layers</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">{populatedLayers.length} / 12</div>
              </button>
              <button onClick={() => setSection('wisdom')} className="bg-white/[0.02] hover:bg-white/[0.04] rounded-lg p-2.5 text-left transition">
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">Wisdom</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">{context.handoffs.length}</div>
              </button>
              <button onClick={() => setSection('prompt')} className="bg-white/[0.02] hover:bg-white/[0.04] rounded-lg p-2.5 text-left transition">
                <div className="text-[9px] text-slate-600 uppercase tracking-wide">Tokens</div>
                <div className="text-base font-semibold text-slate-200 mt-0.5">~{context.tokenEstimate.toLocaleString()}</div>
              </button>
            </div>

            {context.conflicts.length > 0 && (
              <div>
                <div className="text-[9px] text-amber-400/80 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                  {context.conflicts.length} unresolved conflict{context.conflicts.length > 1 ? 's' : ''}
                </div>
                <div className="text-[10px] text-slate-500">Review conflicts from the project dashboard</div>
              </div>
            )}

            {/* Trust hierarchy legend */}
            <div className="pt-3 border-t border-white/[0.04]">
              <div className="text-[9px] text-slate-600 uppercase tracking-wide mb-1.5">Trust hierarchy</div>
              <div className="space-y-1">
                <div className="text-[10px] text-emerald-400/70">● Your documents (highest)</div>
                <div className="text-[10px] text-amber-400/70">● Operational wisdom (decaying)</div>
                <div className="text-[10px] text-slate-500/70">● AI-generated fills (lowest)</div>
              </div>
            </div>
          </div>
        )}

        {section === 'sources' && (
          <div className="p-4">
            {context.sourceDocuments.length === 0 ? (
              <p className="text-xs text-slate-600">No source documents connected yet.</p>
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
                    <div className="text-[10px] font-semibold text-slate-400 mb-1">{PROVIDER_LABELS[provider] ?? provider}</div>
                    <div className="space-y-1">
                      {docs.map(doc => (
                        <div key={doc.id} className="px-2 py-1.5 rounded bg-white/[0.02] flex items-center justify-between">
                          <span className="text-[11px] text-slate-300 truncate flex-1 mr-2">{doc.title}</span>
                          <span className="text-[9px] text-slate-600">{(doc.contentLength / 1000).toFixed(1)}K</span>
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
              <div key={l.layer} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[l.layer] ?? '#64748b', opacity: l.hasContent ? 1 : 0.3 }} />
                  <span className={`text-[11px] capitalize ${l.hasContent ? 'text-slate-300' : 'text-slate-600'}`}>{l.layer}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {l.status === 'source-grounded' && <span className="text-[9px] text-emerald-400">docs</span>}
                  {l.status === 'ai-generated' && <span className="text-[9px] text-amber-400">AI</span>}
                  {l.status === 'mixed' && <span className="text-[9px] text-blue-400">mixed</span>}
                  {!l.hasContent && <span className="text-[9px] text-slate-700">empty</span>}
                  {l.candidateCount > 0 && <span className="text-[9px] text-slate-600">{l.candidateCount}</span>}
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'wisdom' && (
          <div className="p-4">
            {context.handoffs.length === 0 ? (
              <p className="text-xs text-slate-600">No operational wisdom active for this session.</p>
            ) : (
              <div className="space-y-2">
                {context.handoffs.map(h => {
                  const cfg = CLASSIFICATION_ICONS[h.classification];
                  return (
                    <div key={h.id} className="px-2 py-2 rounded bg-white/[0.02]">
                      <div className="flex items-start gap-2">
                        <span className={`text-xs ${cfg.color}`}>{cfg.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-slate-300 leading-relaxed">{h.content}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[9px] text-slate-600">{Math.round(h.effectiveConfidence * 100)}% confidence</span>
                            {h.reinforcementCount > 0 && (
                              <span className="text-[9px] text-emerald-400/60">reinforced {h.reinforcementCount}x</span>
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
              <p className="text-xs text-slate-600">No compiled system prompt yet.</p>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="text-[9px] text-slate-600 uppercase tracking-wide">Compiled prompt</div>
                  <button
                    onClick={() => setShowPromptFull(!showPromptFull)}
                    className="text-[10px] text-purple-400/60 hover:text-purple-400 transition"
                  >
                    {showPromptFull ? 'Collapse' : 'Expand'}
                  </button>
                </div>
                <p className="text-[9px] text-slate-700 mb-2">~{context.tokenEstimate.toLocaleString()} tokens</p>
                <pre className={`text-[10px] font-mono text-slate-400 whitespace-pre-wrap break-words bg-white/[0.02] rounded p-2 ${showPromptFull ? '' : 'max-h-48 overflow-hidden'}`}>
                  {showPromptFull ? context.systemPrompt : context.systemPrompt.slice(0, 800) + (context.systemPrompt.length > 800 ? '...' : '')}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
