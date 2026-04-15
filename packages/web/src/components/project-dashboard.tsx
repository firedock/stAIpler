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
import { DeployPanel } from '@/components/deploy-panel';
import { CliPanel } from '@/components/cli-panel';
import { KnowledgeJourney } from '@/components/knowledge-journey';
import { HandoffsPanel } from '@/components/handoffs-panel';
import { DeleteProjectButton } from '@/components/delete-project-button';

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
  hasAgentConfig?: boolean;
  sourceDocuments?: any[];
  layerCandidates?: any[];
  compiledBundle?: any;
}

export function ProjectDashboard({ project, snapshots, files, dataSources, hasAgentConfig, sourceDocuments = [], layerCandidates = [], compiledBundle }: ProjectDashboardProps) {
  // Empty project gate: zero data sources AND zero files AND zero source documents
  // means stAIpler has nothing to evaluate. We refuse to show the dashboard
  // until the user connects something — otherwise they see misleading "0 layers"
  // metrics and broken Optimize/Test buttons that produce hallucinated content.
  const hasSourceMaterial = dataSources.length > 0 || files.length > 0 || sourceDocuments.length > 0;
  const isFirstVisit = snapshots.length === 0 && files.length === 0;
  const [showOnboarding, setShowOnboarding] = useState(isFirstVisit && hasSourceMaterial);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [knowledgeView, setKnowledgeView] = useState<'journey' | 'files'>('journey');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<{ generated: string[]; readinessScore: number; grade: string } | null>(null);
  const [optimizeError, setOptimizeError] = useState<string | null>(null);
  const router = useRouter();

  async function handleOptimize() {
    setOptimizing(true);
    setOptimizeResult(null);
    setOptimizeError(null);
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
      } else {
        setOptimizeError(data.error ?? 'Optimization failed');
      }
    } catch (err) {
      setOptimizeError(err instanceof Error ? err.message : 'Failed to connect to optimization service');
    }
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

  // ---- Empty Project Gate ----
  // Block all dashboard surface area until at least one data source is connected.
  // This prevents the user from seeing misleading "0 layers" metrics or invoking
  // Optimize/Test against an empty project (which produces hallucinated content).
  if (!hasSourceMaterial) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start gap-4">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold truncate">{project.name}</h1>
            {project.description && (
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{project.description}</p>
            )}
          </div>
          <DeleteProjectButton projectId={project.id} projectName={project.name} />
        </div>

        {/* Gate card */}
        <div className="rounded-2xl bg-gradient-to-br from-purple-500/[0.04] to-indigo-500/[0.04] border border-purple-500/20 p-8">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 16.875h3.375m0 0h3.375m-3.375 0V13.5m0 3.375v3.375M6 10.5h2.25a2.25 2.25 0 002.25-2.25V6a2.25 2.25 0 00-2.25-2.25H6A2.25 2.25 0 003.75 6v2.25A2.25 2.25 0 006 10.5zm0 9.75h2.25A2.25 2.25 0 0010.5 18v-2.25a2.25 2.25 0 00-2.25-2.25H6a2.25 2.25 0 00-2.25 2.25V18A2.25 2.25 0 006 20.25zm9.75-9.75H18a2.25 2.25 0 002.25-2.25V6A2.25 2.25 0 0018 3.75h-2.25A2.25 2.25 0 0013.5 6v2.25a2.25 2.25 0 002.25 2.25z" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-semibold">Connect your environment to start</h2>
              <p className="text-sm text-slate-400 mt-0.5">stAIpler can&apos;t evaluate your agent until it has source material to analyze</p>
            </div>
          </div>

          {/* What stAIpler will do — visibility requirement: explain the pipeline up front */}
          <div className="mb-6 p-4 rounded-xl bg-black/20 border border-white/[0.04]">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-3">What happens after you connect</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { num: '1', label: 'Ingest', desc: 'Pull your docs into normalized SourceDocuments' },
                { num: '2', label: 'Extract', desc: 'Identify spans relevant to each instruction layer' },
                { num: '3', label: 'Organize', desc: 'Dedupe, reconcile conflicts, cluster by layer' },
                { num: '4', label: 'Compile', desc: 'Produce the final agent instruction bundle' },
              ].map(stage => (
                <div key={stage.num} className="text-center">
                  <div className="text-[10px] text-purple-400/60 font-mono mb-1">STAGE {stage.num}</div>
                  <div className="text-xs font-semibold text-slate-300">{stage.label}</div>
                  <div className="text-[10px] text-slate-600 mt-1 leading-tight">{stage.desc}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Source picker — reuses the live DataSourcesPanel so all flows work inline */}
          <div className="rounded-xl bg-black/20 border border-white/[0.04] p-4">
            <DataSourcesPanel projectId={project.id} dataSources={[]} forceOpen />
          </div>

          {/* Locked actions — visibility: show what's gated and why */}
          <div className="mt-6 pt-6 border-t border-white/[0.04]">
            <div className="text-[10px] uppercase tracking-wide text-slate-600 font-semibold mb-3">Locked until you connect a source</div>
            <div className="flex flex-wrap gap-2">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Optimize with AI
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Test Your Agent
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Layer scoring
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.02] border border-white/[0.04] text-xs text-slate-600">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                Embed widget
              </div>
            </div>
            <p className="text-[11px] text-slate-600 mt-3">
              The optimizer is a gap-filler — it needs your real source material to know what your agent should know. Without context it would invent content.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10 flex flex-col lg:flex-row lg:justify-between lg:items-start gap-4">
        <div className="min-w-0 lg:max-w-2xl">
          <h1 className="text-2xl font-bold truncate">{project.name}</h1>
          {project.description && (
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{project.description}</p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 items-center">
          {missing > 0 && (
            <button
              onClick={handleOptimize}
              disabled={optimizing}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-emerald-500/10 disabled:opacity-50 whitespace-nowrap"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              {optimizing ? 'Optimizing…' : 'Optimize with AI'}
            </button>
          )}
          <Link
            href={`/dashboard/${project.id}/chat`}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10 whitespace-nowrap"
          >
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Test Your Agent
          </Link>
          <DeleteProjectButton projectId={project.id} projectName={project.name} />
        </div>
      </div>

      {/* Optimize error */}
      {optimizeError && (
        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
            <div>
              <span className="text-sm font-semibold text-red-300">Optimization failed</span>
              <span className="text-sm text-red-400 ml-2">{optimizeError}</span>
            </div>
            <button onClick={() => setOptimizeError(null)} className="ml-auto text-red-400 hover:text-red-300 text-xs">Dismiss</button>
          </div>
        </div>
      )}

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
            {(() => {
              const sections = compiledBundle?.sections ?? [];
              const fromDocs = sections.filter((s: any) => s.status === 'source-grounded').length;
              const aiGenerated = sections.filter((s: any) => s.status === 'ai-generated').length;
              const mixed = sections.filter((s: any) => s.status === 'mixed').length;
              const hasBundle = sections.length > 0;

              if (hasBundle) {
                return (
                  <>
                    {fromDocs > 0 && <div className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium">{fromDocs} from your docs</div>}
                    {aiGenerated > 0 && <div className="px-4 py-2 rounded-lg bg-amber-500/10 text-amber-400 text-sm font-medium">{aiGenerated} AI-generated</div>}
                    {mixed > 0 && <div className="px-4 py-2 rounded-lg bg-blue-500/10 text-blue-400 text-sm font-medium">{mixed} mixed</div>}
                    {missing > 0 && <div className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium">{missing} missing</div>}
                  </>
                );
              }

              return (
                <>
                  <div className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium">{present} present</div>
                  {missing > 0 && <div className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium">{missing} missing</div>}
                  <div className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm font-medium">{files.length} files</div>
                </>
              );
            })()}
            <div className="px-4 py-2 rounded-lg bg-white/5 text-slate-400 text-sm font-medium">{snapshots.length} snapshots</div>
          </div>
        </div>
      </div>

      {/* Layer coverage */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Layer Coverage</h3>
          <span className="text-xs text-slate-600">{present}/{LAYER_TYPES.length} layers active</span>
        </div>
        <LayerGrid layers={layers} bundleSections={compiledBundle?.sections} layerCandidates={layerCandidates} />
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

      {/* Operational Wisdom (Handoffs) */}
      <section className="mb-12">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="text-lg font-semibold">Operational Wisdom</h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Lessons passed on between agent sessions — facts, inferences, heuristics, and open questions
            </p>
          </div>
        </div>
        <HandoffsPanel projectId={project.id} />
      </section>

      {/* Knowledge Journey / Scan Report */}
      {(files.length > 0 || sourceDocuments.length > 0) && (
        <section className="mb-12">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-semibold">
                {knowledgeView === 'journey' ? 'Knowledge Journey' : 'Scan Report'}
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                {knowledgeView === 'journey'
                  ? 'How your documents become agent expertise'
                  : `${files.length} files discovered · ${Math.round(files.reduce((s: number, f: any) => s + (f.content_length ?? 0), 0) / 1000)}K chars of context`
                }
              </p>
            </div>
            <div className="flex items-center gap-1 bg-white/[0.03] rounded-lg p-0.5">
              <button
                onClick={() => setKnowledgeView('journey')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition ${
                  knowledgeView === 'journey' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Knowledge Journey
              </button>
              <button
                onClick={() => setKnowledgeView('files')}
                className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition ${
                  knowledgeView === 'files' ? 'bg-purple-500/20 text-purple-300' : 'text-slate-500 hover:text-slate-400'
                }`}
              >
                Raw Files
              </button>
            </div>
          </div>

          {knowledgeView === 'journey' ? (
            <KnowledgeJourney
              sourceDocuments={sourceDocuments}
              layerCandidates={layerCandidates}
              compiledBundle={compiledBundle}
            />
          ) : (
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
          )}
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
        <CliPanel projectId={project.id} />
        <DeployPanel projectId={project.id} hasAgentConfig={!!hasAgentConfig} />
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
