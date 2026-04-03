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

  return (
    <ProjectDashboard
      project={project}
      snapshots={snapshots ?? []}
      files={files ?? []}
      dataSources={dataSources ?? []}
    />
  );
}
