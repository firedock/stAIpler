import { describe, it, expect } from 'vitest';
import { mergeAssets } from '../src/merge.js';
import type { Asset, LayerType, MergeStrategy } from '../src/types.js';

function makeAsset(overrides: {
  id: string;
  kind: LayerType;
  priority?: number;
  body?: string;
}): Asset {
  return {
    frontmatter: {
      id: overrides.id,
      kind: overrides.kind,
      version: '1.0.0',
      title: overrides.id,
      priority: overrides.priority ?? 50,
    },
    body: overrides.body ?? `Content of ${overrides.id}`,
    source: `/fake/${overrides.id}.md`,
    resolvedPath: `/fake/${overrides.id}.md`,
    format: 'native',
  };
}

describe('mergeAssets', () => {
  it('concatenate: keeps all assets in priority order', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'skills', priority: 50 }),
      makeAsset({ id: 'b', kind: 'skills', priority: 20 }),
      makeAsset({ id: 'c', kind: 'skills', priority: 80 }),
    ];
    const result = mergeAssets(assets, 'concatenate');
    expect(result).toHaveLength(3);
    expect(result[0].frontmatter.id).toBe('b');
    expect(result[1].frontmatter.id).toBe('a');
    expect(result[2].frontmatter.id).toBe('c');
  });

  it('last-wins: only highest priority kept', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'identity', priority: 20 }),
      makeAsset({ id: 'b', kind: 'identity', priority: 80 }),
      makeAsset({ id: 'c', kind: 'identity', priority: 50 }),
    ];
    const result = mergeAssets(assets, 'last-wins');
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.id).toBe('b');
  });

  it('last-wins: tie broken deterministically by ID', () => {
    const assets = [
      makeAsset({ id: 'b-asset', kind: 'identity', priority: 50 }),
      makeAsset({ id: 'a-asset', kind: 'identity', priority: 50 }),
    ];
    const result = mergeAssets(assets, 'last-wins');
    expect(result).toHaveLength(1);
    // Deterministic: alphabetically last ID wins on tie
    expect(result[0].frontmatter.id).toBe('b-asset');
  });

  it('default strategy for identity is last-wins', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'identity', priority: 20 }),
      makeAsset({ id: 'b', kind: 'identity', priority: 80 }),
    ];
    // Using undefined strategy triggers default
    const result = mergeAssets(assets, undefined, 'identity');
    expect(result).toHaveLength(1);
    expect(result[0].frontmatter.id).toBe('b');
  });

  it('default strategy for skills is concatenate', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'skills', priority: 20 }),
      makeAsset({ id: 'b', kind: 'skills', priority: 80 }),
    ];
    const result = mergeAssets(assets, undefined, 'skills');
    expect(result).toHaveLength(2);
  });

  it('default strategy for style is last-wins', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'style', priority: 20 }),
      makeAsset({ id: 'b', kind: 'style', priority: 80 }),
    ];
    const result = mergeAssets(assets, undefined, 'style');
    expect(result).toHaveLength(1);
  });

  it('default strategy for memory is concatenate', () => {
    const assets = [
      makeAsset({ id: 'a', kind: 'memory', priority: 20 }),
      makeAsset({ id: 'b', kind: 'memory', priority: 80 }),
    ];
    const result = mergeAssets(assets, undefined, 'memory');
    expect(result).toHaveLength(2);
  });

  it('override only affects specified type', () => {
    const skills = [
      makeAsset({ id: 'a', kind: 'skills', priority: 20 }),
      makeAsset({ id: 'b', kind: 'skills', priority: 80 }),
    ];
    const context = [
      makeAsset({ id: 'c', kind: 'context', priority: 20 }),
      makeAsset({ id: 'd', kind: 'context', priority: 80 }),
    ];

    // Override skills to last-wins
    const skillResult = mergeAssets(skills, 'last-wins');
    expect(skillResult).toHaveLength(1);

    // Context still concatenates (default)
    const contextResult = mergeAssets(context, undefined, 'context');
    expect(contextResult).toHaveLength(2);
  });
});
