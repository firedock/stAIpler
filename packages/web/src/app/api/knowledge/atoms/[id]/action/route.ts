import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { renderKnowledge } from '@/lib/knowledge/render';

/**
 * POST /api/knowledge/atoms/[id]/action
 * Body: { action: 'approve' | 'reject' | 'edit' | 'promote' | 'demote' | 'merge',
 *         content?: string,   // for edit
 *         peerAtomId?: string // for merge: the target atom to merge INTO }
 *
 * Encodes the review-queue actions with their state transitions and events.
 * Every action writes a knowledge_atom_events row with actor='user'.
 *
 * Hard guard: any transition to status='stable' must be invoked here (actor=user).
 * The extract/reconcile/render/inject paths are forbidden from producing stable.
 */

type Action = 'approve' | 'reject' | 'edit' | 'promote' | 'demote' | 'merge';

interface AtomRow {
  id: string;
  project_id: string;
  status: 'candidate' | 'provisional' | 'stable' | 'deprecated' | 'contradicted';
  source_authority: 'assistant' | 'user' | 'source_document' | 'mixed';
  review_state: 'pending' | 'approved' | 'rejected' | 'edited' | 'deferred';
  content: string;
  is_pinned: boolean;
  reinforcement_count: number;
  distinct_session_count: number;
  superseded_by: string | null;
}

async function getAtom(supabase: SupabaseClient, id: string): Promise<AtomRow | null> {
  const { data } = await supabase.from('knowledge_atoms').select('*').eq('id', id).maybeSingle();
  return (data as AtomRow | null) ?? null;
}

