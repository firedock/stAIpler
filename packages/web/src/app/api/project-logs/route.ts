import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  const date = searchParams.get('date'); // YYYY-MM-DD, default: today
  const limit = Number(searchParams.get('limit') ?? 200);

  if (!projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const target = date ? new Date(`${date}T00:00:00Z`) : new Date();
  const dayStart = new Date(target);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const { data, error } = await supabase
    .from('project_logs')
    .select('id, role, content, mode, provider, model, token_estimate, created_at')
    .eq('project_id', projectId)
    .gte('created_at', dayStart.toISOString())
    .lt('created_at', dayEnd.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    date: dayStart.toISOString().slice(0, 10),
    logs: data ?? [],
  });
}
