'use client';

import { useState } from 'react';
import Link from 'next/link';
import { EmpowermentRing } from '@/components/empowerment-ring';
import { LayerGrid } from '@/components/layer-grid';
import { Timeline } from '@/components/timeline';
import { DataSourcesPanel } from '@/components/data-sources-panel';
import { Onboarding } from '@/components/onboarding';

const LAYER_TYPES = [
  'identity', 'goals', 'context', 'policies', 'constraints',
  'skills', 'style', 'examples', 'tools', 'prompts', 'evals', 'memory',
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

  const score = project.readiness_score ?? 0;
  const grade = project.grade ?? 'F';
  const layerScores = snapshots.length > 0
    ? snapshots[snapshots.length - 1].layer_scores as Record<string, number>
    : {};

  const layers = LAYER_TYPES.map(kind => ({
    kind,
    score: layerScores[kind] ?? 0,
    status: (layerScores[kind] ?? 0) > 40 ? 'present' : (layerScores[kind] ?? 0) > 0 ? 'weak' : 'missing',
    fileCount: files.filter((f: any) => f.inferred_kind === kind).length,
  }));

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
        <Link
          href={`/dashboard/${project.id}/chat`}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          Test Your Agent
        </Link>
      </div>

      {/* Onboarding */}
      {showOnboarding && (
        <Onboarding
          projectName={project.name}
          onDismiss={() => setShowOnboarding(false)}
          onConnectSource={handleConnectSource}
        />
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
          <div className="flex flex-wrap gap-3">
            <div className="px-4 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 text-sm font-medium">{present} present</div>
            {missing > 0 && <div className="px-4 py-2 rounded-lg bg-red-500/10 text-red-400 text-sm font-medium">{missing} missing</div>}
            <div className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm font-medium">{files.length} files</div>
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
        <LayerGrid layers={layers} />
      </section>

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
