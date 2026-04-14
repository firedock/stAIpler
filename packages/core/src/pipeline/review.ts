/**
 * Pipeline Review
 *
 * Surfaces items that need human judgment before compilation is finalized.
 * Three types:
 * 1. Conflicts — two sources disagree on the same layer
 * 2. Uncertain extractions — low confidence, may be misclassified
 * 3. Clarifications — ambiguous content that could map to multiple layers
 */

import type { LayerCandidate, ConflictRecord, ResolvedLayer } from './types.js';

/** A single item requiring user review */
export interface ReviewItem {
  /** Unique identifier */
  id: string;
  /** What kind of review is needed */
  type: 'conflict' | 'uncertain' | 'clarification';
  /** Plain English summary (for the UI heading) */
  title: string;
  /** What needs deciding */
  description: string;
  /** The extracted content in question */
  context: string;
  /** Where it came from */
  sourceTitle: string;
  /** Choices for the user */
  options: ReviewOption[];
  /** Pipeline's best guess (option ID) */
  defaultOption: string;
  /** IDs of the candidates involved */
  candidateIds: string[];
}

export interface ReviewOption {
  id: string;
  label: string;
  description?: string;
}

/** User's decision on a review item */
export interface ReviewDecision {
  itemId: string;
  selectedOptionId: string;
}

/** Confidence threshold below which extractions are flagged for review */
const UNCERTAIN_THRESHOLD = 0.5;

/**
 * Build review items from pipeline results.
 * Returns items that need human judgment; empty array means auto-finalize.
 */
export function buildReviewItems(
  resolvedLayers: ResolvedLayer[],
  candidates: LayerCandidate[],
): ReviewItem[] {
  const items: ReviewItem[] = [];

  // 1. Surface conflicts
  for (const layer of resolvedLayers) {
    for (const conflict of layer.conflicts) {
      const candidateA = candidates.find(c => c.id === conflict.candidateA);
      const candidateB = candidates.find(c => c.id === conflict.candidateB);
      if (!candidateA || !candidateB) continue;

      items.push({
        id: `conflict-${conflict.candidateA}-${conflict.candidateB}`,
        type: 'conflict',
        title: `Conflict: ${layer.layer.charAt(0).toUpperCase() + layer.layer.slice(1)}`,
        description: `"${candidateA.provenance.sourceTitle}" and "${candidateB.provenance.sourceTitle}" provide different content for this layer. Which should your agent use?`,
        context: `From "${candidateA.provenance.sourceTitle}":\n${candidateA.content.slice(0, 200)}...\n\nFrom "${candidateB.provenance.sourceTitle}":\n${candidateB.content.slice(0, 200)}...`,
        sourceTitle: candidateA.provenance.sourceTitle,
        options: [
          {
            id: 'a-wins',
            label: candidateA.provenance.sourceTitle,
            description: `Use content from ${candidateA.provenance.sourceTitle}`,
          },
          {
            id: 'b-wins',
            label: candidateB.provenance.sourceTitle,
            description: `Use content from ${candidateB.provenance.sourceTitle}`,
          },
          {
            id: 'merged',
            label: 'Use both',
            description: 'Combine content from both sources',
          },
        ],
        defaultOption: conflict.resolution === 'a-wins' ? 'a-wins' : 'b-wins',
        candidateIds: [conflict.candidateA, conflict.candidateB],
      });
    }
  }

  // 2. Surface uncertain extractions
  const uncertainCandidates = candidates.filter(
    c => c.confidence < UNCERTAIN_THRESHOLD && c.confidence > 0
  );

  for (const candidate of uncertainCandidates) {
    items.push({
      id: `uncertain-${candidate.id}`,
      type: 'uncertain',
      title: `Uncertain: Is this ${candidate.layer}?`,
      description: `We found content that might belong in your agent's ${candidate.layer} layer, but we're not confident. Should we include it?`,
      context: candidate.content.slice(0, 300),
      sourceTitle: candidate.provenance.sourceTitle,
      options: [
        {
          id: 'accept',
          label: `Yes, use as ${candidate.layer}`,
          description: `Include this in the ${candidate.layer} layer`,
        },
        {
          id: 'skip',
          label: 'No, skip this',
          description: 'Don\'t include this content',
        },
        {
          id: 'reassign',
          label: 'It\'s something else',
          description: 'This content belongs in a different layer',
        },
      ],
      defaultOption: 'accept',
      candidateIds: [candidate.id],
    });
  }

  // 3. Surface candidates where heuristic extraction assigned a layer
  //    but the content pattern strongly signals a different one
  const heuristicCandidates = candidates.filter(
    c => c.extractionMethod === 'heuristic' && c.confidence < 0.6
  );

  for (const candidate of heuristicCandidates) {
    // Don't duplicate items already flagged as uncertain
    if (items.some(item => item.candidateIds.includes(candidate.id))) continue;

    // Check if this might be a constraint vs policy ambiguity
    const isConstraintPolicyAmbiguous =
      (candidate.layer === 'constraints' || candidate.layer === 'policies') &&
      candidate.confidence < 0.55;

    if (isConstraintPolicyAmbiguous) {
      items.push({
        id: `clarify-${candidate.id}`,
        type: 'clarification',
        title: 'Is this a hard rule or a guideline?',
        description: `This content could be a hard constraint (the agent must never do this) or a policy (the agent should generally follow this). Which fits better?`,
        context: candidate.content.slice(0, 300),
        sourceTitle: candidate.provenance.sourceTitle,
        options: [
          {
            id: 'constraints',
            label: 'Hard rule (constraint)',
            description: 'The agent must never violate this',
          },
          {
            id: 'policies',
            label: 'Guideline (policy)',
            description: 'The agent should follow this but can use judgment',
          },
          {
            id: 'skip',
            label: 'Skip — not relevant',
          },
        ],
        defaultOption: candidate.layer,
        candidateIds: [candidate.id],
      });
    }
  }

  return items;
}

