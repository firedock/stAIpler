import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  applyReviewDecisions,
  buildReviewItems,
  organizeCandidates,
  compileBundle,
  computeReadinessScore,
} from '@staipler/core';
import type { LayerCandidate, ReviewDecision } from '@staipler/core';
import { storeCompiledBundle } from '@/lib/pipeline/store';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, decisions } = await request.json() as {
      projectId: string;
      decisions: ReviewDecision[];
    };

    // Fetch current candidates
    const { data: candidateRows } = await supabase
      .from('layer_candidates')
      .select('*')
      .eq('project_id', projectId)
      .eq('status', 'active');

    if (!candidateRows || candidateRows.length === 0) {
      return NextResponse.json({ error: 'No candidates found' }, { status: 400 });
    }

    // Convert DB rows to LayerCandidate type
    const candidates: LayerCandidate[] = candidateRows.map(row => ({
      id: row.id,
      sourceDocumentId: row.source_document_id,
      projectId: row.project_id,
      layer: row.layer,
      content: row.content,
      confidence: row.confidence,
      rationale: row.rationale ?? '',
      extractionMethod: row.extraction_method,
      provenance: row.provenance,
    }));

    // Build review items to apply decisions against
    const { resolvedLayers } = organizeCandidates(candidates);
    const reviewItems = buildReviewItems(resolvedLayers, candidates);

    // Apply user decisions
    const updatedCandidates = applyReviewDecisions(candidates, reviewItems, decisions);

    // Re-organize and re-compile with user decisions applied
    const { resolvedLayers: newResolvedLayers } = organizeCandidates(updatedCandidates);

    // Count source documents
    const { count: sourceDocCount } = await supabase
      .from('source_documents')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    const newBundle = compileBundle(newResolvedLayers, sourceDocCount ?? 0, updatedCandidates.length);

    // Persist the new bundle
    await storeCompiledBundle(supabase, projectId, newBundle, newResolvedLayers);

    // Mark skipped candidates as superseded in the database
    const activeIds = new Set(updatedCandidates.map(c => c.id));
    const skippedIds = candidates.filter(c => !activeIds.has(c.id)).map(c => c.id);

    if (skippedIds.length > 0) {
      await supabase
        .from('layer_candidates')
        .update({ status: 'superseded' })
        .in('id', skippedIds);
    }

    const { readinessScore, grade, layerScores } = computeReadinessScore(newResolvedLayers);

    return NextResponse.json({
      success: true,
      readinessScore,
      grade,
      layerScores,
      populatedLayers: newBundle.sections.map(s => s.layer),
      gaps: newBundle.gaps,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Resolve failed' }, { status: 500 });
  }
}
