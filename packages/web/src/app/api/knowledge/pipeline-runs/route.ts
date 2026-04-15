import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const STAGES = ['extract', 'reconcile', 'review', 'promote', 'render', 'inject'] as const;

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const perStage = Number(searchParams.get('perStage') ?? 10);
  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('knowledge_pipeline_runs')
    .select('id, stage, session_id, status, counts, error, started_at, completed_at')
    .eq('project_id', projectId)
    .order('started_at', { ascending: false })
    .limit(perStage * STAGES.length);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const byStage: Record<string, typeof data> = {};
  for (const stage of STAGES) byStage[stage] = [];
  for (const row of data ?? []) {
    const bucket = byStage[row.stage];
    if (bucket && bucket.length < perStage) bucket.push(row);
  }

  const stageSummaries = STAGES.map(stage => {
    const runs = byStage[stage] ?? [];
    const latest = runs[0];
    return {
      stage,
      runCount: runs.length,
      latest: latest
        ? {
            id: latest.id,
            status: latest.status,
            startedAt: latest.started_at,
            completedAt: latest.completed_at,
            counts: latest.counts,
            error: latest.error,
          }
        : null,
      recent: runs,
    };
  });

  return NextResponse.json({ stages: stageSummaries });
}
