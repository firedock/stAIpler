import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { scan, parseHandoffDate, parseHandoffFrontmatter } from '../src/optimizer/scanner.js';
import { analyze } from '../src/optimizer/analyzer.js';

const VALID_FRONTMATTER = `---
title: Example Handoff
thread: example-thread
date: 2026-04-22
status: in-progress
session_type: code-change
continues: null
summary: Example one-line summary for tests.
---

# Body
`;

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

  it('skips .claude/projects/ subdirectories so other-project session memory does not leak in', () => {
    const dir = makeProject();
    try {
      // Stray Claude Code session memory from a different project — must be ignored.
      const strayDir = join(dir, '.claude', 'projects', '-some-other-project', 'memory');
      mkdirSync(strayDir, { recursive: true });
      writeFileSync(join(strayDir, 'MEMORY.md'), '# stray memory from another project\n');

      const result = scan(dir);

      // Should NOT pick up the stray MEMORY.md from .claude/projects/
      expect(result.files.find(f => f.relativePath.includes('.claude/projects'))).toBeUndefined();
      expect(result.byKind.memory ?? []).toHaveLength(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('classifies CLAUDE.md as context via adapterMapping fallback', () => {
    const dir = makeProject();
    try {
      writeFileSync(join(dir, 'CLAUDE.md'), '# Project instructions\n\nThis project does X, Y, Z.\n');
      const result = scan(dir);

      const claudeFile = result.files.find(f => f.name === 'CLAUDE.md');
      expect(claudeFile).toBeDefined();
      expect(claudeFile!.inferredKind).toBe('context');
      expect(result.presentKinds).toContain('context');
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

describe('parseHandoffFrontmatter', () => {
  it('parses a complete valid frontmatter block', () => {
    const meta = parseHandoffFrontmatter(VALID_FRONTMATTER);
    expect(meta).not.toBeNull();
    expect(meta!.title).toBe('Example Handoff');
    expect(meta!.thread).toBe('example-thread');
    expect(meta!.date).toBe('2026-04-22');
    expect(meta!.status).toBe('in-progress');
    expect(meta!.sessionType).toBe('code-change');
    expect(meta!.continues).toBeNull();
    expect(meta!.summary).toBe('Example one-line summary for tests.');
  });

  it('returns null for content with no frontmatter', () => {
    expect(parseHandoffFrontmatter('# Just a body, no YAML\n')).toBeNull();
    expect(parseHandoffFrontmatter('')).toBeNull();
  });

  it('returns null for malformed YAML', () => {
    const malformed = `---
title: broken
thread: [unterminated
---

body
`;
    expect(parseHandoffFrontmatter(malformed)).toBeNull();
  });

  it('returns null when a required field is missing', () => {
    const noThread = `---
title: Missing Thread
date: 2026-04-22
summary: Should not parse
---
`;
    expect(parseHandoffFrontmatter(noThread)).toBeNull();
  });

  it('returns null when a required field is empty', () => {
    const emptySummary = `---
title: Empty Summary
thread: example
date: 2026-04-22
summary: ""
---
`;
    expect(parseHandoffFrontmatter(emptySummary)).toBeNull();
  });

  it('falls back to in-progress for an unknown status value', () => {
    const weird = `---
title: Weird Status
thread: example
date: 2026-04-22
status: weird-made-up-status
summary: Test
---
`;
    const meta = parseHandoffFrontmatter(weird);
    expect(meta).not.toBeNull();
    expect(meta!.status).toBe('in-progress');
  });

  it('falls back to code-change for an unknown session_type value', () => {
    const weird = `---
title: Weird Session Type
thread: example
date: 2026-04-22
session_type: not-a-real-type
summary: Test
---
`;
    const meta = parseHandoffFrontmatter(weird);
    expect(meta).not.toBeNull();
    expect(meta!.sessionType).toBe('code-change');
  });

  it('reads a populated continues filename when present', () => {
    const chained = `---
title: Second In Chain
thread: example
date: 2026-04-22
continues: 2026-04-15-first-in-chain.md
summary: Continues a prior session
---
`;
    const meta = parseHandoffFrontmatter(chained);
    expect(meta).not.toBeNull();
    expect(meta!.continues).toBe('2026-04-15-first-in-chain.md');
  });

  it('accepts all documented status values', () => {
    const statuses = ['open', 'in-progress', 'paused', 'blocked', 'closed', 'done', 'abandoned'];
    for (const status of statuses) {
      const fm = `---
title: Test
thread: example
date: 2026-04-22
status: ${status}
summary: Status test
---
`;
      const meta = parseHandoffFrontmatter(fm);
      expect(meta).not.toBeNull();
      expect(meta!.status).toBe(status);
    }
  });
});

describe('scanner — handoffMetadata population', () => {
  it('populates handoffMetadata on continuity files with valid frontmatter', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(1)}-test-handoff.md`, VALID_FRONTMATTER);
      const result = scan(dir);
      const continuityFiles = result.byKind.continuity ?? [];
      expect(continuityFiles).toHaveLength(1);
      expect(continuityFiles[0].handoffMetadata).not.toBeNull();
      expect(continuityFiles[0].handoffMetadata!.thread).toBe('example-thread');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves handoffMetadata null for handoff files with no frontmatter', () => {
    const dir = makeProject();
    try {
      addHandoff(dir, `${daysAgo(1)}-no-frontmatter.md`, '# body only\n');
      const result = scan(dir);
      const continuityFiles = result.byKind.continuity ?? [];
      expect(continuityFiles).toHaveLength(1);
      expect(continuityFiles[0].handoffMetadata).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('leaves handoffMetadata null for non-continuity files', () => {
    const dir = makeProject();
    try {
      // memory.md classifies as memory via FILENAME_LAYER_MAP — a definitely-non-continuity file.
      writeFileSync(join(dir, 'memory.md'), '# memory placeholder\n');
      const result = scan(dir);
      const memoryFiles = result.files.filter(f => f.inferredKind === 'memory');
      expect(memoryFiles.length).toBeGreaterThan(0);
      for (const f of memoryFiles) {
        expect(f.handoffMetadata).toBeNull();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
