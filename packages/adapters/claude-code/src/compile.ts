import { BENCHMARK_READY_BUNDLE_CONTRACT_VERSION, hashSectionContent } from '@staipler/core';
import type { BenchmarkReadyBundle, EventBus, LayerType } from '@staipler/core';
import { renderClaudeMd } from './render-claude-md.js';
import { renderSkills } from './render-skills.js';
import type { RenderedSkill } from './render-skills.js';
import {
  ADAPTER_VERSION,
  ClaudeCodeManifestSchema,
  computeDeterminismHash,
  computeReleaseId,
  sha256Hex,
} from './manifest.js';
import type { ClaudeCodeManifest, ConflictRef, LayerProvenance, SkillSource, SourceRef } from './manifest.js';

export interface CompileOptions {
  gitCommit: string;
  /**
   * Fixed ISO timestamp for `built_at`. Tests pass this to keep the
   * human-readable field stable; production callers can omit it and accept
   * a wall-clock timestamp. `built_at` is deliberately excluded from the
   * determinism hash.
   */
  builtAt?: string;
  /** Optional event bus for real-time visibility of render stages. */
  bus?: EventBus;
}

export interface ClaudeCodeArtifacts {
  claudeMd: string;
  skills: RenderedSkill[];
  manifest: ClaudeCodeManifest;
}

const CLAUDE_MD_PATH = 'CLAUDE.md';

function toSourceRef(s: { sourceTitle: string; sourceUrl: string | null; provider: string }): SourceRef {
  return { sourceTitle: s.sourceTitle, sourceUrl: s.sourceUrl, provider: s.provider };
}

export function compileClaudeCode(
  input: BenchmarkReadyBundle,
  opts: CompileOptions,
): ClaudeCodeArtifacts {
  if (input.contract_version !== BENCHMARK_READY_BUNDLE_CONTRACT_VERSION) {
    throw new Error(
      `BenchmarkReadyBundle contract_version mismatch: adapter expects ${BENCHMARK_READY_BUNDLE_CONTRACT_VERSION}, got ${input.contract_version}`,
    );
  }
  const bus = opts.bus;

  const bundleHash = input.bundle.hash;
  const releaseId = computeReleaseId(bundleHash, opts.gitCommit, ADAPTER_VERSION);

  const claudeMd = renderClaudeMd(input, {
    releaseId,
    bundleHash,
    adapterVersion: ADAPTER_VERSION,
    coreContractVersion: input.contract_version,
  });
  bus?.emit({
    stage: 'render',
    kind: 'claude-md',
    path: CLAUDE_MD_PATH,
    byte_count: Buffer.byteLength(claudeMd.body),
  });

  const skills = renderSkills(input);
  for (const s of skills) {
    bus?.emit({
      stage: 'render',
      kind: 'skill',
      skill_slug: s.slug,
      path: s.path,
      byte_count: Buffer.byteLength(s.body),
    });
  }

  const sourceLayerHashes: Record<string, string> = {};
  for (const section of input.bundle.sections) {
    sourceLayerHashes[section.layer as LayerType] = hashSectionContent(section.content);
  }
  const sortedSourceLayerHashes: Record<string, string> = {};
  for (const k of Object.keys(sourceLayerHashes).sort()) {
    sortedSourceLayerHashes[k] = sourceLayerHashes[k];
  }

  const artifacts = {
    claudeMd: { path: CLAUDE_MD_PATH, sha256: sha256Hex(claudeMd.body) },
    skills: skills
      .map(s => ({ path: s.path, sha256: sha256Hex(s.body) }))
      .sort((a, b) => a.path.localeCompare(b.path)),
  };

  const coverage = {
    present: [...input.coverage.present].sort(),
    weak: [...input.coverage.weak].sort(),
    missing: [...input.coverage.missing].sort(),
    readinessScore: input.coverage.readinessScore,
    grade: input.coverage.grade,
  };

  const statusByLayer = new Map<string, 'source-grounded' | 'ai-generated' | 'mixed'>();
  for (const s of input.bundle.sections) statusByLayer.set(s.layer, s.status);

  const provenance: LayerProvenance[] = input.bundle.provenance.map(p => ({
    layer: p.layer,
    status: statusByLayer.get(p.layer) ?? 'source-grounded',
    sources: p.sources.map(toSourceRef),
  })).sort((a, b) => a.layer.localeCompare(b.layer));

  const conflicts: ConflictRef[] = input.bundle.conflicts.map(c => ({
    description: c.description,
    resolution: c.resolution,
    resolvedBy: c.resolvedBy,
  }));
  for (const c of input.bundle.conflicts) {
    bus?.emit({ stage: 'bundle', kind: 'conflict', detail: c.description });
  }

  const skillSources: SkillSource[] = skills
    .map(s => ({
      slug: s.slug,
      path: s.path,
      sha256: sha256Hex(s.body),
      sources: s.sources,
    }))
    .sort((a, b) => a.slug.localeCompare(b.slug));

  const determinismInputs = {
    release_id: releaseId,
    bundle_hash: bundleHash,
    git_commit: opts.gitCommit,
    adapter_version: ADAPTER_VERSION,
    core_contract_version: input.contract_version,
    source_layer_hashes: sortedSourceLayerHashes,
    coverage,
    artifacts,
    provenance,
    conflicts,
    gaps: [...input.bundle.gaps].sort(),
    skill_sources: skillSources,
  };
  const determinismHash = computeDeterminismHash(determinismInputs);

  const manifest: ClaudeCodeManifest = ClaudeCodeManifestSchema.parse({
    release_id: releaseId,
    bundle_hash: bundleHash,
    git_commit: opts.gitCommit,
    adapter_version: ADAPTER_VERSION,
    core_contract_version: input.contract_version,
    built_at: opts.builtAt ?? new Date().toISOString(),
    source_layer_hashes: sortedSourceLayerHashes,
    coverage,
    provenance,
    conflicts,
    gaps: [...input.bundle.gaps].sort(),
    artifacts,
    skill_sources: skillSources,
    determinism_hash: determinismHash,
  });

  bus?.emit({
    stage: 'release',
    kind: 'compiled',
    release_id: releaseId,
    bundle_hash: bundleHash,
    determinism_hash: determinismHash,
    adapter_version: ADAPTER_VERSION,
    core_contract_version: input.contract_version,
    conflicts_unresolved: conflicts.filter(c => c.resolution === 'unresolved').length,
    gaps: [...input.bundle.gaps].sort(),
  });

  return { claudeMd: claudeMd.body, skills, manifest };
}
