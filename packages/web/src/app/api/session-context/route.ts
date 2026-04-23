import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { applyDecay } from '@staipler/core';
import type { HandoffPacket } from '@staipler/core';

/**
 * GET /api/session-context?projectId=xxx
 *
 * Returns everything the agent is using in this session:
 * - Source documents that contributed to the system prompt
 * - Active instruction layers and their status
 * - Active handoffs (operational wisdom)
 * - Unresolved conflicts
 * - Gaps (layers with no content)
 * - System prompt preview
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });

    // Fetch all relevant context in parallel
    const [
      { data: sourceDocuments },
      { data: layerCandidates },
      { data: bundleRows },
      { data: handoffRows },
      { data: files },
    ] = await Promise.all([
      supabase.from('source_documents').select('id, title, metadata, raw_content').eq('project_id', projectId),
      supabase.from('layer_candidates').select('layer, content, confidence, extraction_method, provenance, source_document_id').eq('project_id', projectId).eq('status', 'active'),
      supabase.from('compiled_bundles').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(1),
      supabase.from('session_handoffs').select('*').eq('project_id', projectId).eq('status', 'active'),
      supabase.from('project_files').select('file_name, inferred_kind, inferred_confidence, source_type, content_length').eq('project_id', projectId),
    ]);

    const bundle = bundleRows?.[0] ?? null;

    // Apply decay to handoffs
    const now = new Date();
    const activeHandoffs: HandoffPacket[] = (handoffRows ?? [])
      .map(row => applyDecay({
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
      }, now))
      .filter(h => h.status === 'active');

    // Build layer summary
    const CANONICAL_ORDER = ['identity', 'constraints', 'context', 'goals', 'skills', 'style', 'policies', 'examples', 'tools', 'evals', 'prompts', 'memory', 'continuity'];
    const sectionsByLayer = new Map<string, any>();
    if (bundle?.sections) {
      for (const section of bundle.sections) sectionsByLayer.set(section.layer, section);
    }

    const candidatesByLayer = new Map<string, typeof layerCandidates>();
    for (const c of layerCandidates ?? []) {
      if (!candidatesByLayer.has(c.layer)) candidatesByLayer.set(c.layer, []);
      candidatesByLayer.get(c.layer)!.push(c);
    }

    const filesByLayer = new Map<string, typeof files>();
    for (const f of files ?? []) {
      if (!f.inferred_kind) continue;
      if (!filesByLayer.has(f.inferred_kind)) filesByLayer.set(f.inferred_kind, []);
      filesByLayer.get(f.inferred_kind)!.push(f);
    }

    const layers = CANONICAL_ORDER.map(layer => {
      const section = sectionsByLayer.get(layer);
      const candidates = candidatesByLayer.get(layer) ?? [];
      const layerFiles = filesByLayer.get(layer) ?? [];
      return {
        layer,
        status: section?.status ?? (layerFiles.length > 0 ? 'source-grounded' : 'missing'),
        candidateCount: candidates.length,
        fileCount: layerFiles.length,
        hasContent: !!section || layerFiles.length > 0,
      };
    });

    return NextResponse.json({
      sourceDocuments: (sourceDocuments ?? []).map(d => ({
        id: d.id,
        title: d.title,
        provider: d.metadata?.provider ?? 'unknown',
        contentLength: d.raw_content?.length ?? 0,
      })),
      layers,
      handoffs: activeHandoffs.map(h => ({
        id: h.id,
        classification: h.classification,
        content: h.content,
        effectiveConfidence: h.effectiveConfidence,
        reinforcementCount: h.reinforcementCount,
      })),
      conflicts: bundle?.conflicts ?? [],
      gaps: bundle?.gaps ?? [],
      systemPrompt: bundle?.system_prompt ?? null,
      tokenEstimate: bundle?.metadata?.tokenEstimate ?? 0,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to load session context' }, { status: 500 });
  }
}
