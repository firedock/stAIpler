import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/crypto';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { displayName, description, provider, model, apiKey } = await request.json();

    if (!displayName?.trim()) {
      return NextResponse.json({ error: 'Display name is required' }, { status: 400 });
    }
    if (!provider || !['anthropic', 'openai', 'hosted'].includes(provider)) {
      return NextResponse.json({ error: 'Valid provider is required' }, { status: 400 });
    }

    // Create project
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .insert({
        name: displayName.trim(),
        description: description?.trim() || null,
        user_id: user.id,
      })
      .select()
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: projectError?.message ?? 'Failed to create project' }, { status: 500 });
    }

    // Create agent config
    const agentConfig: Record<string, any> = {
      project_id: project.id,
      provider,
      model: model || defaultModel(provider),
      display_name: displayName.trim(),
    };

    if (provider !== 'hosted' && apiKey) {
      agentConfig.api_key_encrypted = encrypt(apiKey);
    }

    const { error: configError } = await supabase
      .from('agent_configs')
      .insert(agentConfig);

    if (configError) {
      // Rollback project on config failure
      await supabase.from('projects').delete().eq('id', project.id);
      return NextResponse.json({ error: configError.message }, { status: 500 });
    }

    return NextResponse.json({ projectId: project.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Setup failed' }, { status: 500 });
  }
}

function defaultModel(provider: string): string {
  switch (provider) {
    case 'anthropic': return 'claude-sonnet-4-20250514';
    case 'openai': return 'gpt-4o';
    case 'hosted': return 'claude-sonnet-4-20250514';
    default: return 'claude-sonnet-4-20250514';
  }
}
