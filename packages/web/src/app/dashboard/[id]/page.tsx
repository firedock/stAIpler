import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ProjectDashboard } from '@/components/project-dashboard';

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

  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('id')
    .eq('project_id', id)
    .single();

  // Pipeline data (new evidence pipeline tables)
  const { data: sourceDocuments } = await supabase
    .from('source_documents')
    .select('*')
    .eq('project_id', id)
    .order('created_at');

  const { data: layerCandidates } = await supabase
    .from('layer_candidates')
    .select('*')
    .eq('project_id', id)
    .eq('status', 'active')
    .order('confidence', { ascending: false });

  const { data: latestBundle } = await supabase
    .from('compiled_bundles')
    .select('*')
    .eq('project_id', id)
    .order('created_at', { ascending: false })
    .limit(1);

  return (
    <ProjectDashboard
      project={project}
      snapshots={snapshots ?? []}
      files={files ?? []}
      dataSources={dataSources ?? []}
      hasAgentConfig={!!agentConfig}
      sourceDocuments={sourceDocuments ?? []}
      layerCandidates={layerCandidates ?? []}
      compiledBundle={latestBundle?.[0] ?? null}
    />
  );
}
