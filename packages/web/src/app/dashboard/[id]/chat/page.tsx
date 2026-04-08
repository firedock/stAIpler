import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { ChatWithDemo } from '@/components/chat-with-demo';

export default async function ChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ demo?: string }>;
}) {
  const { id } = await params;
  const { demo } = await searchParams;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  return <ChatWithDemo projectId={id} projectName={project.name} isDemo={demo === '1'} />;
}
