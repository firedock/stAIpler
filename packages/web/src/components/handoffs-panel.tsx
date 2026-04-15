'use client';

import { useState, useEffect } from 'react';

/**
 * Handoffs Panel — shows the project's operational wisdom
 * with full visibility into classification, confidence, decay,
 * reinforcement history, and provenance.
 *
 * Every process visible. No hidden knowledge.
 */

interface HandoffPacket {
  id: string;
  projectId: string;
  classification: 'fact' | 'inference' | 'heuristic' | 'unresolved-question';
  content: string;
  initialConfidence: number;
  effectiveConfidence: number;
  provenance: {
    sessionId: string;
    evidencePaths: string[];
    reasoning: string;
  };
  reinforcementCount: number;
  createdAt: string;
  lastReinforcedAt: string;
  status: 'active' | 'decayed' | 'superseded' | 'resolved';
}

const CLASSIFICATION_CONFIG: Record<string, { label: string; color: string; bgColor: string; icon: string; decayLabel: string }> = {
  'fact': {
    label: 'Fact',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10',
    icon: '●',
    decayLabel: 'Verified — decays slowly (90-day half-life)',
  },
  'inference': {
    label: 'Inference',
    color: 'text-blue-400',
    bgColor: 'bg-blue-500/10',
    icon: '◆',
    decayLabel: 'Derived from evidence — decays moderately (30-day half-life)',
  },
  'heuristic': {
    label: 'Heuristic',
    color: 'text-amber-400',
    bgColor: 'bg-amber-500/10',
    icon: '▲',
    decayLabel: 'Practical shortcut — decays fast unless reinforced (14-day half-life)',
  },
  'unresolved-question': {
    label: 'Open Question',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10',
    icon: '?',
    decayLabel: 'Persists until addressed — never decays',
  },
};

const HALF_LIFE_DAYS: Record<string, number> = {
  'fact': 90,
  'inference': 30,
  'heuristic': 14,
  'unresolved-question': Infinity,
};

const DECAY_THRESHOLD = 0.15;

function daysUntilDecay(classification: string, effective: number, initial: number): string {
  const halfLife = HALF_LIFE_DAYS[classification];
  if (!halfLife || halfLife === Infinity) return 'never';
  if (effective <= DECAY_THRESHOLD) return 'already faded';
  // Solve: threshold = effective * 0.5^(days/halfLife)
  // days = halfLife * log2(effective / threshold)
  const days = Math.round(halfLife * Math.log2(effective / DECAY_THRESHOLD));
  if (days <= 0) return 'fading now';
  if (days === 1) return '~1 day';
  return `~${days} days`;
}

