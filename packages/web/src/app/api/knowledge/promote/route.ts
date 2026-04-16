import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyPromotionRules } from '@/lib/knowledge/promote';

/**
 * POST /api/knowledge/promote
 * Body: { projectId: string, atomIds?: string[] }
 *
 * Applies the auto-promotion rule engine (candidate → provisional only).
 * 'stable' is never reachable from here — only the review queue action
 * route with actor='user' can produce stable.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  const atomIds = Array.isArray(body.atomIds)
    ? body.atomIds.filter((x: unknown): x is string => typeof x === 'string')
    : undefined;

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

  const result = await applyPromotionRules(supabase, projectId, { atomIds });
  if (result.error) {
    return NextResponse.json({ error: result.error, ...result }, { status: 500 });
  }
  return NextResponse.json(result);
}
