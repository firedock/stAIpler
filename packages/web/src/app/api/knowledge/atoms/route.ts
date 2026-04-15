import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const status = searchParams.get('status');
  const reviewState = searchParams.get('reviewState');
  const limit = Number(searchParams.get('limit') ?? 200);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  let query = supabase
    .from('knowledge_atoms')
    .select('id, concept_slug, atom_type, content, status, source_authority, authority_breakdown, review_state, is_pinned, source_log_ids, source_document_ids, handoff_ids, parent_atom_id, superseded_by, reinforcement_count, distinct_session_count, created_at, last_reinforced_at, promoted_at, deprecated_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (reviewState) query = query.eq('review_state', reviewState);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ atoms: data ?? [] });
}
