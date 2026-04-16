import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { SessionContextPanel } from '@/components/session-context-panel';

export default async function PopOutContextPage({
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
    <div className="h-screen bg-[#06060e] flex flex-col">
      <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/staipler-logo.svg" alt="stAIpler" className="h-5 w-auto" />
          <span className="text-xs text-slate-300">{project.name} · Context</span>
        </div>
        <span className="text-[10px] text-slate-400">Pop-out window</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <SessionContextPanel projectId={id} standalone />
      </div>
    </div>
  );
}