/**
 * Apply user review decisions to candidates.
 * Returns updated candidates with decisions applied.
 */
export function applyReviewDecisions(
  candidates: LayerCandidate[],
  items: ReviewItem[],
  decisions: ReviewDecision[],
): LayerCandidate[] {
  const decisionMap = new Map(decisions.map(d => [d.itemId, d.selectedOptionId]));
  const skipIds = new Set<string>();
  const reassignments = new Map<string, string>(); // candidateId → new layer

  for (const item of items) {
    const decision = decisionMap.get(item.id);
    if (!decision) continue;

    if (item.type === 'conflict') {
      // For conflicts, skip the losing candidate
      if (decision === 'a-wins' && item.candidateIds.length >= 2) {
        skipIds.add(item.candidateIds[1]);
      } else if (decision === 'b-wins' && item.candidateIds.length >= 2) {
        skipIds.add(item.candidateIds[0]);
      }
      // 'merged' keeps both
    }

    if (item.type === 'uncertain') {
      if (decision === 'skip') {
        for (const id of item.candidateIds) skipIds.add(id);
      }
      // 'accept' keeps as-is, 'reassign' would need a follow-up (future)
    }

    if (item.type === 'clarification') {
      if (decision === 'skip') {
        for (const id of item.candidateIds) skipIds.add(id);
      } else if (decision === 'constraints' || decision === 'policies') {
        for (const id of item.candidateIds) {
          reassignments.set(id, decision);
        }
      }
    }
  }

  return candidates
    .filter(c => !skipIds.has(c.id))
    .map(c => {
      const newLayer = reassignments.get(c.id);
      if (newLayer) {
        return { ...c, layer: newLayer as LayerCandidate['layer'], confidence: 0.9 };
      }
      return c;
    });
}
