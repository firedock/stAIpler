import { createServiceClient } from '@/lib/supabase/service';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get('token');
  if (!token) return Response.json({ error: 'token required' }, { status: 400 });

  const supabase = createServiceClient();

  const { data: deployToken } = await supabase
    .from('deploy_tokens')
    .select('project_id, enabled')
    .eq('token', token)
    .single();

  if (!deployToken || !deployToken.enabled) {
    return Response.json({ error: 'Invalid token' }, { status: 403 });
  }

  const { data: agentConfig } = await supabase
    .from('agent_configs')
    .select('display_name, widget_config')
    .eq('project_id', deployToken.project_id)
    .single();

  const config = agentConfig?.widget_config as Record<string, any> ?? {};
  const origin = request.headers.get('origin');

  return Response.json({
    displayName: agentConfig?.display_name ?? 'AI Assistant',
    accentColor: config.accent_color ?? '#7c3aed',
    welcomeMessage: config.welcome_message ?? 'Hi! How can I help you today?',
    position: config.position ?? 'bottom-right',
  }, {
    headers: origin ? {
      'Access-Control-Allow-Origin': origin,
      'Cache-Control': 'public, max-age=300',
    } : { 'Cache-Control': 'public, max-age=300' },
  });
}
