import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  createHandoffPacket,
  reinforceHandoff,
  findSimilarHandoff,
  applyDecay,
} from '@staipler/core';
import type { EmitHandoffInput, HandoffPacket } from '@staipler/core';

/**
 * GET /api/handoffs?projectId=xxx
 * Returns active handoffs for a project with decay applied.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

    const { data: rows } = await supabase
      .from('session_handoffs')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (!rows) return NextResponse.json({ handoffs: [] });

    // Convert DB rows to HandoffPacket and apply decay
    const now = new Date();
    const handoffs: HandoffPacket[] = rows.map(row => {
      const packet: HandoffPacket = {
        id: row.id,
        projectId: row.project_id,
        classification: row.classification,
        content: row.content,
        initialConfidence: row.initial_confidence,
        effectiveConfidence: row.effective_confidence,
        provenance: row.provenance,
        reinforcementCount: row.reinforcement_count,
        createdAt: row.created_at,
        lastReinforcedAt: row.last_reinforced_at,
        status: row.status,
      };
      return applyDecay(packet, now);
    });

    // Update any that have decayed past the threshold
    const newlyDecayed = handoffs.filter(
      (h, i) => h.status === 'decayed' && rows[i].status === 'active'
    );
    if (newlyDecayed.length > 0) {
      for (const h of newlyDecayed) {
        await supabase
          .from('session_handoffs')
          .update({ status: 'decayed', effective_confidence: h.effectiveConfidence })
          .eq('id', h.id);
      }
    }

    return NextResponse.json({
      handoffs,
      activeCount: handoffs.filter(h => h.status === 'active').length,
      decayedCount: handoffs.filter(h => h.status === 'decayed').length,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to fetch handoffs' }, { status: 500 });
  }
}

/**
 * POST /api/handoffs
 * Emit a new handoff or reinforce an existing one.
 *
 * If the content is similar to an existing active handoff,
 * the existing one is reinforced instead of creating a duplicate.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as EmitHandoffInput;

    if (!body.projectId || !body.content || !body.classification) {
      return NextResponse.json({ error: 'Missing required fields: projectId, content, classification' }, { status: 400 });
    }

    // Fetch existing active handoffs for dedup check
    const { data: existingRows } = await supabase
      .from('session_handoffs')
      .select('*')
      .eq('project_id', body.projectId)
      .eq('status', 'active');

    const existingHandoffs: HandoffPacket[] = (existingRows ?? []).map(row => ({
      id: row.id,
      projectId: row.project_id,
      classification: row.classification,
      content: row.content,
      initialConfidence: row.initial_confidence,
      effectiveConfidence: row.effective_confidence,
      provenance: row.provenance,
      reinforcementCount: row.reinforcement_count,
      createdAt: row.created_at,
      lastReinforcedAt: row.last_reinforced_at,
      status: row.status,
    }));

    // Check for similar existing handoff
    const similar = findSimilarHandoff(body.content, existingHandoffs);

    if (similar) {
      // Reinforce existing handoff instead of creating duplicate
      const reinforced = reinforceHandoff(similar, body.sessionId);

      await supabase
        .from('session_handoffs')
        .update({
          effective_confidence: reinforced.effectiveConfidence,
          reinforcement_count: reinforced.reinforcementCount,
          last_reinforced_at: reinforced.lastReinforcedAt,
          provenance: reinforced.provenance,
          status: 'active',
        })
        .eq('id', similar.id);

      return NextResponse.json({
        action: 'reinforced',
        handoff: reinforced,
        message: `Reinforced existing handoff (${reinforced.reinforcementCount}x)`,
      });
    }

    // Create new handoff
    const packet = createHandoffPacket(body);

    const { error } = await supabase.from('session_handoffs').insert({
      id: packet.id,
      project_id: packet.projectId,
      classification: packet.classification,
      content: packet.content,
      initial_confidence: packet.initialConfidence,
      effective_confidence: packet.effectiveConfidence,
      provenance: packet.provenance,
      reinforcement_count: 0,
      last_reinforced_at: packet.lastReinforcedAt,
      status: 'active',
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      action: 'created',
      handoff: packet,
      message: `New ${packet.classification} handoff created`,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to emit handoff' }, { status: 500 });
  }
}

/**
 * PATCH /api/handoffs
 * Resolve or supersede a handoff.
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { handoffId, status } = await request.json() as {
      handoffId: string;
      status: 'resolved' | 'superseded';
    };

    const { error } = await supabase
      .from('session_handoffs')
      .update({ status })
      .eq('id', handoffId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update handoff' }, { status: 500 });
  }
}
