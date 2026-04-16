import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { KnowledgePipelinePanel } from '@/components/knowledge/pipeline-panel';

export default async function KnowledgePipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', id)
    .single();

  if (!project) notFound();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      {/* Hero — matches the project detail header pattern for visual consistency */}
      <div className="mb-10 pb-8 border-b border-white/[0.05] flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
        <div className="min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[0.7rem] font-bold tracking-[0.18em] uppercase px-2.5 py-1 rounded-md border text-amber-300 bg-amber-500/10 border-amber-500/20">
              Agent Knowledge
            </span>
            <Link
              href={`/dashboard/${id}`}
              className="text-xs text-slate-500 hover:text-slate-300 transition"
            >
              ← {project.name}
            </Link>
          </div>
          <h1 className="text-3xl font-bold tracking-tight mt-3">Knowledge Pipeline</h1>
          <p className="text-base text-slate-400 mt-2 max-w-2xl leading-relaxed">
            Six stages: <span className="text-slate-200 font-medium">extract → reconcile → review → promote → render → inject</span>. Every run is recorded; nothing runs invisibly.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/dashboard/${id}/knowledge/review`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-sm font-semibold text-white hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-amber-500/10 whitespace-nowrap"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            Review Queue
          </Link>
        </div>
      </div>

      <KnowledgePipelinePanel projectId={id} />
    </div>
  );
}
