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
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
            Knowledge pipeline
          </div>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Six stages: extract → reconcile → review → promote → render → inject.
            Every run is recorded; nothing runs invisibly.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${id}/knowledge/review`}
            className="px-3 py-1.5 rounded-md text-xs bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-slate-200 transition"
          >
            Review queue
          </Link>
          <Link
            href={`/dashboard/${id}`}
            className="px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 transition"
          >
            ← Project
          </Link>
        </div>
      </div>

      <KnowledgePipelinePanel projectId={id} />
    </div>
  );
}
