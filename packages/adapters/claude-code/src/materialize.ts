import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import type { EventBus } from '@staipler/core';
import type { ClaudeCodeArtifacts } from './compile.js';

export interface MaterializeOptions {
  /**
   * When true, also write `.staipler/releases/<release_id>.json` next to the
   * materialized artifacts. Defaults to true — the release manifest is the
   * reproducibility anchor for any run that uses these artifacts.
   */
  writeReleaseManifest?: boolean;
  bus?: EventBus;
}

export interface MaterializeResult {
  claudeMdPath: string;
  skillPaths: string[];
  releaseManifestPath: string | null;
}

export function materialize(
  artifacts: ClaudeCodeArtifacts,
  workspaceDir: string,
  opts: MaterializeOptions = {},
): MaterializeResult {
  const bus = opts.bus;
  const root = resolve(workspaceDir);
  mkdirSync(root, { recursive: true });

  const claudeMdPath = join(root, artifacts.manifest.artifacts.claudeMd.path);
  mkdirSync(dirname(claudeMdPath), { recursive: true });
  writeFileSync(claudeMdPath, artifacts.claudeMd);
  bus?.emit({
    stage: 'materialize',
    kind: 'write',
    path: claudeMdPath,
    byte_count: Buffer.byteLength(artifacts.claudeMd),
  });

  const skillPaths: string[] = [];
  for (const skill of artifacts.skills) {
    const full = join(root, skill.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, skill.body);
    skillPaths.push(full);
    bus?.emit({
      stage: 'materialize',
      kind: 'write',
      path: full,
      byte_count: Buffer.byteLength(skill.body),
    });
  }

  let releaseManifestPath: string | null = null;
  if (opts.writeReleaseManifest !== false) {
    const releasesDir = join(root, '.staipler', 'releases');
    mkdirSync(releasesDir, { recursive: true });
    releaseManifestPath = join(releasesDir, `${artifacts.manifest.release_id}.json`);
    const content = JSON.stringify(artifacts.manifest, null, 2);
    writeFileSync(releaseManifestPath, content);
    bus?.emit({
      stage: 'materialize',
      kind: 'write',
      path: releaseManifestPath,
      byte_count: Buffer.byteLength(content),
    });
    bus?.emit({
      stage: 'release',
      kind: 'persisted',
      release_id: artifacts.manifest.release_id,
      bundle_hash: artifacts.manifest.bundle_hash,
      path: releaseManifestPath,
    });
  }

  bus?.emit({
    stage: 'materialize',
    kind: 'done',
    artifact_count: 1 + skillPaths.length + (releaseManifestPath ? 1 : 0),
  });

  return { claudeMdPath, skillPaths, releaseManifestPath };
}
