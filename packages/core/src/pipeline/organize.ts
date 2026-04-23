/**
 * Stage 3: Organization
 *
 * Given all LayerCandidate[] across all sources for a project,
 * deduplicates, detects conflicts, ranks, and produces ResolvedLayer[].
 *
 * This stage is cross-document — it operates on the full set of candidates
 * from every source, not per-document.
 */

import { createHash } from 'crypto';
import { LAYER_TYPES } from '../schema.js';
import type { LayerType, MergeStrategy } from '../types.js';
import { DEFAULT_MERGE_STRATEGIES } from '../schema.js';
import type { LayerCandidate, ResolvedLayer, ConflictRecord, TransformationLog } from './types.js';

// ---- Layer importance for scoring ----

const LAYER_IMPORTANCE: Record<LayerType, 'critical' | 'recommended' | 'optional'> = {
  identity: 'critical',
  constraints: 'critical',
  context: 'recommended',
  skills: 'recommended',
  goals: 'recommended',
  style: 'recommended',
  policies: 'recommended',
  examples: 'optional',
  tools: 'optional',
  evals: 'optional',
  prompts: 'optional',
  memory: 'optional',
  continuity: 'recommended',
};

// ---- Deduplication ----

function contentHash(text: string): string {
  return createHash('sha256').update(text.trim().toLowerCase()).digest('hex');
}

/**
 * Remove exact and near-duplicate candidates within a layer.
 * Keeps the candidate with higher confidence; on ties, keeps the more recent one.
 * Returns both the deduped candidates AND a log of what was merged.
 */
function deduplicateCandidates(candidates: LayerCandidate[]): {
  deduped: LayerCandidate[];
  merged: TransformationLog['mergedCandidates'];
} {
  const seen = new Map<string, LayerCandidate>();
  const merged: TransformationLog['mergedCandidates'] = [];

  for (const candidate of candidates) {
    const hash = contentHash(candidate.content);
    const existing = seen.get(hash);

    if (!existing) {
      seen.set(hash, candidate);
    } else if (
      candidate.confidence > existing.confidence ||
      (candidate.confidence === existing.confidence &&
        candidate.provenance.extractedAt > existing.provenance.extractedAt)
    ) {
      // New candidate wins — log the merge
      merged.push({
        layer: candidate.layer,
        keptId: candidate.id,
        droppedId: existing.id,
        reason: `Duplicate content (hash match). Kept "${candidate.provenance.sourceTitle}" (${Math.round(candidate.confidence * 100)}%) over "${existing.provenance.sourceTitle}" (${Math.round(existing.confidence * 100)}%)`,
      });
      seen.set(hash, candidate);
    } else {
      // Existing candidate wins — log the merge
      merged.push({
        layer: candidate.layer,
        keptId: existing.id,
        droppedId: candidate.id,
        reason: `Duplicate content (hash match). Kept "${existing.provenance.sourceTitle}" (${Math.round(existing.confidence * 100)}%) over "${candidate.provenance.sourceTitle}" (${Math.round(candidate.confidence * 100)}%)`,
      });
    }
  }

  return { deduped: Array.from(seen.values()), merged };
}

// ---- Conflict detection ----

/**
 * Detect potential conflicts between candidates for the same layer.
 *
 * Two candidates conflict when they appear to define the same aspect
 * of a layer differently. This is a lightweight heuristic check —
 * it flags candidates from different sources that both have high confidence,
 * which suggests they're both trying to be authoritative for the same layer.
 *
 * For a thin-but-real first version, conflicts are flagged but auto-resolved
 * by confidence then recency. Users can override later.
 */
function detectConflicts(candidates: LayerCandidate[]): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];

  if (candidates.length < 2) return conflicts;

  // Only flag conflicts between candidates from different sources
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i];
      const b = candidates[j];

      // Same source document — not a conflict, just redundancy (handled by dedup)
      if (a.sourceDocumentId === b.sourceDocumentId) continue;

      // Both high confidence — potential authority conflict
      if (a.confidence >= 0.7 && b.confidence >= 0.7) {
        const aWins = a.confidence > b.confidence ||
          (a.confidence === b.confidence &&
            a.provenance.extractedAt > b.provenance.extractedAt);

        // Show what actually conflicts — content snippets from both sides
        const aSnippet = a.content.slice(0, 120).replace(/\n/g, ' ').trim();
        const bSnippet = b.content.slice(0, 120).replace(/\n/g, ' ').trim();

        conflicts.push({
          candidateA: a.id,
          candidateB: b.id,
          description: `"${a.provenance.sourceTitle}" says: "${aSnippet}..." while "${b.provenance.sourceTitle}" says: "${bSnippet}..."`,
          resolution: aWins ? 'a-wins' : 'b-wins',
          resolvedBy: a.confidence !== b.confidence ? 'confidence' : 'recency',
        });
      }
    }
  }

  return conflicts;
}

// ---- Ranking ----

/**
 * Rank candidates by confidence (descending) then recency (descending).
 */
function rankCandidates(candidates: LayerCandidate[]): LayerCandidate[] {
  return [...candidates].sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.provenance.extractedAt.localeCompare(a.provenance.extractedAt);
  });
}

// ---- Quality scoring ----

/**
 * Score a layer's quality based on its candidates (0-100).
 * Mirrors the core analyzer's scoring logic but works with LayerCandidates
 * instead of ScannedFiles.
 */
