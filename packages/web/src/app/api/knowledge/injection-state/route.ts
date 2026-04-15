import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * Returns the most recent inject-stage run's decisions for a project,
 * plus the atom rows referenced, so the Session Context panel can render
 * Included / Withheld lists with provenance.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const { data: latestRun } = await supabase
    .from('knowledge_pipeline_runs')
    .select('id, started_at, completed_at, status, counts')
    .eq('project_id', projectId)
    .eq('stage', 'inject')
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestRun) {
    return NextResponse.json({
      run: null,
      decisions: [],
      atoms: [],
      promptView: null,
    });
  }

  const { data: decisions } = await supabase
    .from('knowledge_injection_decisions')
    .select('id, atom_id, decision, reason, token_cost, compiled_at')
    .eq('project_id', projectId)
    .eq('inject_run_id', latestRun.id);

  const atomIds = Array.from(new Set((decisions ?? []).map(d => d.atom_id)));
  const atomsResult = atomIds.length > 0
    ? await supabase
        .from('knowledge_atoms')
        .select('id, concept_slug, atom_type, content, status, source_authority, authority_breakdown, review_state, is_pinned, source_log_ids, source_document_ids, handoff_ids, parent_atom_id, superseded_by, reinforcement_count, distinct_session_count, created_at, promoted_at, deprecated_at, last_reinforced_at')
        .in('id', atomIds)
    : { data: [] };

  const { data: promptView } = await supabase
    .from('knowledge_prompt_view')
    .select('body_md, token_estimate, atom_ids, rendered_at')
    .eq('project_id', projectId)
    .maybeSingle();

  return NextResponse.json({
    run: latestRun,
    decisions: decisions ?? [],
    atoms: atomsResult.data ?? [],
    promptView: promptView ?? null,
  });
}
