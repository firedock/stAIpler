import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

function walk(dir: string, ext: Set<string>, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.next') continue;
      walk(full, ext, acc);
    } else {
      const dot = name.lastIndexOf('.');
      if (dot >= 0 && ext.has(name.slice(dot))) acc.push(full);
    }
  }
  return acc;
}

/**
 * Trust boundary invariant:
 *
 *   The only code paths that may set knowledge_atoms.status = 'stable' are
 *   the 'promote' and 'merge' branches of the review queue action route,
 *   both of which log events with actor='user'.
 *
 * Every other module in the knowledge pipeline — extract, reconcile,
 * promote (auto-rules), render, inject — MUST NOT write 'stable'.
 *
 * This test scans the source files for string literals that would assign
 * 'stable' to a status field and fails if it finds one outside the
 * sanctioned action route.
 */

const WEB_ROOT = resolve(__dirname, '..', '..');

// File that is ALLOWED to contain stable-promotion logic.
const SANCTIONED_FILES = [
  'src/app/api/knowledge/atoms/[id]/action/route.ts',
];

// Patterns: write-site occurrences of status='stable'. We deliberately avoid
// matching TypeScript union type members (`status: 'stable' | 'provisional'`)
// and equality checks (`atom.status === 'stable'`). The patterns target the
// Supabase .update({...}) and .insert({...}) call shapes we actually use.
const WRITE_PATTERNS = [
  /\.update\s*\(\s*\{[^}]*\bstatus\s*:\s*['"]stable['"][^}]*\}/s,
  /\.insert\s*\(\s*\{[^}]*\bstatus\s*:\s*['"]stable['"][^}]*\}/s,
  /\.upsert\s*\(\s*\{[^}]*\bstatus\s*:\s*['"]stable['"][^}]*\}/s,
];

function isSanctioned(relPath: string): boolean {
  return SANCTIONED_FILES.some(p => relPath === p || relPath.endsWith('/' + p));
}

describe('trust boundary: stable status writes', () => {
  it('no unsanctioned file assigns status=stable', () => {
    const files = walk(resolve(WEB_ROOT, 'src'), new Set(['.ts', '.tsx']));
    const offenders: string[] = [];
    for (const full of files) {
      const rel = relative(WEB_ROOT, full).split(sep).join('/');
      if (isSanctioned(rel)) continue;
      const body = readFileSync(full, 'utf-8');
      for (const pattern of WRITE_PATTERNS) {
        if (pattern.test(body)) {
          offenders.push(`${rel} matches ${pattern}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('sanctioned file actually does contain the stable-promotion write (sanity)', () => {
    const body = readFileSync(
      resolve(WEB_ROOT, 'src/app/api/knowledge/atoms/[id]/action/route.ts'),
      'utf-8',
    );
    expect(WRITE_PATTERNS.some(p => p.test(body))).toBe(true);
  });
});
