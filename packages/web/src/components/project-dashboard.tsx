'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { EmpowermentRing } from '@/components/empowerment-ring';
import { LayerGrid } from '@/components/layer-grid';
import { Timeline } from '@/components/timeline';
import { DataSourcesPanel } from '@/components/data-sources-panel';
import { Onboarding } from '@/components/onboarding';
import { QuickProofCard } from '@/components/quick-proof-card';
import { MemoryMap } from '@/components/memory-map';

const LAYER_TYPES = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
] as const;

interface ProjectDashboardProps {
  project: any;
  snapshots: any[];
  files: any[];
  dataSources: any[];
}

export function ProjectDashboard({ project, snapshots, files, dataSources }: ProjectDashboardProps) {
  const isFirstVisit = snapshots.length === 0 && files.length === 0;
  const [showOnboarding, setShowOnboarding] = useState(isFirstVisit);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ generated: string[]; readinessScore: number; grade: string } | null>(null);
  const router = useRouter();

  async function handleOptimize() {
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const res = await fetch('/api/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id }),
      });
      const data = await res.json();
      if (data.success) {
        setOptimizeResult(data);
        setTimeout(() => router.refresh(), 1500);
      }
    } catch {}
    setOptimizing(false);
  }

  const score = project.readiness_score ?? 0;
  const grade = project.grade ?? 'F';
  const layerScores = snapshots.length > 0
    ? snapshots[snapshots.length - 1].layer_scores as Record<string, number>
    : {};

  const layers = LAYER_TYPES.map(kind => {
    const kindFiles = files.filter((f: any) => f.inferred_kind === kind);
    return {
      kind,
      score: layerScores[kind] ?? 0,
      status: (layerScores[kind] ?? 0) > 40 ? 'present' : (layerScores[kind] ?? 0) > 0 ? 'weak' : 'missing',
      fileCount: kindFiles.length,
      files: kindFiles,
    };
  });

  const present = layers.filter(l => l.status === 'present').length;
  const missing = layers.filter(l => l.status === 'missing').length;

  function handleConnectSource() {
    setShowOnboarding(false);
    setShowSourcePicker(true);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold">{project.name}</h1>
          {project.description && <p className="text-sm text-slate-500 mt-1">{project.description}</p>}
        </div>
        <div className="flex gap-3">
          {missing > 0 && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {optimizing ? 'Optimizing...' : 'Optimize with AI'}
            </button>
          )}
          <Link
            href={`/dashboard/${project.id}/chat`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Test Your Agent
          </Link>
        </div>
      </div>

      {/* Optimize result */}
      {optimizeResult && (
        <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            <div>
              <span className="text-sm font-semibold text-emerald-300">Optimization complete!</span>
              <span className="text-sm text-emerald-400 ml-2">
                Generated {optimizeResult.generated.length} layers ({optimizeResult.generated.join(', ')}) — Score: {optimizeResult.readinessScore}/100 ({optimizeResult.grade})
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Onboarding */}
      {showOnboarding && (
        <Onboarding
          projectName={project.name}
          onDismiss={() => setShowOnboarding(false)}
          onConnectSource={handleConnectSource}
        />
      )}

      {/* Quick Proof — show for new projects */}
      {snapshots.length < 2 && !showOnboarding && (
        <QuickProofCard projectId={project.id} projectName={project.name} />
      )}

      {/* Hero metrics */}
      <div className="flex flex-col md:flex-row items-center gap-10 mb-12">
        <EmpowermentRing score={score} grade={grade} />
        <div className="flex-1">
          <h2 className="text-xl font-semibold mb-2">
            {score >= 80 ? 'Agent is a Subject Expert' :
             score >= 60 ? 'Agent has good foundations' :
             score >= 40 ? 'Agent needs more context' :
             'Agent is flying blind'}
          </h2>
          <p className="text-sm text-slate-500 mb-4">
            {score >= 80
              ? `Your instruction stack covers ${present} of ${LAYER_TYPES.length} layer types. The agent has strong context about who it is, what it can do, and what it must not do.`
              : score >= 60
              ? `Your stack covers ${present} layers but has ${missing} gaps. The agent can function but may hallucinate in areas without specific guidance.`
              : `Only ${present} of ${LAYER_TYPES.length} layers are covered. The agent is missing critical context and will fall back to generic behavior.`
            }
          </p>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium">{present} present</div>
            {missing > 0 && <div className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium">{missing} missing</div>}
            <div className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm font-medium">{files.length} files</div>
            <div className="px-4 py-2 rounded-lg bg-white/5 text-slate-400 text-sm font-medium">{snapshots.length} snapshots</div>
          </div>
          <a
            href={`/api/init-report?projectId=${project.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            View full report
          </a>
        </div>
      </div>

      {/* Layer coverage */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Layer Coverage</h3>
          <span className="text-xs text-slate-600">{present}/{LAYER_TYPES.length} layers active</span>
        </div>
        <LayerGrid layers={layers} />
      </section>

      {/* Memory Map */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Memory Map</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Everything your agent knows — instruction layers, knowledge base, and how they connect
            </p>
          </div>
        </div>
        <MemoryMap projectId={project.id} />
      </section>

      {/* Scan Report */}
      {files.length > 0 && (
        <section className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold">Scan Report</h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {files.length} files discovered &middot; {Math.round(files.reduce((s: number, f: any) => s + (f.content_length ?? 0), 0) / 1000)}K chars of context
              </p>
            </div>
            {snapshots.length > 0 && (
              <span className="text-[10px] text-slate-700">
                Last scan: {new Date(snapshots[snapshots.length - 1].created_at).toLocaleString()}
              </span>
            )}
          </div>
          <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl overflow-hidden">
            <div className="grid grid-cols-[1fr_100px_80px_80px] gap-px bg-white/[0.02] text-[10px] text-slate-600 uppercase tracking-wide font-semibold">
              <div className="bg-[#0d0d1a] px-4 py-2">File</div>
              <div className="bg-[#0d0d1a] px-4 py-2">Layer</div>
              <div className="bg-[#0d0d1a] px-4 py-2">Source</div>
              <div className="bg-[#0d0d1a] px-4 py-2 text-right">Size</div>
            </div>
            {files.map((f: any, i: number) => (
              <div key={i} className="grid grid-cols-[1fr_100px_80px_80px] gap-px bg-white/[0.02] text-sm hover:bg-white/[0.01] transition">
                <div className="bg-[#0d0d1a] px-4 py-2.5 font-mono text-xs text-slate-300 truncate">{f.relative_path}</div>
                <div className="bg-[#0d0d1a] px-4 py-2.5">
                  {f.inferred_kind ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 capitalize">{f.inferred_kind}</span>
                  ) : (
                    <span className="text-[10px] text-slate-700">—</span>
                  )}
                </div>
                <div className="bg-[#0d0d1a] px-4 py-2.5 text-[10px] text-slate-600">{f.source_type}</div>
                <div className="bg-[#0d0d1a] px-4 py-2.5 text-[10px] text-slate-600 text-right">{((f.content_length ?? 0) / 1000).toFixed(1)}K</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Data Sources */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Data Sources</h3>
            <p className="text-xs text-slate-600 mt-0.5">Connect your data to build context automatically</p>
          </div>
        </div>
        <DataSourcesPanel projectId={project.id} dataSources={dataSources} forceOpen={showSourcePicker} />
      </section>

      {/* Timeline */}
      {snapshots.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4">Activity Timeline</h3>
          <Timeline snapshots={snapshots} />
        </section>
      )}
    </div>
  );
}
