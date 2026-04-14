/**
 * Heuristic Handoff System
 *
 * Agent session-to-session learning via compact handoff packets.
 * Each handoff declares its epistemic type, confidence, provenance, and decays
 * over time unless reinforced by later sessions.
 *
 * Trust hierarchy (highest to lowest):
 * 1. Source knowledge — ground truth from connectors
 * 2. Session handoffs — operational wisdom, decaying
 * 3. AI-generated fills — optimizer gap-filling, provisional
 *
 * Handoffs never outrank source evidence.
 */

import { randomUUID } from 'crypto';

// ---- Types ----

/**
 * Epistemic classification — every handoff must declare what kind of knowledge it is.
 * This determines decay rate and how much weight it carries.
 */
export type HandoffClassification = 'fact' | 'inference' | 'heuristic' | 'unresolved-question';

/**
 * A single handoff packet emitted by an agent at session end.
 */
export interface HandoffPacket {
  /** Unique identifier */
  id: string;
  /** Project this handoff belongs to */
  projectId: string;
  /** What kind of knowledge this is */
  classification: HandoffClassification;
  /** The lesson itself — plain English */
  content: string;
  /** Initial confidence when emitted (0-1) */
  initialConfidence: number;
  /** Current effective confidence after decay (0-1) */
  effectiveConfidence: number;
  /** What evidence or files led to this conclusion */
  provenance: HandoffProvenance;
  /** How many times this handoff has been reinforced by later sessions */
  reinforcementCount: number;
  /** When this handoff was first emitted */
  createdAt: string;
  /** When this handoff was last reinforced or updated */
  lastReinforcedAt: string;
  /** Whether this handoff is still active */
  status: 'active' | 'decayed' | 'superseded' | 'resolved';
}

export interface HandoffProvenance {
  /** What agent/session produced this handoff */
  sessionId: string;
  /** Files or resources that were examined */
  evidencePaths: string[];
  /** Brief explanation of how the conclusion was reached */
  reasoning: string;
}

// ---- Decay mechanics ----

/**
 * Half-life in days for each classification type.
 * After one half-life, confidence drops to 50% of its current value.
 *
 * Facts decay very slowly (verified knowledge).
 * Inferences decay moderately (derived, could be wrong).
 * Heuristics decay fast (practical shortcuts that go stale).
 * Unresolved questions don't decay — they persist until addressed.
 */
const DECAY_HALF_LIFE_DAYS: Record<HandoffClassification, number> = {
  'fact': 90,
  'inference': 30,
  'heuristic': 14,
  'unresolved-question': Infinity, // never decays, persists until resolved
};

/**
 * Minimum confidence before a handoff is considered decayed.
 * Below this threshold, the handoff is no longer included in compilation.
 */
const DECAY_THRESHOLD = 0.15;

/**
 * Each reinforcement multiplies confidence by this factor (up to initial).
 */
const REINFORCEMENT_BOOST = 1.5;

/**
 * Calculate the effective confidence of a handoff after time-based decay.
 *
 * Uses exponential decay: confidence = initial * (0.5 ^ (days / halfLife))
 * Reinforcements partially reset the decay clock by boosting confidence.
 */
export function calculateDecay(handoff: HandoffPacket, now: Date = new Date()): number {
  if (handoff.classification === 'unresolved-question') {
    return handoff.initialConfidence; // never decays
  }

  const halfLife = DECAY_HALF_LIFE_DAYS[handoff.classification];
  const anchorDate = new Date(handoff.lastReinforcedAt);
  const daysSinceAnchor = (now.getTime() - anchorDate.getTime()) / (1000 * 60 * 60 * 24);

  if (daysSinceAnchor <= 0) return handoff.initialConfidence;

  const decayFactor = Math.pow(0.5, daysSinceAnchor / halfLife);
  return handoff.initialConfidence * decayFactor;
}

/**
 * Apply decay to a handoff and determine if it's still active.
 */
export function applyDecay(handoff: HandoffPacket, now: Date = new Date()): HandoffPacket {
  const effectiveConfidence = calculateDecay(handoff, now);
  const status = effectiveConfidence < DECAY_THRESHOLD ? 'decayed' : handoff.status;

  return {
    ...handoff,
    effectiveConfidence,
    status: handoff.status === 'superseded' || handoff.status === 'resolved'
      ? handoff.status // don't change terminal states
      : status,
  };
}

/**
 * Apply decay to all handoffs and filter out decayed ones.
 */
export function getActiveHandoffs(handoffs: HandoffPacket[], now: Date = new Date()): HandoffPacket[] {
  return handoffs
    .map(h => applyDecay(h, now))
    .filter(h => h.status === 'active');
}

