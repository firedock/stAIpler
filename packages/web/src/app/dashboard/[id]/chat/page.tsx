import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import { Chat } from '@/components/chat';

export default async function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single();

  if (!project) notFound();

  return <Chat projectId={id} projectName={project.name} />;
}
