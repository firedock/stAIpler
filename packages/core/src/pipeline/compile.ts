/**
 * Stage 4: Compilation
 *
 * Produces a CompiledInstructionBundle from ResolvedLayer[].
 * Mirrors the core compiler's output format but works with the
 * evidence pipeline's resolved layers instead of filesystem assets.
 */

import { createHash } from 'crypto';
import { CANONICAL_SECTION_ORDER } from '../schema.js';
import type { LayerType } from '../types.js';
import type {
  ResolvedLayer,
  CompiledInstructionBundle,
  BundleSection,
  SectionProvenance,
  ConflictRecord,
  BundleMetadata,
} from './types.js';

/** Title case a layer type for section headers */
function sectionTitle(layer: LayerType): string {
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}

/**
 * Compile resolved layers into a final instruction bundle.
 *
 * Follows the same canonical section order as the core compiler.
 * Sections with no content are omitted from the system prompt
 * but tracked in the gaps list.
 */
export function compileBundle(
  resolvedLayers: ResolvedLayer[],
  sourceDocumentCount: number,
  totalCandidateCount: number,
): CompiledInstructionBundle {
  const now = new Date().toISOString();

  // Index resolved layers by type for ordered access
  const layerMap = new Map<LayerType, ResolvedLayer>();
  for (const rl of resolvedLayers) {
    layerMap.set(rl.layer, rl);
  }

  const sections: BundleSection[] = [];
  const provenance: SectionProvenance[] = [];
  const allConflicts: ConflictRecord[] = [];
  const gaps: LayerType[] = [];

  // Walk canonical order, building sections for layers that have content
  for (const layer of CANONICAL_SECTION_ORDER) {
    const resolved = layerMap.get(layer);

    if (!resolved || resolved.candidates.length === 0) {
      gaps.push(layer);
      continue;
    }

    sections.push({
      layer,
      content: resolved.primaryContent,
      status: resolved.status,
    });

    provenance.push({
      layer,
      sources: resolved.provenance,
    });

    allConflicts.push(...resolved.conflicts);
  }

  // Assemble full system prompt text — same format as core compiler
  const systemPrompt = sections
    .map(s => `## ${sectionTitle(s.layer)}\n\n${s.content}`)
    .join('\n\n');

  const hash = createHash('sha256').update(systemPrompt).digest('hex');

  const metadata: BundleMetadata = {
    tokenEstimate: Math.ceil(systemPrompt.length / 4),
    sourceDocumentCount,
    layerCandidateCount: totalCandidateCount,
    compiledAt: now,
  };

  return {
    systemPrompt,
    hash,
    sections,
    provenance,
    conflicts: allConflicts,
    gaps,
    metadata,
  };
}
