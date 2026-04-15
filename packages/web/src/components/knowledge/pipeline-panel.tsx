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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="text-[11px] text-slate-400">
          {loading ? 'Loading…' : stages ? `${stages.reduce((s, x) => s + x.runCount, 0)} runs recorded` : ''}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={runExtract}
            disabled={extracting}
            className="text-[11px] px-2.5 py-1 rounded-md border border-purple-500/30 bg-purple-500/10 text-purple-200 hover:bg-purple-500/20 transition disabled:opacity-50"
          >
            {extracting ? 'Extracting…' : 'Extract now'}
          </button>
          <button
            onClick={load}
            className="text-[11px] text-purple-300 hover:text-purple-200 transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {extractMsg && (
        <p className="text-[11px] text-slate-300 mb-3 bg-white/[0.04] border border-white/10 rounded-md px-2.5 py-1.5">
          {extractMsg}
        </p>
      )}

      {error && <p className="text-sm text-rose-300 mb-4">{error}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2">
        {STAGES.map((stage, i) => {
          const summary = stages?.find(s => s.stage === stage);
          const latest = summary?.latest;
          const tone =
            !latest ? 'text-slate-500'
            : latest.status === 'succeeded' ? 'text-emerald-300'
            : latest.status === 'failed' ? 'text-rose-300'
            : 'text-indigo-300';
          return (
            <button
              key={stage}
              onClick={() => setOpen(open === stage ? null : stage)}
              className={`text-left rounded-lg border p-3 transition ${
                open === stage
                  ? 'border-purple-400/40 bg-purple-500/[0.06]'
                  : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.06]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] uppercase tracking-wide text-slate-400 font-semibold">
                  {i + 1}. {stage}
                </span>
                <span className={`text-[10px] ${tone}`}>
                  {latest ? latest.status : 'idle'}
                </span>
              </div>
              <div className="text-[11px] text-slate-300 leading-snug mb-2 min-h-[2.2em]">
                {STAGE_DESCRIPTION[stage]}
              </div>
              <div className="text-[10px] text-slate-400">
                {summary?.runCount ?? 0} runs · last: {formatAgo(latest?.startedAt)}
              </div>
              {latest?.counts && Object.keys(latest.counts).length > 0 && (
                <div className="text-[10px] text-slate-500 mt-1 truncate">
                  {Object.entries(latest.counts).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' · ')}
                </div>
              )}
              {latest?.error && (
                <div className="text-[10px] text-rose-300 mt-1 truncate" title={latest.error}>
                  {latest.error}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Drawer: last N runs for the selected stage */}
      {open && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold capitalize">{open} — recent runs</h2>
            <button
              onClick={() => setOpen(null)}
              className="text-[11px] text-slate-400 hover:text-slate-200 transition"
            >
              Close
            </button>
          </div>
          {(() => {
            const recent = stages?.find(s => s.stage === open)?.recent ?? [];
            if (recent.length === 0) {
              return (
                <p className="text-xs text-slate-400">
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
