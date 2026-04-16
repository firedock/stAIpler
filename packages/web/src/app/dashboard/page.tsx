import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ProjectCard } from '@/components/project-card';

function gradeBand(score: number): 'expert' | 'good' | 'needs' | 'blind' {
  if (score >= 80) return 'expert';
  if (score >= 60) return 'good';
  if (score >= 40) return 'needs';
  return 'blind';
}

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

  // Aggregate stats — gives the page a sense of scale and portfolio health
  const total = projects.length;
  const totalSnapshots = projects.reduce((s: number, p: any) => s + (p.snapshots?.[0]?.count ?? 0), 0);
  const avgScore = Math.round(
    projects.reduce((s: number, p: any) => s + (p.readiness_score ?? 0), 0) / total,
  );
  const bands = projects.reduce(
    (acc: Record<string, number>, p: any) => {
      const b = gradeBand(p.readiness_score ?? 0);
      acc[b] = (acc[b] ?? 0) + 1;
      return acc;
    },
    { expert: 0, good: 0, needs: 0, blind: 0 },
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      {/* Hero */}
      <div className="mb-8 pb-8 border-b border-white/[0.05] flex flex-col lg:flex-row lg:justify-between lg:items-start gap-6">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
            <span className="text-[0.65rem] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-md border text-purple-300 bg-purple-500/10 border-purple-500/20">
              {total} {total === 1 ? 'Project' : 'Projects'}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-2">Track and optimize your AI agent context across every initiative.</p>
        </div>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10 whitespace-nowrap self-start"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </Link>
      </div>

      {/* Portfolio stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
          <div className="text-2xl font-bold tabular-nums">{avgScore}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1.5 font-semibold">Avg Score</div>
        </div>
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.05] p-4">
          <div className="text-2xl font-bold tabular-nums">{totalSnapshots}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1.5 font-semibold">Snapshots</div>
        </div>
        <div className="rounded-xl bg-emerald-500/[0.04] border border-emerald-500/15 p-4">
          <div className="text-2xl font-bold tabular-nums text-emerald-400">{bands.expert + bands.good}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1.5 font-semibold">Healthy</div>
        </div>
        <div className="rounded-xl bg-red-500/[0.04] border border-red-500/15 p-4">
          <div className="text-2xl font-bold tabular-nums text-red-400">{bands.needs + bands.blind}</div>
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mt-1.5 font-semibold">Need Work</div>
        </div>
      </div>

      {/* Section label */}
      <div className="flex items-baseline justify-between mb-4">
        <div className="text-[11px] uppercase tracking-[0.15em] text-purple-300 font-bold">All Projects</div>
        <div className="text-xs text-slate-500">Sorted by last updated</div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project: any) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
    </div>
  );
}