async function logEvent(
  supabase: SupabaseClient,
  atomId: string,
  projectId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
  triggerRef?: string,
) {
  await supabase.from('knowledge_atom_events').insert({
    atom_id: atomId,
    project_id: projectId,
    event_type: eventType,
    actor: 'user',
    trigger_ref: triggerRef ?? 'review_queue',
    payload,
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const action = body.action as Action;
  if (!['approve', 'reject', 'edit', 'promote', 'demote', 'merge'].includes(action)) {
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  }

  const atom = await getAtom(supabase, id);
  if (!atom) return NextResponse.json({ error: 'Atom not found' }, { status: 404 });

  // RLS already scopes visibility, but the check above used the user's client so
  // unauthorized atoms would have returned null.

  // Actions that change status or content trigger a render so the prompt
  // view and articles stay current. Fire-and-forget; render has its own
  // failed-run visibility.
  const actionsAffectingArtifacts = new Set<Action>(['approve', 'edit', 'promote', 'demote', 'merge']);
  async function maybeRender() {
    if (!actionsAffectingArtifacts.has(action)) return;
    try { await renderKnowledge(supabase, atom!.project_id); } catch { /* recorded as failed render run */ }
  }

  switch (action) {
    case 'approve': {
      // Stamp approval. Auto-promote candidate → provisional if authority justifies it.
      const updates: Partial<AtomRow> = { review_state: 'approved' };
      let promoted = false;
      if (atom.status === 'candidate' && (atom.source_authority === 'user' || atom.source_authority === 'source_document')) {
        updates.status = 'provisional';
        promoted = true;
      }
      const { error } = await supabase.from('knowledge_atoms').update(updates).eq('id', atom.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await logEvent(supabase, atom.id, atom.project_id, 'user_approved', {
        from_status: atom.status,
        to_status: promoted ? 'provisional' : atom.status,
        from_review_state: atom.review_state,
      });
      await maybeRender();
      return NextResponse.json({ ok: true, promoted });
    }

    case 'reject': {
      const { error } = await supabase
        .from('knowledge_atoms')
        .update({ review_state: 'rejected' })
        .eq('id', atom.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logEvent(supabase, atom.id, atom.project_id, 'user_rejected', {
        from_review_state: atom.review_state,
      });
      return NextResponse.json({ ok: true });
    }

    case 'edit': {
      const content = typeof body.content === 'string' ? body.content.trim() : '';
      if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 });
      if (content.length > 2000) return NextResponse.json({ error: 'content too long' }, { status: 400 });
      const previous = atom.content;
      const { error } = await supabase
        .from('knowledge_atoms')
        .update({ content, review_state: 'edited' })
        .eq('id', atom.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logEvent(supabase, atom.id, atom.project_id, 'user_edited', {
        previous_content: previous,
      });
      await maybeRender();
      return NextResponse.json({ ok: true });
    }

    case 'promote': {
      // provisional → stable only. stable requires manual user action.
      if (atom.status !== 'provisional') {
        return NextResponse.json(
          { error: `Cannot promote from status '${atom.status}'. Promote is provisional → stable only.` },
          { status: 400 },
        );
      }
      const { error } = await supabase
        .from('knowledge_atoms')
        .update({
          status: 'stable',
          review_state: atom.review_state === 'pending' ? 'approved' : atom.review_state,
          promoted_at: new Date().toISOString(),
        })
        .eq('id', atom.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      await logEvent(supabase, atom.id, atom.project_id, 'user_approved', {
        from_status: 'provisional',
        to_status: 'stable',
        note: 'Manual promotion to stable via review queue.',
      });
      await maybeRender();
      return NextResponse.json({ ok: true });
    }

    case 'demote': {
      // stable → deprecated; provisional → candidate.
      let nextStatus: AtomRow['status'] | null = null;
      if (atom.status === 'stable') nextStatus = 'deprecated';
      else if (atom.status === 'provisional') nextStatus = 'candidate';
      if (!nextStatus) {
        return NextResponse.json(
          { error: `Cannot demote from status '${atom.status}'.` },
          { status: 400 },
        );
      }
      const updates: Record<string, unknown> = { status: nextStatus };
      if (nextStatus === 'deprecated') updates.deprecated_at = new Date().toISOString();
      const { error } = await supabase.from('knowledge_atoms').update(updates).eq('id', atom.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      await logEvent(
        supabase,
        atom.id,
        atom.project_id,
        nextStatus === 'deprecated' ? 'deprecated' : 'user_demoted',
        { from_status: atom.status, to_status: nextStatus },
      );
      await maybeRender();
      return NextResponse.json({ ok: true, status: nextStatus });
    }

    case 'merge': {
      // Merge THIS atom into peer. This one becomes deprecated with superseded_by = peer.id.
      const peerId = typeof body.peerAtomId === 'string' ? body.peerAtomId : null;
      if (!peerId) return NextResponse.json({ error: 'peerAtomId required' }, { status: 400 });
      const peer = await getAtom(supabase, peerId);
      if (!peer) return NextResponse.json({ error: 'Peer atom not found' }, { status: 404 });
      if (peer.project_id !== atom.project_id) {
        return NextResponse.json({ error: 'Cross-project merge disallowed' }, { status: 400 });
      }
      if (peer.id === atom.id) {
        return NextResponse.json({ error: 'Cannot merge atom into itself' }, { status: 400 });
      }

      // Deprecate the source atom, link superseded_by, stamp reason via event.
      const { error: depErr } = await supabase
        .from('knowledge_atoms')
        .update({
          status: 'deprecated',
          superseded_by: peer.id,
          deprecated_at: new Date().toISOString(),
          review_state: 'approved',
        })
        .eq('id', atom.id);
      if (depErr) return NextResponse.json({ error: depErr.message }, { status: 500 });

      // Carry reinforcement into the winner.
      const { error: peerErr } = await supabase
        .from('knowledge_atoms')
        .update({
          reinforcement_count: peer.reinforcement_count + Math.max(1, atom.reinforcement_count),
          distinct_session_count: peer.distinct_session_count + Math.max(1, atom.distinct_session_count),
          last_reinforced_at: new Date().toISOString(),
        })
        .eq('id', peer.id);
      if (peerErr) return NextResponse.json({ error: peerErr.message }, { status: 500 });

      await logEvent(supabase, atom.id, atom.project_id, 'superseded', {
        reason: 'user_merge',
        superseded_by: peer.id,
        from_status: atom.status,
        to_status: 'deprecated',
      });
      await logEvent(supabase, peer.id, atom.project_id, 'user_merged_into', {
        merged_from: atom.id,
        reinforcement_carried: Math.max(1, atom.reinforcement_count),
        sessions_carried: Math.max(1, atom.distinct_session_count),
      });
      await maybeRender();
      return NextResponse.json({ ok: true, superseded_by: peer.id });
    }
  }
}
