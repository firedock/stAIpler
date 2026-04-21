import { describe, it, expect } from 'vitest';
import { compileClaudeCode } from '../src/compile.js';
import { ADAPTER_VERSION } from '../src/manifest.js';
import { makeReadyBundle } from './fixtures.js';

describe('compileClaudeCode', () => {
  it('produces byte-identical artifacts for the same input across runs', () => {
    const input = makeReadyBundle();
    const a = compileClaudeCode(input, { gitCommit: 'abc123', builtAt: '2026-04-20T00:00:00.000Z' });
    const b = compileClaudeCode(input, { gitCommit: 'abc123', builtAt: '2027-01-01T12:00:00.000Z' });

    expect(a.claudeMd).toBe(b.claudeMd);
    expect(a.manifest.determinism_hash).toBe(b.manifest.determinism_hash);
    expect(a.manifest.release_id).toBe(b.manifest.release_id);
    expect(a.manifest.built_at).not.toBe(b.manifest.built_at);
    expect(a.skills.map(s => s.body).join('')).toBe(b.skills.map(s => s.body).join(''));
  });

  it('different git commit yields different release_id and determinism_hash', () => {
    const input = makeReadyBundle();
    const a = compileClaudeCode(input, { gitCommit: 'abc123' });
    const b = compileClaudeCode(input, { gitCommit: 'def456' });
    expect(a.manifest.release_id).not.toBe(b.manifest.release_id);
    expect(a.manifest.determinism_hash).not.toBe(b.manifest.determinism_hash);
  });

  it('rejects bundles with a mismatched contract_version', () => {
    const input = makeReadyBundle({ contract_version: 999 });
    expect(() => compileClaudeCode(input, { gitCommit: 'abc123' })).toThrow(/contract_version mismatch/);
  });

  it('stamps ADAPTER_VERSION into the manifest', () => {
    const input = makeReadyBundle();
    const out = compileClaudeCode(input, { gitCommit: 'abc123' });
    expect(out.manifest.adapter_version).toBe(ADAPTER_VERSION);
  });
});
