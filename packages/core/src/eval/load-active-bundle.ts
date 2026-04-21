import { readFileSync, statSync } from 'fs';
import { resolve, relative } from 'path';
import { createHash } from 'crypto';
import { scan } from '../optimizer/scanner.js';
import { analyze } from '../optimizer/analyzer.js';
import type { AnalysisResult } from '../optimizer/analyzer.js';
import { CANONICAL_SECTION_ORDER } from '../schema.js';
import type { LayerType } from '../types.js';
import type {
  BundleSection,
  CandidateProvenance,
  CompiledInstructionBundle,
  SectionProvenance,
} from '../pipeline/types.js';
import { toBenchmarkReadyBundle } from './benchmark-ready-bundle.js';
import type { BenchmarkReadyBundle } from './benchmark-ready-bundle.js';
import type { EventBus } from '../events/bus.js';

export interface ActiveBundle {
  bundle: CompiledInstructionBundle;
  analysis: AnalysisResult;
  ready: BenchmarkReadyBundle;
}

function titleCase(layer: LayerType): string {
  return layer.charAt(0).toUpperCase() + layer.slice(1);
}

function ingestedAtFor(path: string): string {
  try {
    return new Date(statSync(path).mtimeMs).toISOString();
  } catch {
    return new Date().toISOString();
  }
}

/**
 * Minimal "active bundle" resolver.
 *
 * Scans the project for instruction files, groups them by layer, populates
 * per-section provenance from the actual scanned file paths, and compiles
 * a deterministic CompiledInstructionBundle. Every stage is visible on the
 * provided EventBus so real-time consumers can see scan → analyze → bundle
 * happen.
 */
export function loadActiveBundle(repoRoot: string, bus?: EventBus): ActiveBundle {
  const root = resolve(repoRoot);
  bus?.emit({ stage: 'scan', kind: 'start' });
  const scanResult = scan(root);
  for (const file of scanResult.files) {
    bus?.emit({
      stage: 'scan',
      kind: 'file',
      path: relative(root, file.path) || file.path,
      layer: file.inferredKind ?? undefined,
    });
  }
  bus?.emit({ stage: 'scan', kind: 'done', file_count: scanResult.files.length });

  bus?.emit({ stage: 'analyze', kind: 'start' });
  const analysis = analyze(scanResult);
  for (const layer of analysis.layers) {
    bus?.emit({
      stage: 'analyze',
      kind: 'layer',
      layer: layer.kind,
      status: layer.status,
      quality_score: layer.qualityScore,
    });
  }
  bus?.emit({
    stage: 'analyze',
    kind: 'done',
    readiness_score: analysis.readinessScore,
    grade: analysis.grade,
  });

  bus?.emit({ stage: 'bundle', kind: 'start' });
  const byLayer = new Map<LayerType, Array<{ content: string; provenance: CandidateProvenance }>>();
  for (const layer of analysis.layers) {
    const parts: Array<{ content: string; provenance: CandidateProvenance }> = [];
    for (const file of layer.files) {
      try {
        const content = readFileSync(file.path, 'utf-8');
        const relPath = relative(root, file.path) || file.path;
        parts.push({
          content,
          provenance: {
            sourceTitle: relPath,
            sourceUrl: null,
            provider: 'filesystem',
            span: null,
            importedAt: ingestedAtFor(file.path),
            extractedAt: new Date().toISOString(),
          },
        });
      } catch {}
    }
    if (parts.length > 0) byLayer.set(layer.kind, parts);
  }

  const sections: BundleSection[] = [];
  const provenance: SectionProvenance[] = [];
  for (const layer of CANONICAL_SECTION_ORDER) {
    const parts = byLayer.get(layer);
    if (!parts || parts.length === 0) continue;
    sections.push({
      layer,
      content: parts.map(p => p.content).join('\n\n').trim(),
      status: 'source-grounded',
    });
    provenance.push({
      layer,
      sources: parts.map(p => p.provenance),
    });
    bus?.emit({ stage: 'bundle', kind: 'section', layer });
  }

  const gaps = analysis.layers.filter(l => l.status === 'missing').map(l => l.kind);
  for (const g of gaps) bus?.emit({ stage: 'bundle', kind: 'gap', layer: g });

  const systemPrompt = sections
    .map(s => `## ${titleCase(s.layer)}\n\n${s.content}`)
    .join('\n\n');
  const hash = createHash('sha256').update(systemPrompt).digest('hex');

  const bundle: CompiledInstructionBundle = {
    systemPrompt,
    hash,
    sections,
    provenance,
    conflicts: [],
    gaps,
    metadata: {
      tokenEstimate: Math.ceil(systemPrompt.length / 4),
      sourceDocumentCount: scanResult.files.length,
      layerCandidateCount: sections.length,
      compiledAt: new Date().toISOString(),
    },
  };

  bus?.emit({
    stage: 'bundle',
    kind: 'done',
    bundle_hash: hash,
    section_count: sections.length,
    conflict_count: 0,
    gap_count: gaps.length,
    token_estimate: bundle.metadata.tokenEstimate,
  });

  const ready = toBenchmarkReadyBundle(bundle, analysis);
  return { bundle, analysis, ready };
}
