import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { parseAssetFile } from '../src/parser.js';
import { validateAssets } from '../src/validator.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

function loadAsset(fixturePath: string): ReturnType<typeof parseAssetFile> {
  const content = readFileSync(fixturePath, 'utf-8');
  return parseAssetFile(fixturePath, content);
}

describe('validateAssets', () => {
  it('passes for valid assets', () => {
    const asset = loadAsset(resolve(fixturesDir, 'assets/valid-identity.md'));
    const result = validateAssets([asset]);
    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('result is prefixed builtin:', () => {
    const asset = loadAsset(resolve(fixturesDir, 'assets/valid-identity.md'));
    const result = validateAssets([asset]);
    expect(result.contract).toBe('builtin:schema');
  });

  it('detects circular inheritance', () => {
    const a = loadAsset(resolve(fixturesDir, 'circular-inherit/library/circular/a.md'));
    const b = loadAsset(resolve(fixturesDir, 'circular-inherit/library/circular/b.md'));
    const result = validateAssets([a, b]);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => /circular/i.test(i))).toBe(true);
  });

  it('detects deep inheritance (depth > 2)', () => {
    const grandparent = loadAsset(resolve(fixturesDir, 'deep-inherit/library/deep/grandparent.md'));
    const parent = loadAsset(resolve(fixturesDir, 'deep-inherit/library/deep/parent.md'));
    const child = loadAsset(resolve(fixturesDir, 'deep-inherit/library/deep/child.md'));
    const result = validateAssets([grandparent, parent, child]);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => /depth|max/i.test(i))).toBe(true);
  });

  it('allows depth 2 inheritance', () => {
    const parent = loadAsset(resolve(fixturesDir, 'inherited-stack/library/core/base-identity.md'));
    const child = loadAsset(resolve(fixturesDir, 'inherited-stack/library/support/identity.md'));
    const result = validateAssets([parent, child]);
    expect(result.passed).toBe(true);
  });

  it('detects missing inheritance target', () => {
    const child = loadAsset(resolve(fixturesDir, 'inherited-stack/library/support/identity.md'));
    // parent not included in asset list
    const result = validateAssets([child]);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => /inherit|not found/i.test(i))).toBe(true);
  });
});
