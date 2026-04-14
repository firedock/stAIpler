/**
 * Pipeline Persistence Layer
 *
 * Functions to persist evidence pipeline results to Supabase.
 * Used by connector routes after running the pipeline.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  SourceDocument,
  LayerCandidate,
  CompiledInstructionBundle,
  ResolvedLayer,
  TransformationLog,
} from '@staipler/core';

/**
 * Store source documents in Supabase.
 * Skips documents whose content_hash already exists for this project.
 */
export async function storeSourceDocuments(
  supabase: SupabaseClient,
  docs: SourceDocument[],
): Promise<void> {
  if (docs.length === 0) return;

  const projectId = docs[0].projectId;

  // Check existing hashes to avoid duplicates
  const { data: existing } = await supabase
    .from('source_documents')
    .select('content_hash')
    .eq('project_id', projectId);

  const existingHashes = new Set((existing ?? []).map(e => e.content_hash));

  const newDocs = docs.filter(d => !existingHashes.has(d.contentHash));
  if (newDocs.length === 0) return;

  const rows = newDocs.map(d => ({
    id: d.id,
    project_id: d.projectId,
    data_source_id: d.dataSourceId,
    title: d.title,
    source_url: d.sourceUrl,
    raw_content: d.rawContent,
    content_hash: d.contentHash,
    mime_type: d.mimeType,
    metadata: d.metadata,
  }));

  const { error } = await supabase.from('source_documents').insert(rows);
  if (error) throw new Error(`Failed to store source documents: ${error.message}`);
}

/**
 * Store layer candidates in Supabase.
 */
export async function storeLayerCandidates(
  supabase: SupabaseClient,
  candidates: LayerCandidate[],
): Promise<void> {
  if (candidates.length === 0) return;

  const rows = candidates.map(c => ({
    id: c.id,
    project_id: c.projectId,
    source_document_id: c.sourceDocumentId,
    layer: c.layer,
    content: c.content,
    confidence: c.confidence,
    rationale: c.rationale,
    extraction_method: c.extractionMethod,
    provenance: c.provenance,
    span_start: c.provenance.span?.startChar ?? null,
    span_end: c.provenance.span?.endChar ?? null,
    status: 'active',
  }));

  const { error } = await supabase.from('layer_candidates').insert(rows);
  if (error) throw new Error(`Failed to store layer candidates: ${error.message}`);
}

/**
 * Store a compiled bundle in Supabase.
 * Also updates the project's readiness score and creates a snapshot.
 */