function scoreLayer(candidates: LayerCandidate[]): number {
  if (candidates.length === 0) return 0;

  const best = candidates[0]; // already ranked by confidence
  const totalLength = candidates.reduce((sum, c) => sum + c.content.length, 0);

  let score = 30; // base: has content
  if (totalLength > 200) score += 15;
  if (totalLength > 500) score += 10;
  if (totalLength > 1000) score += 10;
  score += Math.round(best.confidence * 20);

  // Bonus for source-grounded content (not AI-generated)
  if (best.extractionMethod !== 'semantic' || best.confidence >= 0.7) {
    score += 15;
  }

  return Math.min(100, score);
}

// ---- Merge content ----

/**
 * Merge candidates into a single primary content string using the
 * configured merge strategy for this layer type.
 */
function mergeContent(candidates: LayerCandidate[], layer: LayerType): string {
  if (candidates.length === 0) return '';

  const strategy: MergeStrategy = DEFAULT_MERGE_STRATEGIES[layer];

  if (strategy === 'last-wins') {
    return candidates[0].content; // already sorted by confidence/recency
  }

  // concatenate — join all candidates with section separators
  return candidates.map(c => c.content).join('\n\n');
}

// ---- Main organizer ----

/**
 * Organize all layer candidates into resolved layers.
 *
 * Groups candidates by layer, deduplicates, detects conflicts,
 * ranks, scores, and merges into the final resolved state.
 *
 * Returns both the resolved layers AND a transformation log so
 * every silent transformation is visible to the user.
 */
export function organizeCandidates(candidates: LayerCandidate[]): {
  resolvedLayers: ResolvedLayer[];
  transformations: TransformationLog;
} {
  const resolvedLayers: ResolvedLayer[] = [];
  const transformations: TransformationLog = {
    deduplicatedDocuments: [],
    mergedCandidates: [],
    filteredByConfidence: [],
    autoResolutions: [],
    gapReasons: [],
  };

  for (const layer of LAYER_TYPES) {
    const layerCandidates = candidates.filter(c => c.layer === layer);

    // Deduplicate — now reports what was merged
    const { deduped, merged } = deduplicateCandidates(layerCandidates);
    transformations.mergedCandidates.push(...merged);

    // Rank by confidence then recency
    const ranked = rankCandidates(deduped);

    // Detect conflicts — log auto-resolutions
    const conflicts = detectConflicts(ranked);
    for (const conflict of conflicts) {
      if (conflict.resolution !== 'unresolved') {
        transformations.autoResolutions.push({
          layer,
          winnerId: conflict.resolution === 'a-wins' ? conflict.candidateA : conflict.candidateB,
          loserId: conflict.resolution === 'a-wins' ? conflict.candidateB : conflict.candidateA,
          resolvedBy: `Auto-resolved by ${conflict.resolvedBy}`,
        });
      }
    }

    // Determine grounding status
    const hasSourceGrounded = ranked.some(c => c.extractionMethod !== 'semantic' || c.confidence >= 0.7);
    const hasAiGenerated = ranked.some(c => c.extractionMethod === 'semantic' && c.confidence < 0.7);
    const status = ranked.length === 0
      ? 'source-grounded' as const
      : hasSourceGrounded && hasAiGenerated
        ? 'mixed' as const
        : hasSourceGrounded
          ? 'source-grounded' as const
          : 'ai-generated' as const;

    // Merge and score
    const primaryContent = mergeContent(ranked, layer);
    const qualityScore = scoreLayer(ranked);

    // Log gap reasons
    if (ranked.length === 0) {
      const importance = LAYER_IMPORTANCE[layer];
      transformations.gapReasons.push({
        layer,
        reason: layerCandidates.length === 0
          ? `No content found for ${layer} in any source document`
          : `${layerCandidates.length} candidate(s) found but all removed during deduplication`,
      });
    }

    resolvedLayers.push({
      layer,
      status,
      candidates: ranked,
      conflicts,
      primaryContent,
      provenance: ranked.map(c => c.provenance),
      qualityScore,
    });
  }

  return { resolvedLayers, transformations };
}

/**
 * Compute the overall readiness score from resolved layers.
 * Uses the same weighting system as the existing analyzer.
 */
export function computeReadinessScore(resolvedLayers: ResolvedLayer[]): {
  readinessScore: number;
  grade: string;
  layerScores: Record<string, number>;
} {
  const weights: Record<LayerType, number> = {
    identity: 3, constraints: 3,
    context: 2, skills: 2, goals: 2, style: 2, policies: 2, continuity: 2,
    examples: 1, tools: 1, evals: 1, prompts: 1, memory: 1,
  };

  let weightedSum = 0;
  let totalWeight = 0;
  const layerScores: Record<string, number> = {};

  for (const resolved of resolvedLayers) {
    const weight = weights[resolved.layer];
    weightedSum += resolved.qualityScore * weight;
    totalWeight += weight;
    layerScores[resolved.layer] = resolved.qualityScore;
  }

  const readinessScore = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
  const grade = readinessScore >= 90 ? 'A'
    : readinessScore >= 80 ? 'B'
    : readinessScore >= 70 ? 'C'
    : readinessScore >= 60 ? 'D'
    : 'F';

  return { readinessScore, grade, layerScores };
}
