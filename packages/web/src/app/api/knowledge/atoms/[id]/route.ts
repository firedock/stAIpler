import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  const [{ data: atom, error: atomErr }, { data: events, error: eventsErr }] = await Promise.all([
    supabase.from('knowledge_atoms').select('*').eq('id', id).maybeSingle(),
    supabase
      .from('knowledge_atom_events')
      .select('id, event_type, actor, trigger_ref, payload, created_at')
      .eq('atom_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (atomErr) return NextResponse.json({ error: atomErr.message }, { status: 500 });
  if (eventsErr) return NextResponse.json({ error: eventsErr.message }, { status: 500 });
  if (!atom) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ atom, events: events ?? [] });
}
