import { createHash } from 'crypto';
import { z } from 'zod';
import type { LayerType } from '@staipler/core';

/**
 * Version of this adapter's rendering contract. Bumping this forces a new
 * release_id and determinism_hash even when the input bundle and git commit
 * are unchanged, so a renderer change cannot masquerade as "same release."
 */
export const ADAPTER_VERSION = '0.1.0';

const ArtifactRefSchema = z.object({
  path: z.string().min(1),
  sha256: z.string().length(64),
});

const SourceRefSchema = z.object({
  sourceTitle: z.string(),
  sourceUrl: z.string().nullable(),
  provider: z.string(),
});

const LayerProvenanceSchema = z.object({
  layer: z.string(),
  status: z.enum(['source-grounded', 'ai-generated', 'mixed']),
  sources: z.array(SourceRefSchema),
});

const ConflictRefSchema = z.object({
  layer: z.string().optional(),
  description: z.string(),
  resolution: z.string(),
  resolvedBy: z.string(),
});

const SkillSourceSchema = z.object({
  slug: z.string(),
  path: z.string(),
  sha256: z.string().length(64),
  /** Sources that contributed to the skills layer that spawned this skill. */
  sources: z.array(SourceRefSchema),
});

export const ClaudeCodeManifestSchema = z.object({
  release_id: z.string().length(12),
  bundle_hash: z.string().length(64),
  git_commit: z.string().min(1),
  adapter_version: z.string().min(1),
  core_contract_version: z.number().int().positive(),
  built_at: z.string().min(1),
  source_layer_hashes: z.record(z.string(), z.string().length(64)),
  coverage: z.object({
    present: z.array(z.string()),
    weak: z.array(z.string()),
    missing: z.array(z.string()),
    readinessScore: z.number(),
    grade: z.string(),
  }),
  provenance: z.array(LayerProvenanceSchema),
  conflicts: z.array(ConflictRefSchema),
  gaps: z.array(z.string()),
  artifacts: z.object({
    claudeMd: ArtifactRefSchema,
    skills: z.array(ArtifactRefSchema),
  }),
  skill_sources: z.array(SkillSourceSchema),
  determinism_hash: z.string().length(64),
});
export type ClaudeCodeManifest = z.infer<typeof ClaudeCodeManifestSchema>;
export type LayerProvenance = z.infer<typeof LayerProvenanceSchema>;
export type SourceRef = z.infer<typeof SourceRefSchema>;
export type ConflictRef = z.infer<typeof ConflictRefSchema>;
export type SkillSource = z.infer<typeof SkillSourceSchema>;

export function stableStringify(value: unknown): string {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort()) {
        out[k] = walk((v as Record<string, unknown>)[k]);
      }
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function computeReleaseId(bundleHash: string, gitCommit: string, adapterVersion: string): string {
  return sha256Hex(`${bundleHash}|${gitCommit}|${adapterVersion}`).slice(0, 12);
}

export interface ManifestDeterminismInputs {
  release_id: string;
  bundle_hash: string;
  git_commit: string;
  adapter_version: string;
  core_contract_version: number;
  source_layer_hashes: Record<string, string>;
  coverage: ClaudeCodeManifest['coverage'];
  artifacts: ClaudeCodeManifest['artifacts'];
  provenance?: ClaudeCodeManifest['provenance'];
  conflicts?: ClaudeCodeManifest['conflicts'];
  gaps?: ClaudeCodeManifest['gaps'];
  skill_sources?: ClaudeCodeManifest['skill_sources'];
}

export function computeDeterminismHash(inputs: ManifestDeterminismInputs): string {
  return sha256Hex(stableStringify(inputs));
}

export function sortedLayerHashes(hashes: Record<LayerType, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of Object.keys(hashes).sort()) {
    out[k] = hashes[k as LayerType];
  }
  return out;
}
