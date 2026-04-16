'use client';

import { useCallback, useEffect, useState } from 'react';
import { ObjectCard } from '@/components/visible-object';
import { pipelineRunToVisible, type PipelineRunRow } from '@/lib/knowledge/to-visible';

const STAGES = ['extract', 'reconcile', 'review', 'promote', 'render', 'inject'] as const;
type Stage = typeof STAGES[number];

const STAGE_DESCRIPTION: Record<Stage, string> = {
  extract: 'Session close → candidate atoms',
  reconcile: 'Candidates → near-duplicate pairs surfaced',
  review: 'User approves / merges / rejects candidates',
  promote: 'Auto-promotion rules move candidate → provisional',
  render: 'Atoms → articles + compact prompt view',
  inject: 'Per-compile inclusion / exclusion decisions',
};

// Each stage gets a distinct accent so the pipeline reads as a progression, not a grid.
const STAGE_ACCENT: Record<Stage, { ring: string; text: string; glow: string }> = {
  extract:   { ring: 'border-sky-500/30 bg-sky-500/10',       text: 'text-sky-300',       glow: 'shadow-sky-500/10' },
  reconcile: { ring: 'border-cyan-500/30 bg-cyan-500/10',     text: 'text-cyan-300',      glow: 'shadow-cyan-500/10' },
  review:    { ring: 'border-amber-500/30 bg-amber-500/10',   text: 'text-amber-300',     glow: 'shadow-amber-500/10' },
  promote:   { ring: 'border-emerald-500/30 bg-emerald-500/10', text: 'text-emerald-300', glow: 'shadow-emerald-500/10' },
  render:    { ring: 'border-violet-500/30 bg-violet-500/10', text: 'text-violet-300',    glow: 'shadow-violet-500/10' },
  inject:    { ring: 'border-fuchsia-500/30 bg-fuchsia-500/10', text: 'text-fuchsia-300', glow: 'shadow-fuchsia-500/10' },
};

interface StageSummary {
  stage: Stage;
  runCount: number;
  latest: {
    id: string;
    status: 'running' | 'succeeded' | 'failed';
    startedAt: string;
    completedAt: string | null;
    counts: Record<string, unknown>;
    error: string | null;
  } | null;
  recent: PipelineRunRow[];
}

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  const diffS = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return `${Math.floor(diffS / 86400)}d ago`;
}