function confidenceBar(initial: number, effective: number, classification: string) {
  const pct = Math.round(effective * 100);
  const decay = initial > 0 ? Math.round((1 - effective / initial) * 100) : 0;
  const barColor = effective >= 0.7 ? 'bg-emerald-500' : effective >= 0.4 ? 'bg-amber-500' : 'bg-red-500';
  const fadeTime = daysUntilDecay(classification, effective, initial);

  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="text-[10px] text-slate-500 shrink-0 text-right">
          {pct}%
          {decay > 0 && <span className="text-red-400/60"> -{decay}%</span>}
        </span>
      </div>
      {classification !== 'unresolved-question' && (
        <div className="text-[9px] text-slate-700 mt-0.5">
          Fades in {fadeTime} · {HALF_LIFE_DAYS[classification]}-day half-life · threshold {Math.round(DECAY_THRESHOLD * 100)}%
        </div>
      )}
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

interface HandoffsPanelProps {
  projectId: string;
}

export function HandoffsPanel({ projectId }: HandoffsPanelProps) {
  const [handoffs, setHandoffs] = useState<HandoffPacket[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showDecayed, setShowDecayed] = useState(false);
  const [selectedHandoff, setSelectedHandoff] = useState<HandoffPacket | null>(null);

  useEffect(() => {
    async function fetchHandoffs() {
      try {
        const res = await fetch(`/api/handoffs?projectId=${projectId}`);
        if (res.ok) {
          const data = await res.json();
          setHandoffs(data.handoffs ?? []);
        } else {
          setFetchError('Failed to load operational wisdom');
        }
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : 'Could not connect to server');
      }
      setLoading(false);
    }
    fetchHandoffs();
  }, [projectId]);

  async function handleResolve(handoffId: string) {
    const res = await fetch('/api/handoffs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handoffId, status: 'resolved' }),
    });
    if (res.ok) {
      setHandoffs(prev => prev.map(h => h.id === handoffId ? { ...h, status: 'resolved' } : h));
      setSelectedHandoff(null);
    }
  }

  const active = handoffs.filter(h => h.status === 'active');
  const decayed = handoffs.filter(h => h.status === 'decayed');
  const resolved = handoffs.filter(h => h.status === 'resolved' || h.status === 'superseded');
  const displayHandoffs = showDecayed ? handoffs : active;

  if (loading) {
    return (
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-6 text-center">
        <p className="text-xs text-slate-600 animate-pulse">Loading operational wisdom...</p>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="bg-[#0d0d1a] border border-red-500/20 rounded-xl p-6 text-center">
        <p className="text-sm text-red-400">{fetchError}</p>
        <p className="text-[10px] text-slate-600 mt-1">Operational wisdom could not be loaded. The rest of the dashboard is unaffected.</p>
      </div>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-6 text-center">
        <p className="text-sm text-slate-500 mb-1">No operational wisdom yet</p>
        <p className="text-[11px] text-slate-700">
          As your agent works on this project, it will pass on lessons learned — facts, inferences, heuristics, and open questions — to future sessions.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.04] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <h4 className="text-sm font-semibold">Operational Wisdom</h4>
          </div>
          <p className="text-[10px] text-slate-600">
            {active.length} active{decayed.length > 0 ? ` · ${decayed.length} faded` : ''}{resolved.length > 0 ? ` · ${resolved.length} resolved` : ''}
          </p>
        </div>
        {decayed.length > 0 && (
          <button
            onClick={() => setShowDecayed(!showDecayed)}
            className="text-[10px] text-slate-600 hover:text-slate-400 transition"
          >
            {showDecayed ? 'Hide faded' : `Show ${decayed.length} faded`}
          </button>
        )}
      </div>

      {/* Handoff list */}
      <div className="divide-y divide-white/[0.04]">
        {displayHandoffs.map(handoff => {
          const config = CLASSIFICATION_CONFIG[handoff.classification];
          const isDecayed = handoff.status === 'decayed';
          const isResolved = handoff.status === 'resolved' || handoff.status === 'superseded';

          return (
            <button
              key={handoff.id}
              onClick={() => setSelectedHandoff(selectedHandoff?.id === handoff.id ? null : handoff)}
              className={`w-full text-left px-5 py-3.5 hover:bg-white/[0.01] transition ${isDecayed || isResolved ? 'opacity-40' : ''}`}
            >
              <div className="flex items-start gap-3">
                <span className={`text-sm mt-0.5 ${config.color}`}>{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${config.bgColor} ${config.color} font-medium uppercase tracking-wide`}>
                      {config.label}
                    </span>
                    {handoff.reinforcementCount > 0 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                        Reinforced {handoff.reinforcementCount}x
                      </span>
                    )}
                    {isResolved && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-500/10 text-slate-500 font-medium">Resolved</span>
                    )}
                    <span className="text-[9px] text-slate-700 ml-auto">{timeAgo(handoff.createdAt)}</span>
                  </div>
                  <p className="text-[12px] text-slate-300 leading-relaxed">{handoff.content}</p>
                  <div className="mt-2">
                    {confidenceBar(handoff.initialConfidence, handoff.effectiveConfidence, handoff.classification)}
                  </div>

                  {/* Expanded detail */}
                  {selectedHandoff?.id === handoff.id && (
                    <div className="mt-3 pt-3 border-t border-white/[0.04] space-y-2">
                      <div>
                        <span className="text-[9px] text-slate-600 uppercase tracking-wide">Decay Rate</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{config.decayLabel}</p>
                      </div>
                      <div>
                        <span className="text-[9px] text-slate-600 uppercase tracking-wide">Reasoning</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{handoff.provenance.reasoning}</p>
                      </div>
                      {handoff.provenance.evidencePaths.length > 0 && (
                        <div>
                          <span className="text-[9px] text-slate-600 uppercase tracking-wide">Evidence</span>
                          <div className="mt-0.5 space-y-0.5">
                            {handoff.provenance.evidencePaths.map((path, i) => (
                              <p key={i} className="text-[10px] text-slate-600 font-mono">{path}</p>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-[9px] text-slate-700">
                          Created {new Date(handoff.createdAt).toLocaleDateString()}
                          {handoff.reinforcementCount > 0 && ` · Last reinforced ${new Date(handoff.lastReinforcedAt).toLocaleDateString()}`}
                        </span>
                        {handoff.classification === 'unresolved-question' && handoff.status === 'active' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleResolve(handoff.id); }}
                            className="text-[10px] px-2 py-1 rounded bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition"
                          >
                            Mark as resolved
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Trust hierarchy legend */}
      <div className="px-5 py-3 border-t border-white/[0.04] bg-white/[0.01]">
        <p className="text-[9px] text-slate-700 mb-1.5 uppercase tracking-wide font-medium">Trust hierarchy</p>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="text-[9px] text-emerald-500/60">● Source knowledge (highest)</span>
          <span className="text-[9px] text-amber-500/60">● Operational wisdom (this panel)</span>
          <span className="text-[9px] text-slate-500/60">● AI-generated fills (lowest)</span>
        </div>
      </div>
    </div>
  );
}
