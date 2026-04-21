import { createHash } from 'crypto';
import type { LayerType } from '../types.js';
import type { CompiledInstructionBundle } from '../pipeline/types.js';
import type { AnalysisResult } from '../optimizer/analyzer.js';

/**
 * Stable, versioned contract consumed by compiler-target adapters.
 * Adapters under `packages/adapters/*` must consume only this shape — never
 * `AnalysisResult`, `ResolvedLayer`, or other internals. Core owns the
 * normalization in `toBenchmarkReadyBundle` so bundle semantics can't drift
 * across adapters.
 *
 * Bump BENCHMARK_READY_BUNDLE_CONTRACT_VERSION when the shape changes in a
 * way that materially alters adapter output.
 */
export const BENCHMARK_READY_BUNDLE_CONTRACT_VERSION = 1;

export interface CoverageSummary {
  present: LayerType[];
  weak: LayerType[];
  missing: LayerType[];
  readinessScore: number;
  grade: string;
  qualityScores: Partial<Record<LayerType, number>>;
}

export interface BenchmarkReadyBundle {
  bundle: CompiledInstructionBundle;
  coverage: CoverageSummary;
  contract_version: number;
}

function sortLayers(layers: LayerType[]): LayerType[] {
  return [...layers].sort();
}

export function toBenchmarkReadyBundle(
  bundle: CompiledInstructionBundle,
  analysis: AnalysisResult,
): BenchmarkReadyBundle {
  const present: LayerType[] = [];
  const weak: LayerType[] = [];
  const missing: LayerType[] = [];
  const qualityScores: Partial<Record<LayerType, number>> = {};

  for (const layer of analysis.layers) {
    qualityScores[layer.kind] = layer.qualityScore;
    if (layer.status === 'present') present.push(layer.kind);
    else if (layer.status === 'weak') weak.push(layer.kind);
    else missing.push(layer.kind);
  }

  return {
    bundle,
    coverage: {
      present: sortLayers(present),
      weak: sortLayers(weak),
      missing: sortLayers(missing),
      readinessScore: analysis.readinessScore,
      grade: analysis.grade,
      qualityScores,
    },
    contract_version: BENCHMARK_READY_BUNDLE_CONTRACT_VERSION,
  };
}

/**
 * Stable hash over a bundle section's content. Used by adapter manifests to
 * record per-layer hashes without depending on the full bundle text.
 */
export function hashSectionContent(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}