export function KnowledgePipelinePanel({ projectId }: { projectId: string }) {
  const [stages, setStages] = useState<StageSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Stage | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [extractMsg, setExtractMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/pipeline-runs?projectId=${projectId}`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed to load pipeline');
      else setStages(data.stages ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load pipeline');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const runExtract = useCallback(async () => {
    setExtracting(true);
    setExtractMsg(null);
    try {
      const res = await fetch('/api/knowledge/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractMsg(`Extract failed: ${data.error ?? res.statusText}`);
      } else {
        setExtractMsg(
          data.extractedCount > 0
            ? `Extracted ${data.extractedCount} candidate atom${data.extractedCount === 1 ? '' : 's'} from ${data.logCount} log rows.`
            : `Scanned ${data.logCount} log rows. Nothing durable extracted.`,
        );
      }
    } catch (err) {
      setExtractMsg(err instanceof Error ? err.message : 'Extract failed');
    }
    setExtracting(false);
    await load();
  }, [projectId, load]);

  const runRender = useCallback(async () => {
    setRendering(true);
    setExtractMsg(null);
    try {
      const res = await fetch('/api/knowledge/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setExtractMsg(`Render failed: ${data.error ?? res.statusText}`);
      } else {
        setExtractMsg(
          `Rendered ${data.articlesUpserted} article${data.articlesUpserted === 1 ? '' : 's'}; prompt view = ${data.promptViewAtomCount} atoms, ~${data.promptViewTokens} tokens.`,
        );
      }
    } catch (err) {
      setExtractMsg(err instanceof Error ? err.message : 'Render failed');
    }
    setRendering(false);
    await load();
  }, [projectId, load]);

  const totalRuns = stages?.reduce((s, x) => s + x.runCount, 0) ?? 0;
  const activeStages = stages?.filter(s => s.runCount > 0).length ?? 0;
  const failedStages = stages?.filter(s => s.latest?.status === 'failed').length ?? 0;
  const lastRunAt = stages
    ?.map(s => s.latest?.startedAt)
    .filter((x): x is string => !!x)
    .sort()
    .slice(-1)[0];

  return (
    <div>
      {/* Toolbar — aggregate metrics + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <span className="text-base font-bold tabular-nums text-slate-100">{totalRuns}</span>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">runs</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.03] border border-white/[0.06]">
            <span className="text-base font-bold tabular-nums text-slate-100">{activeStages}<span className="text-slate-500 font-normal">/6</span></span>
            <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">active</span>
          </span>
          {failedStages > 0 && (
            <span className="inline-flex items-baseline gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20">
              <span className="text-base font-bold tabular-nums text-rose-300">{failedStages}</span>
              <span className="text-[11px] uppercase tracking-wider text-rose-400/80 font-semibold">failed</span>
            </span>
          )}
          {lastRunAt && (
            <span className="text-sm text-slate-500">
              Last run <span className="text-slate-300">{formatAgo(lastRunAt)}</span>
            </span>
          )}
          {loading && <span className="text-sm text-slate-500">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={runExtract}
            disabled={extracting}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-200 font-semibold hover:bg-sky-500/20 transition disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            {extracting ? 'Extracting…' : 'Extract now'}
          </button>
          <button
            onClick={runRender}
            disabled={rendering}
            className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-200 font-semibold hover:bg-violet-500/20 transition disabled:opacity-50"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
            {rendering ? 'Rendering…' : 'Render now'}
          </button>
          <button
            onClick={load}
            aria-label="Refresh"
            title="Refresh"
            className="inline-flex items-center justify-center w-10 h-10 rounded-lg border border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] transition"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {extractMsg && (
        <p className="text-sm text-slate-200 mb-4 bg-white/[0.04] border border-white/10 rounded-lg px-4 py-2.5">
          {extractMsg}
        </p>
      )}

      {error && <p className="text-sm text-rose-300 mb-4">{error}</p>}

      {/* Stage cards — color-coded progression */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        {STAGES.map((stage, i) => {
          const summary = stages?.find(s => s.stage === stage);
          const latest = summary?.latest;
          const accent = STAGE_ACCENT[stage];
          const isOpen = open === stage;
          const statusLabel = latest?.status ?? 'idle';
          const statusTone =
            !latest ? 'text-slate-500 bg-white/[0.04] border-white/[0.06]'
            : latest.status === 'succeeded' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20'
            : latest.status === 'failed' ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
            : 'text-indigo-300 bg-indigo-500/10 border-indigo-500/20';
          return (
            <button
              key={stage}
              onClick={() => setOpen(isOpen ? null : stage)}
              className={`relative text-left rounded-xl border p-4 transition-all ${
                isOpen
                  ? `${accent.ring} shadow-lg ${accent.glow} -translate-y-0.5`
                  : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/[0.1]'
              }`}
            >
              {/* Stage number badge */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md border text-xs font-bold shrink-0 ${accent.ring} ${accent.text}`}>
                    {i + 1}
                  </span>
                  <span className={`text-sm font-bold uppercase tracking-wide truncate ${accent.text}`}>
                    {stage}
                  </span>
                </div>
                <span
                  title={statusLabel}
                  className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${statusTone}`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    !latest ? 'bg-slate-500'
                    : latest.status === 'succeeded' ? 'bg-emerald-400'
                    : latest.status === 'failed' ? 'bg-rose-400'
                    : 'bg-indigo-400 animate-pulse'
                  }`} />
                  {statusLabel === 'succeeded' ? 'Ok'
                    : statusLabel === 'running' ? 'Run'
                    : statusLabel === 'failed' ? 'Err'
                    : 'Idle'}
                </span>
              </div>

              <p className="text-sm text-slate-300 leading-relaxed mb-3 min-h-[3em]">
                {STAGE_DESCRIPTION[stage]}
              </p>

              {/* Run metrics */}
              <div className="flex items-baseline gap-1.5 mb-1">
                <span className="text-xl font-bold tabular-nums text-slate-100">{summary?.runCount ?? 0}</span>
                <span className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">runs</span>
              </div>
              <div className="text-xs text-slate-500">
                Last: <span className="text-slate-300">{formatAgo(latest?.startedAt)}</span>
              </div>

              {latest?.counts && Object.keys(latest.counts).length > 0 && (
                <div className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap gap-1.5">
                  {Object.entries(latest.counts).slice(0, 3).map(([k, v]) => (
                    <span key={k} className="inline-flex items-baseline gap-1 text-[11px] bg-white/[0.03] border border-white/[0.06] rounded px-1.5 py-0.5">
                      <span className="text-slate-500">{k}</span>
                      <span className="text-slate-200 font-semibold tabular-nums">{String(v)}</span>
                    </span>
                  ))}
                </div>
              )}

              {latest?.error && (
                <div className="mt-3 pt-3 border-t border-rose-500/20 text-xs text-rose-300 line-clamp-2" title={latest.error}>
                  {latest.error}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Drawer: last N runs for the selected stage */}
      {open && (
        <div className="mt-6 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center justify-center w-7 h-7 rounded-md border text-sm font-bold ${STAGE_ACCENT[open].ring} ${STAGE_ACCENT[open].text}`}>
                {STAGES.indexOf(open) + 1}
              </span>
              <h2 className="text-lg font-bold capitalize">{open}</h2>
              <span className="text-sm text-slate-500">— recent runs</span>
            </div>
            <button
              onClick={() => setOpen(null)}
              className="text-sm text-slate-400 hover:text-slate-200 transition px-2 py-1 rounded-md hover:bg-white/[0.04]"
            >
              Close
            </button>
          </div>
          {(() => {
            const recent = stages?.find(s => s.stage === open)?.recent ?? [];
            if (recent.length === 0) {
              return (
                <p className="text-sm text-slate-400">
                  No {open} runs yet for this project. This stage will light up once it fires.
                </p>
              );
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {recent.map(run => (
                  <ObjectCard key={run.id} object={pipelineRunToVisible(run)} />
                ))}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
