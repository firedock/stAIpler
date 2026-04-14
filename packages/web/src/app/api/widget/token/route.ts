import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { randomBytes } from 'crypto';

// GET: fetch existing deploy token for a project
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    const { data: deployToken } = await supabase
      .from('deploy_tokens')
      .select('token, enabled, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!deployToken) return NextResponse.json({ token: null });
    return NextResponse.json({ token: deployToken.token, enabled: deployToken.enabled });
  } catch {
    return NextResponse.json({ token: null });
  }
}

// POST: generate a new deploy token
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, accentColor, welcomeMessage } = await request.json();
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    // Verify user owns this project
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', projectId)
      .single();

    if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });

    // Generate token
    const token = randomBytes(24).toString('base64url');

    const { error: tokenError } = await supabase
      .from('deploy_tokens')
      .insert({
        project_id: projectId,
        token,
        allowed_origins: [],
        rate_limit_rpm: 20,
        enabled: true,
      });

    if (tokenError) return NextResponse.json({ error: tokenError.message }, { status: 500 });

    // Save widget config to agent_configs
    if (accentColor || welcomeMessage) {
      await supabase
        .from('agent_configs')
        .update({
          widget_config: {
            accent_color: accentColor || '#7c3aed',
            welcome_message: welcomeMessage || 'Hi! How can I help you today?',
          },
        })
        .eq('project_id', projectId);
    }

    return NextResponse.json({ token });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to generate token' }, { status: 500 });
  }
}
