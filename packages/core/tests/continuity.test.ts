import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scan, parseHandoffDate } from '../src/optimizer/scanner.js';
import { analyze } from '../src/optimizer/analyzer.js';

function makeProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'staipler-continuity-'));
  // Minimum plausible project so the analyzer has something to compare continuity against.
  mkdirSync(join(dir, 'docs'), { recursive: true });
  return dir;
}

function addHandoff(projectDir: string, filename: string, body = '# test handoff\n'): void {
  const handoffDir = join(projectDir, 'docs', 'handoffs');
  mkdirSync(handoffDir, { recursive: true });
  writeFileSync(join(handoffDir, filename), body);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('parseHandoffDate', () => {
  it('extracts date from a standard handoff filename', () => {
    const date = parseHandoffDate('2026-04-22-handoff-skill-design.md');
    expect(date).not.toBeNull();
    expect(date!.getUTCFullYear()).toBe(2026);
    expect(date!.getUTCMonth()).toBe(3); // April (0-indexed)
    expect(date!.getUTCDate()).toBe(22);
  });

  it('returns null for filenames without a date prefix', () => {
    expect(parseHandoffDate('handoff-skill-design.md')).toBeNull();
    expect(parseHandoffDate('README.md')).toBeNull();
    expect(parseHandoffDate('INDEX.md')).toBeNull();
  });
});

describe('scanner — continuity detection', () => {
  it('detects handoff files under docs/handoffs/ as the continuity layer', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(2)}-first-session.md`);
      addHandoff(dir, `${daysAgo(1)}-second-session.md`);

      const result = scan(dir);
      const continuityFiles = result.byKind.continuity ?? [];

      expect(continuityFiles).toHaveLength(2);
      expect(result.presentKinds).toContain('continuity');
      expect(result.missingKinds).not.toContain('continuity');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not pick up INDEX.md under docs/handoffs/ as a handoff file', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(2)}-only-real-handoff.md`);
      // INDEX.md inside handoffs/ is generated — shouldn't count as a handoff.
      writeFileSync(join(dir, 'docs', 'handoffs', 'INDEX.md'), '# Index\n');

      const result = scan(dir);
      const continuityFiles = result.byKind.continuity ?? [];

      expect(continuityFiles).toHaveLength(1);
      expect(continuityFiles[0].name).toMatch(/only-real-handoff\.md$/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reports continuity as missing when no handoffs exist', () => {
    const dir = makeProject();
    try {
      const result = scan(dir);
      expect(result.byKind.continuity ?? []).toHaveLength(0);
      expect(result.missingKinds).toContain('continuity');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('analyzer — continuity scoring', () => {
  it('scores 0 when no handoffs exist', () => {
    const dir = makeProject();
    try {
      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      expect(continuity.qualityScore).toBe(0);
      expect(continuity.status).toBe('missing');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('scores 70 for a single fresh handoff (base 40 + freshness 30)', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(2)}-single-fresh.md`);
      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      expect(continuity.qualityScore).toBe(70);
      expect(continuity.status).toBe('present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('awards chain bonus for sustained handoff discipline', () => {
    const dir = makeProject();
    try {
      // 5 handoffs, most recent is fresh → 40 base + 30 fresh + 15 chain>=2 + 10 chain>=5 = 95
      addHandoff(dir, `${daysAgo(21)}-session-1.md`);
      addHandoff(dir, `${daysAgo(14)}-session-2.md`);
      addHandoff(dir, `${daysAgo(8)}-session-3.md`);
      addHandoff(dir, `${daysAgo(4)}-session-4.md`);
      addHandoff(dir, `${daysAgo(1)}-session-5.md`);

      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      expect(continuity.qualityScore).toBe(95);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('drops freshness bonus when the most recent handoff is older than 30 days', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(45)}-single-stale.md`);
      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      // 40 base + 0 freshness + 0 chain (only 1) = 40
      expect(continuity.qualityScore).toBe(40);
      // Still counts as present (>0); "weak" threshold is <40, so exactly 40 is borderline present.
      expect(continuity.status).toBe('present');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rates moderate freshness (8–14 days) between fresh and aging', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(10)}-moderate.md`);
      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      // 40 base + 20 moderate = 60
      expect(continuity.qualityScore).toBe(60);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses the most recent handoff for freshness, not the oldest', () => {
    const dir = makeProject();
    try {
      // One ancient + one fresh → freshness score derives from the fresh one
      addHandoff(dir, `${daysAgo(90)}-very-old.md`);
      addHandoff(dir, `${daysAgo(2)}-very-new.md`);

      const result = analyze(scan(dir));
      const continuity = result.layers.find(l => l.kind === 'continuity')!;
      // 40 base + 30 fresh + 15 chain>=2 = 85
      expect(continuity.qualityScore).toBe(85);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
