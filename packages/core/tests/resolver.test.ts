import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  resolveAssetPath,
  resolveInheritanceTarget,
  findProjectRoot,
} from '../src/resolver.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

describe('resolveAssetPath', () => {
  const projectRoot = resolve(fixturesDir, 'basic-stack');
  const stackDir = projectRoot;
  const libraryDir = resolve(projectRoot, 'library');

  it('resolves library path', () => {
    const result = resolveAssetPath('core/identity', libraryDir, stackDir);
    expect(result).toBe(resolve(libraryDir, 'core/identity.md'));
  });

  it('resolves library path with .md extension', () => {
    const result = resolveAssetPath('core/identity.md', libraryDir, stackDir);
    expect(result).toBe(resolve(libraryDir, 'core/identity.md'));
  });

  it('resolves local path relative to stack', () => {
    const result = resolveAssetPath('./context.md', libraryDir, stackDir);
    expect(result).toBe(resolve(stackDir, 'context.md'));
  });

  it('throws on missing library asset', () => {
    expect(() => resolveAssetPath('core/nonexistent', libraryDir, stackDir))
      .toThrow(/not found/i);
  });

  it('throws on missing local asset', () => {
    expect(() => resolveAssetPath('./nonexistent.md', libraryDir, stackDir))
      .toThrow(/not found/i);
  });
});

describe('resolveInheritanceTarget', () => {
  it('resolves by asset ID from library', () => {
    const libraryDir = resolve(fixturesDir, 'inherited-stack/library');
    const result = resolveInheritanceTarget('core.base-identity', libraryDir);
    expect(result).not.toBeNull();
    expect(result!.frontmatter.id).toBe('core.base-identity');
  });

  it('returns null for nonexistent ID', () => {
    const libraryDir = resolve(fixturesDir, 'basic-stack/library');
    const result = resolveInheritanceTarget('nonexistent.asset', libraryDir);
    expect(result).toBeNull();
  });
});

describe('findProjectRoot', () => {
  it('finds project root by staipler.config.yaml', () => {
    const root = findProjectRoot(process.cwd());
    expect(root).toBe(process.cwd());
  });

  it('throws when no config found', () => {
    expect(() => findProjectRoot('/tmp')).toThrow(/project root/i);
  });
});
