import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { parseAssetFile } from '../src/parser.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures/assets');

function fixturePath(name: string): string {
  return resolve(fixturesDir, name);
}

describe('parseAssetFile', () => {
  it('parses valid asset file', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.frontmatter.id).toBe('core.identity');
    expect(asset.frontmatter.kind).toBe('identity');
    expect(asset.frontmatter.version).toBe('1.0.0');
    expect(asset.frontmatter.title).toBe('Core Identity');
    expect(asset.format).toBe('native');
  });

  it('preserves body content exactly', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.body).toContain('You are a helpful AI assistant');
  });

  it('allows empty body', () => {
    const filePath = fixturePath('empty-body.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.body).toBe('');
    expect(asset.frontmatter.id).toBe('test.empty-body');
  });

  it('throws on malformed frontmatter', () => {
    const filePath = fixturePath('malformed-frontmatter.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('throws on missing frontmatter delimiters', () => {
    const filePath = '/fake/path.md';
    const content = 'Just some plain markdown without frontmatter';

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('preserves source path on asset', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.source).toBe(filePath);
  });

  it('trims whitespace in body consistently', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.body).toBe(asset.body.trim());
  });

  it('throws on invalid schema (missing id)', () => {
    const filePath = fixturePath('invalid-missing-id.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('throws on invalid schema (bad semver)', () => {
    const filePath = fixturePath('invalid-bad-semver.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('throws on invalid schema (bad kind)', () => {
    const filePath = fixturePath('invalid-bad-kind.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('throws on invalid schema (priority out of range)', () => {
    const filePath = fixturePath('invalid-priority-range.md');
    const content = readFileSync(filePath, 'utf-8');

    expect(() => parseAssetFile(filePath, content)).toThrow();
  });

  it('sets resolvedPath to filePath', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.resolvedPath).toBe(filePath);
  });

  it('parses skills asset with all optional fields', () => {
    const filePath = fixturePath('valid-skills.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.frontmatter.tags).toEqual(['support']);
    expect(asset.frontmatter.inputs).toEqual(['customer_message']);
    expect(asset.frontmatter.outputs).toEqual(['category', 'priority', 'response']);
    expect(asset.frontmatter.compatibility?.models).toEqual(['anthropic', 'openai']);
    expect(asset.frontmatter.priority).toBe(60);
  });

  it('defaults priority to 50 when not specified', () => {
    const filePath = fixturePath('valid-identity.md');
    const content = readFileSync(filePath, 'utf-8');
    const asset = parseAssetFile(filePath, content);

    expect(asset.frontmatter.priority).toBe(50);
  });
});
