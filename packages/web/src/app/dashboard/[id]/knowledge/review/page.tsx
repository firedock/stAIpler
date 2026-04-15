import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ReviewQueue } from '@/components/knowledge/review-queue';

export default async function KnowledgeReviewPage({
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
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">
            Review queue
          </div>
          <h1 className="text-2xl font-bold mt-1">{project.name}</h1>
          <p className="text-sm text-slate-400 mt-1">
            Candidate atoms awaiting your decision. Canonization requires a human —
            the system may propose, but it may not stabilize.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/${id}/knowledge`}
            className="px-3 py-1.5 rounded-md text-xs text-slate-400 hover:text-slate-200 transition"
          >
            ← Pipeline
          </Link>
        </div>
      </div>

      <ReviewQueue projectId={id} />
    </div>
  );
}
