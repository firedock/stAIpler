import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { extractFromLogs } from '@/lib/knowledge/extract';
import { reconcileAtoms } from '@/lib/knowledge/reconcile';
import { applyPromotionRules } from '@/lib/knowledge/promote';

/**
 * POST /api/knowledge/extract
 * Body: { projectId: string, sinceIso?: string, sessionId?: string }
 *
 * Runs the extract stage against recent project_logs for the given project.
 * Default window: since the last successful extract run, else last 24h.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === 'string' ? body.projectId : null;
  const sinceIso = typeof body.sinceIso === 'string' ? body.sinceIso : null;
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId : null;

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  // Verify the user owns the project (defense-in-depth; RLS also guards inserts).
  const { data: project } = await supabase
    .from('projects')
    .select('id')
    .eq('id', projectId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const result = await extractFromLogs(supabase, projectId, user.id, { sinceIso, sessionId });

  if (result.error) {
    return NextResponse.json({ error: result.error, ...result }, { status: 500 });
  }

  // Chain reconcile + promote when extract produced new atoms. Failures
  // don't block the extract response — each stage has its own failed-run
  // visibility in the pipeline panel.
  let reconcile = null as Awaited<ReturnType<typeof reconcileAtoms>> | null;
  let promote = null as Awaited<ReturnType<typeof applyPromotionRules>> | null;
  if (result.extractedCount > 0) {
    try { reconcile = await reconcileAtoms(supabase, projectId); } catch { /* recorded as failed run */ }
    try { promote = await applyPromotionRules(supabase, projectId); } catch { /* recorded as failed run */ }
  }

  return NextResponse.json({ ...result, reconcile, promote });
}
