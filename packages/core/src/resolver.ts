import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { parseAssetFile } from './parser.js';
import { ResolveError } from './errors.js';
import type { Asset } from './types.js';

export function resolveAssetPath(
  ref: string,
  libraryDir: string,
  stackDir: string,
): string {
  if (ref.startsWith('./')) {
    const localPath = resolve(stackDir, ref);
    if (existsSync(localPath)) return localPath;
    throw new ResolveError('Local asset not found', localPath);
  }

  const withExt = ref.endsWith('.md') ? ref : `${ref}.md`;
  const libraryPath = resolve(libraryDir, withExt);
  if (existsSync(libraryPath)) return libraryPath;
  throw new ResolveError('Library asset not found', libraryPath);
}

export function resolveInheritanceTarget(
  targetId: string,
  libraryDir: string,
): Asset | null {
  const files = walkMdFiles(libraryDir);
  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const asset = parseAssetFile(filePath, content);
      if (asset.frontmatter.id === targetId) {
        return asset;
      }
    } catch {
      // skip files that fail to parse
    }
  }
  return null;
}

function walkMdFiles(dir: string): string[] {
  const results: string[] = [];
  if (!existsSync(dir)) return results;
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...walkMdFiles(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

export function findProjectRoot(startDir: string): string {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, 'staipler.config.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new ResolveError('Could not find project root (no staipler.config.yaml)', startDir);
    }
    dir = parent;
  }
}
