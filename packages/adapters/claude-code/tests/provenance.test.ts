import { describe, it, expect } from 'vitest';
import { compileClaudeCode } from '../src/compile.js';
import { ClaudeCodeManifestSchema } from '../src/manifest.js';
import { makeReadyBundle, makeBundle } from './fixtures.js';

describe('manifest provenance + conflicts + skill sources', () => {
  it('carries bundle provenance through to the manifest', () => {
    const input = makeReadyBundle();
    const out = compileClaudeCode(input, { gitCommit: 'abc' });
    const identity = out.manifest.provenance.find(p => p.layer === 'identity');
    expect(identity).toBeDefined();
    expect(identity?.status).toBe('source-grounded');
    expect(identity?.sources[0].sourceTitle).toContain('docs/identity.md');
  });

  it('surfaces bundle conflicts in the manifest and events', () => {
    const bundle = makeBundle({
      conflicts: [
        {
          candidateA: 'a',
          candidateB: 'b',
          description: 'style-a disagrees with style-b',
          resolution: 'unresolved',
          resolvedBy: 'unresolved',
        },
      ],
    });
    const input = makeReadyBundle({ bundle });
    const out = compileClaudeCode(input, { gitCommit: 'abc' });
    expect(out.manifest.conflicts).toHaveLength(1);
    expect(out.manifest.conflicts[0].resolution).toBe('unresolved');
  });

  it('emits one skill source entry per rendered skill with sources from the skills layer', () => {
    const input = makeReadyBundle();
    const out = compileClaudeCode(input, { gitCommit: 'abc' });
    expect(out.manifest.skill_sources.length).toBe(out.skills.length);
    for (const s of out.manifest.skill_sources) {
      expect(s.sources[0]?.sourceTitle).toContain('docs/skills.md');
    }
  });

  it('manifest with provenance/conflicts/gaps/skill_sources still validates', () => {
    const input = makeReadyBundle();
    const out = compileClaudeCode(input, { gitCommit: 'abc' });
    expect(() => ClaudeCodeManifestSchema.parse(out.manifest)).not.toThrow();
  });

  it('provenance is sorted deterministically by layer', () => {
    const input = makeReadyBundle();
    const a = compileClaudeCode(input, { gitCommit: 'abc', builtAt: 'T1' });
    const b = compileClaudeCode(input, { gitCommit: 'abc', builtAt: 'T2' });
    expect(a.manifest.provenance.map(p => p.layer)).toEqual(
      b.manifest.provenance.map(p => p.layer),
    );
    expect(a.manifest.determinism_hash).toBe(b.manifest.determinism_hash);
  });

  it('changing provenance changes determinism_hash', () => {
    const a = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc' });
    const withExtraSource = makeReadyBundle();
    withExtraSource.bundle.provenance = withExtraSource.bundle.provenance.map(p =>
      p.layer === 'identity'
        ? {
            ...p,
            sources: [
              ...p.sources,
              {
                sourceTitle: 'docs/extra-identity.md',
                sourceUrl: null,
                provider: 'filesystem',
                span: null,
                importedAt: '2026-04-20T00:00:00.000Z',
                extractedAt: '2026-04-20T00:00:00.000Z',
              },
            ],
          }
        : p,
    );
    const b = compileClaudeCode(withExtraSource, { gitCommit: 'abc' });
    expect(a.manifest.determinism_hash).not.toBe(b.manifest.determinism_hash);
  });
});
