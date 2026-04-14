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

  // Fetch agent config if it exists (for persisted provider/key)
  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('provider, model, display_name')
    .eq('project_id', id)
    .single();

  return (
    <ChatWithDemo
      projectId={id}
      projectName={agentConfig?.display_name || project.name}
      isDemo={demo === '1'}
      agentConfig={agentConfig ? {
        provider: agentConfig.provider,
        model: agentConfig.model,
        displayName: agentConfig.display_name,
      } : undefined}
    />
  );
}
