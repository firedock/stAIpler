import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ProjectCard } from '@/components/project-card';
import { EmptyState } from '@/components/empty-state';

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: projects } = await supabase
    .from('projects')
    .select('*, snapshots(count)')
    .order('updated_at', { ascending: false });

  // First-time users: send them through the guided setup wizard
  if (!projects || projects.length === 0) {
    redirect('/dashboard/setup');
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold">Projects</h1>
          <p className="text-sm text-slate-500 mt-1">Track and optimize your AI agent context</p>
        </div>
        <Link
          href="/dashboard/new"
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition"
        >
          New Project
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project: any) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