export async function storeCompiledBundle(
  supabase: SupabaseClient,
  projectId: string,
  bundle: CompiledInstructionBundle,
  resolvedLayers: ResolvedLayer[],
  action: 'scan' | 'optimize' = 'scan',
): Promise<void> {
  // Store the bundle
  const { error: bundleError } = await supabase.from('compiled_bundles').insert({
    project_id: projectId,
    system_prompt: bundle.systemPrompt,
    hash: bundle.hash,
    sections: bundle.sections,
    provenance: bundle.provenance,
    conflicts: bundle.conflicts,
    gaps: bundle.gaps,
    metadata: bundle.metadata,
  });
  if (bundleError) throw new Error(`Failed to store compiled bundle: ${bundleError.message}`);

  // Compute readiness score from resolved layers
  const weights: Record<string, number> = {
    identity: 3, constraints: 3,
    context: 2, skills: 2, goals: 2, style: 2, policies: 2,
    examples: 1, tools: 1, evals: 1, prompts: 1, memory: 1,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  const layerScores: Record<string, number> = {};

  for (const rl of resolvedLayers) {
    const weight = weights[rl.layer] ?? 1;
    weightedSum += rl.qualityScore * weight;
    totalWeight += weight;
    layerScores[rl.layer] = rl.qualityScore;
  }

  const readinessScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const grade = readinessScore >= 90 ? 'A'
    : readinessScore >= 80 ? 'B'
    : readinessScore >= 70 ? 'C'
    : readinessScore >= 60 ? 'D'
    : 'F';

  // Update project score
  await supabase.from('projects')
    .update({ readiness_score: readinessScore, grade })
    .eq('id', projectId);

  // Create snapshot
  const populatedLayers = resolvedLayers.filter(rl => rl.candidates.length > 0);
  const notes = `Pipeline: ${populatedLayers.length} layers populated, ${bundle.gaps.length} gaps, ${bundle.conflicts.length} conflicts`;

  await supabase.from('snapshots').insert({
    project_id: projectId,
    readiness_score: readinessScore,
    grade,
    layer_scores: layerScores,
    action,
    notes,
  });
}

/**
 * Also write to project_files for backward compatibility.
 * This mirrors the old connector behavior so existing UI components
 * that read from project_files continue to work during migration.
 */
export async function backfillProjectFiles(
  supabase: SupabaseClient,
  projectId: string,
  docs: SourceDocument[],
  candidates: LayerCandidate[],
): Promise<void> {
  // Build a lookup of best candidate per source document
  const candidatesByDoc = new Map<string, LayerCandidate>();
  for (const c of candidates) {
    const existing = candidatesByDoc.get(c.sourceDocumentId);
    if (!existing || c.confidence > existing.confidence) {
      candidatesByDoc.set(c.sourceDocumentId, c);
    }
  }

  const rows = docs.map(doc => {
    const bestCandidate = candidatesByDoc.get(doc.id);
    return {
      project_id: projectId,
      file_name: doc.title,
      relative_path: doc.sourceUrl ?? doc.title,
      source_type: doc.metadata.provider,
      inferred_kind: bestCandidate?.layer ?? null,
      inferred_confidence: bestCandidate?.confidence ?? 0,
      content_length: doc.rawContent.length,
      content: doc.rawContent,
    };
  });

  await supabase.from('project_files').insert(rows);
}

/**
 * Get the latest compiled bundle for a project.
 */
export async function getLatestBundle(
  supabase: SupabaseClient,
  projectId: string,
): Promise<CompiledInstructionBundle | null> {
  const { data } = await supabase
    .from('compiled_bundles')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!data) return null;

  return {
    systemPrompt: data.system_prompt,
    hash: data.hash,
    sections: data.sections,
    provenance: data.provenance,
    conflicts: data.conflicts,
    gaps: data.gaps,
    metadata: data.metadata,
  };
}

/**
 * Log transformation decisions to the audit table.
 * Every auto-decision the pipeline makes is recorded so it can be
 * inspected and explained to the user later.
 */
export async function logTransformations(
  supabase: SupabaseClient,
  projectId: string,
  transformations: TransformationLog,
): Promise<void> {
  const rows: {
    project_id: string;
    decision_type: string;
    actor: string;
    target_ids: string[];
    chosen_option: string | null;
    rationale: string;
    context: object;
  }[] = [];

  // Log dedup merges
  for (const merge of transformations.mergedCandidates) {
    rows.push({
      project_id: projectId,
      decision_type: 'auto-dedup',
      actor: 'system',
      target_ids: [merge.keptId, merge.droppedId],
      chosen_option: merge.keptId,
      rationale: merge.reason,
      context: { layer: merge.layer },
    });
  }

  // Log auto conflict resolutions
  for (const resolution of transformations.autoResolutions) {
    rows.push({
      project_id: projectId,
      decision_type: 'auto-conflict-resolution',
      actor: 'system',
      target_ids: [resolution.winnerId, resolution.loserId],
      chosen_option: resolution.winnerId,
      rationale: resolution.resolvedBy,
      context: { layer: resolution.layer },
    });
  }

  // Log confidence filters
  for (const filter of transformations.filteredByConfidence) {
    rows.push({
      project_id: projectId,
      decision_type: 'confidence-filter',
      actor: 'system',
      target_ids: [filter.id],
      chosen_option: null,
      rationale: `Confidence ${Math.round(filter.confidence * 100)}% below threshold ${Math.round(filter.threshold * 100)}%`,
      context: { layer: filter.layer, confidence: filter.confidence, threshold: filter.threshold },
    });
  }

  if (rows.length > 0) {
    await supabase.from('decision_audit').insert(rows);
  }
}