// ---- Creation ----

export interface EmitHandoffInput {
  projectId: string;
  classification: HandoffClassification;
  content: string;
  confidence: number;
  sessionId: string;
  evidencePaths: string[];
  reasoning: string;
}

/**
 * Create a new handoff packet from agent input.
 */
export function createHandoffPacket(input: EmitHandoffInput): HandoffPacket {
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    projectId: input.projectId,
    classification: input.classification,
    content: input.content,
    initialConfidence: Math.max(0, Math.min(1, input.confidence)),
    effectiveConfidence: Math.max(0, Math.min(1, input.confidence)),
    provenance: {
      sessionId: input.sessionId,
      evidencePaths: input.evidencePaths,
      reasoning: input.reasoning,
    },
    reinforcementCount: 0,
    createdAt: now,
    lastReinforcedAt: now,
    status: 'active',
  };
}

// ---- Reinforcement ----

/**
 * Reinforce an existing handoff — another session independently
 * validated or re-derived the same insight.
 *
 * Boosts confidence (up to initial) and resets the decay clock.
 */
export function reinforceHandoff(
  handoff: HandoffPacket,
  newSessionId: string,
): HandoffPacket {
  const now = new Date().toISOString();
  const boostedConfidence = Math.min(
    handoff.initialConfidence,
    handoff.effectiveConfidence * REINFORCEMENT_BOOST,
  );

  return {
    ...handoff,
    effectiveConfidence: boostedConfidence,
    reinforcementCount: handoff.reinforcementCount + 1,
    lastReinforcedAt: now,
    status: 'active',
    provenance: {
      ...handoff.provenance,
      sessionId: newSessionId, // update to most recent reinforcing session
    },
  };
}

// ---- Compilation integration ----

/**
 * Format active handoffs for inclusion in the system prompt.
 * Handoffs are injected below source knowledge but above AI-generated fills.
 *
 * Groups by classification for readability.
 */
export function formatHandoffsForPrompt(handoffs: HandoffPacket[]): string {
  const active = handoffs.filter(h => h.status === 'active' && h.effectiveConfidence >= DECAY_THRESHOLD);

  if (active.length === 0) return '';

  const groups: Record<string, HandoffPacket[]> = {
    'fact': [],
    'inference': [],
    'heuristic': [],
    'unresolved-question': [],
  };

  for (const h of active) {
    groups[h.classification].push(h);
  }

  const sections: string[] = [];

  // Sort by effective confidence within each group
  for (const [classification, packets] of Object.entries(groups)) {
    if (packets.length === 0) continue;
    const sorted = packets.sort((a, b) => b.effectiveConfidence - a.effectiveConfidence);

    const label = classification === 'unresolved-question'
      ? 'Open Questions'
      : classification.charAt(0).toUpperCase() + classification.slice(1) + 's';

    const lines = sorted.map(h => {
      const conf = Math.round(h.effectiveConfidence * 100);
      const reinforced = h.reinforcementCount > 0 ? ` (reinforced ${h.reinforcementCount}x)` : '';
      return `- [${conf}%${reinforced}] ${h.content}`;
    });

    sections.push(`### ${label}\n${lines.join('\n')}`);
  }

  return `## Operational Wisdom\n\nThe following insights were learned from previous sessions working on this project. They are supplementary to the source-grounded instruction layers above — if they conflict with source knowledge, defer to the source.\n\n${sections.join('\n\n')}`;
}

// ---- Deduplication ----

/**
 * Check if a new handoff is substantially similar to an existing one.
 * If so, the existing one should be reinforced rather than creating a duplicate.
 *
 * Simple approach: check for significant word overlap.
 */
export function findSimilarHandoff(
  newContent: string,
  existingHandoffs: HandoffPacket[],
  threshold: number = 0.6,
): HandoffPacket | null {
  const newWords = new Set(newContent.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  if (newWords.size === 0) return null;

  let bestMatch: HandoffPacket | null = null;
  let bestScore = 0;

  for (const handoff of existingHandoffs) {
    if (handoff.status !== 'active') continue;
    const existingWords = new Set(handoff.content.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    if (existingWords.size === 0) continue;

    const intersection = new Set([...newWords].filter(w => existingWords.has(w)));
    const union = new Set([...newWords, ...existingWords]);
    const jaccard = intersection.size / union.size;

    if (jaccard > bestScore && jaccard >= threshold) {
      bestScore = jaccard;
      bestMatch = handoff;
    }
  }

  return bestMatch;
}
