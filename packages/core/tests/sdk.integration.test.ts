import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { buildStack, validateStack, parseAsset } from '../src/index.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

describe('SDK API', () => {
  it('buildStack returns CompiledBundle', () => {
    const bundle = buildStack('basic-stack', fixturesDir);
    expect(bundle.stackId).toBe('basic-stack');
    expect(bundle.hash).toBeTruthy();
    expect(bundle.sections.length).toBeGreaterThan(0);
    expect(bundle.fullText).toBeTruthy();
    expect(bundle.resolvedAssets.length).toBeGreaterThan(0);
    expect(bundle.compileOrder.length).toBeGreaterThan(0);
    expect(bundle.contractResults.length).toBeGreaterThan(0);
    expect(bundle.metadata.assetCount).toBeGreaterThan(0);
  });

  it('validateStack returns results', () => {
    const assets = [
      parseAsset(
        resolve(fixturesDir, 'assets/valid-identity.md'),
        readFileSync(resolve(fixturesDir, 'assets/valid-identity.md'), 'utf-8'),
      ),
    ];
    const result = validateStack(assets);
    expect(result.contract).toBe('builtin:schema');
    expect(result.passed).toBe(true);
  });

  it('parseAsset returns Asset', () => {
    const filePath = resolve(fixturesDir, 'assets/valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAsset(filePath, content);
    expect(asset.frontmatter.id).toBe('core.identity');
    expect(asset.frontmatter.kind).toBe('identity');
    expect(asset.body).toBeTruthy();
    expect(asset.format).toBe('native');
  });
});
