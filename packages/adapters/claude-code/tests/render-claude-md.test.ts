import { describe, it, expect } from 'vitest';
import { renderClaudeMd } from '../src/render-claude-md.js';
import { makeReadyBundle } from './fixtures.js';

describe('renderClaudeMd', () => {
  it('includes always-loaded layers in canonical order', () => {
    const out = renderClaudeMd(makeReadyBundle(), {
      releaseId: 'abc123def456',
      bundleHash: 'f'.repeat(64),
      adapterVersion: '0.1.0',
      coreContractVersion: 1,
    });
    const idxIdentity = out.body.indexOf('## Identity');
    const idxContext = out.body.indexOf('## Context');
    const idxConstraints = out.body.indexOf('## Constraints');
    // CANONICAL_SECTION_ORDER is alphabetical: constraints, context, identity
    expect(idxConstraints).toBeGreaterThan(-1);
    expect(idxContext).toBeGreaterThan(idxConstraints);
    expect(idxIdentity).toBeGreaterThan(idxContext);
  });

  it('excludes the skills section body from CLAUDE.md but references the skills directory', () => {
    const out = renderClaudeMd(makeReadyBundle(), {
      releaseId: 'abc123def456',
      bundleHash: 'f'.repeat(64),
      adapterVersion: '0.1.0',
      coreContractVersion: 1,
    });
    expect(out.body).toContain('## Skills (on-demand)');
    expect(out.body).toContain('.claude/skills/');
    expect(out.body).not.toContain('When a test fails, identify the root cause first.');
  });

  it('emits a self-describing header with release + bundle metadata', () => {
    const out = renderClaudeMd(makeReadyBundle(), {
      releaseId: 'abc123def456',
      bundleHash: 'f'.repeat(64),
      adapterVersion: '0.1.0',
      coreContractVersion: 1,
    });
    expect(out.body).toMatch(/release_id=abc123def456/);
    expect(out.body).toMatch(/adapter_version=0\.1\.0/);
    expect(out.body).toMatch(/core_contract_version=1/);
  });

  it('omits layers with empty content from the body', () => {
    const bundle = makeReadyBundle({
      bundle: {
        ...makeReadyBundle().bundle,
        sections: [
          { layer: 'identity', content: 'Real identity.', status: 'source-grounded' },
          { layer: 'constraints', content: '   ', status: 'source-grounded' },
        ],
      },
    });
    const out = renderClaudeMd(bundle, {
      releaseId: 'abc123def456',
      bundleHash: 'f'.repeat(64),
      adapterVersion: '0.1.0',
      coreContractVersion: 1,
    });
    expect(out.includedLayers).toContain('identity');
    expect(out.excludedLayers).toContain('constraints');
    expect(out.body).not.toContain('## Constraints');
  });
});
