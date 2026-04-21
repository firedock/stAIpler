import { describe, it, expect } from 'vitest';
import { compileClaudeCode } from '../src/compile.js';
import {
  ADAPTER_VERSION,
  ClaudeCodeManifestSchema,
  computeDeterminismHash,
  computeReleaseId,
  stableStringify,
} from '../src/manifest.js';
import { makeReadyBundle } from './fixtures.js';

describe('manifest schema + hashing', () => {
  it('compiled manifest validates against the zod schema', () => {
    const out = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc123' });
    expect(() => ClaudeCodeManifestSchema.parse(out.manifest)).not.toThrow();
  });

  it('determinism_hash excludes built_at', () => {
    const a = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc123', builtAt: 'T1' });
    const b = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc123', builtAt: 'T2' });
    expect(a.manifest.determinism_hash).toBe(b.manifest.determinism_hash);
  });

  it('source_layer_hashes covers every section in the bundle', () => {
    const input = makeReadyBundle();
    const out = compileClaudeCode(input, { gitCommit: 'abc123' });
    for (const section of input.bundle.sections) {
      expect(out.manifest.source_layer_hashes[section.layer]).toBeDefined();
      expect(out.manifest.source_layer_hashes[section.layer]).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('stableStringify produces sorted keys for hash stability', () => {
    const a = stableStringify({ b: 1, a: 2 });
    const b = stableStringify({ a: 2, b: 1 });
    expect(a).toBe(b);
  });

  it('computeReleaseId is deterministic and 12 hex chars', () => {
    const id = computeReleaseId('f'.repeat(64), 'abc', ADAPTER_VERSION);
    expect(id).toMatch(/^[0-9a-f]{12}$/);
    expect(computeReleaseId('f'.repeat(64), 'abc', ADAPTER_VERSION)).toBe(id);
  });

  it('renderer changes propagate to determinism_hash (adapter_version participation)', () => {
    const inputs = {
      release_id: 'abc123abc123',
      bundle_hash: 'f'.repeat(64),
      git_commit: 'abc',
      adapter_version: '0.1.0',
      core_contract_version: 1,
      source_layer_hashes: { identity: 'a'.repeat(64) },
      coverage: { present: ['identity'], weak: [], missing: [], readinessScore: 50, grade: 'F' },
      artifacts: {
        claudeMd: { path: 'CLAUDE.md', sha256: 'b'.repeat(64) },
        skills: [],
      },
    };
    const h1 = computeDeterminismHash(inputs);
    const h2 = computeDeterminismHash({ ...inputs, adapter_version: '0.2.0' });
    expect(h1).not.toBe(h2);
  });
});
