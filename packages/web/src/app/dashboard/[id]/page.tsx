import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { EmpowermentRing } from '@/components/empowerment-ring';
import { LayerGrid } from '@/components/layer-grid';
import { Timeline } from '@/components/timeline';
import { DataSourcesPanel } from '@/components/data-sources-panel';

const LAYER_TYPES = [
  'identity', 'goals', 'context', 'policies', 'constraints',
  'skills', 'style', 'examples', 'tools', 'prompts', 'evals', 'memory',
] as const;

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  const { data: snapshots } = await supabase
    .from('snapshots')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: true });

  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', id)
    .order('relative_path');

  const { data: dataSources } = await supabase
    .from('data_sources')
    .select('*')
    .eq('project_id', id)
    .order('created_at');

  const score = project.readiness_score ?? 0;
  const grade = project.grade ?? 'F';
  const layerScores = (snapshots && snapshots.length > 0)
    ? snapshots[snapshots.length - 1].layer_scores as Record<string, number>
    : {};

  // Build layer data
  const layers = LAYER_TYPES.map(kind => ({
    kind,
    score: layerScores[kind] ?? 0,
    status: (layerScores[kind] ?? 0) > 40 ? 'present' : (layerScores[kind] ?? 0) > 0 ? 'weak' : 'missing',
    fileCount: files?.filter(f => f.inferred_kind === kind).length ?? 0,
  }));

  const present = layers.filter(l => l.status === 'present').length;
  const missing = layers.filter(l => l.status === 'missing').length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        {project.description && <p className="text-sm text-slate-500 mt-1">{project.description}</p>}
      </div>

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
            <div className="px-4 py-2 rounded-lg bg-purple-500/10 text-purple-400 text-sm font-medium">{files?.length ?? 0} files</div>
            <div className="px-4 py-2 rounded-lg bg-white/5 text-slate-400 text-sm font-medium">{snapshots?.length ?? 0} snapshots</div>
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
        <DataSourcesPanel projectId={id} dataSources={dataSources ?? []} />
      </section>

      {/* Timeline */}
      {snapshots && snapshots.length > 0 && (
        <section>
          <h3 className="text-lg font-semibold mb-4">Activity Timeline</h3>
          <Timeline snapshots={snapshots} />
        </section>
      )}
    </div>
  );
}
