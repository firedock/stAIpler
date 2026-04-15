import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { renderKnowledge } from '@/lib/knowledge/render';

/**
 * POST /api/knowledge/render
 * Body: { projectId: string }
 *
 * Regenerates concept articles and the compact prompt view from the
 * current atom set. Deterministic; safe to run repeatedly.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const result = await renderKnowledge(supabase, projectId);
  if (result.error) {
    return NextResponse.json({ error: result.error, ...result }, { status: 500 });
  }
  return NextResponse.json(result);
}
