import { describe, it, expect } from 'vitest';
import { renderContinuitySection } from '../src/optimizer/continuity-status.js';
import type { ScannedFile, HandoffMetadata, HandoffStatus, HandoffSessionType } from '../src/optimizer/scanner.js';
import { DEFAULT_CONTINUITY_CONFIG } from '../src/config.js';

const NOW = new Date(Date.UTC(2026, 3, 22)); // 2026-04-22

function daysAgoISO(n: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function makeHandoff(
  overrides: Partial<HandoffMetadata> & { ageDays?: number; fileName?: string } = {},
): ScannedFile {
  const age = overrides.ageDays ?? 2;
  const date = daysAgoISO(age);
  const fileName = overrides.fileName ?? `${date}-${(overrides.thread ?? 'some-thread')}.md`;

  const metadata: HandoffMetadata = {
    title: overrides.title ?? 'Test Handoff',
    thread: overrides.thread ?? 'some-thread',
    date,
    status: (overrides.status as HandoffStatus) ?? 'in-progress',
    sessionType: (overrides.sessionType as HandoffSessionType) ?? 'code-change',
    continues: overrides.continues ?? null,
    summary: overrides.summary ?? 'A handoff summary.',
  };

  return {
    path: `/tmp/docs/handoffs/${fileName}`,
    relativePath: `docs/handoffs/${fileName}`,
    name: fileName,
    content: '',
    sourceType: 'generic-md',
    parsedAsset: null,
    handoffMetadata: metadata,
    inferredKind: 'continuity',
    inferredConfidence: 0.95,
    contentLength: 0,
  };
}

describe('renderContinuitySection — state messaging', () => {
  it('renders the missing message when no handoff files exist', () => {
    const out = renderContinuitySection([], DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('**Continuity — missing**');
    expect(out).toContain('Run `/handoff`');
    expect(out).not.toContain('| Thread |');
  });

  it('renders the "present but unreadable" message when handoffs exist but have no frontmatter', () => {
    const noMeta: ScannedFile = {
      ...makeHandoff(),
      handoffMetadata: null,
    };
    const out = renderContinuitySection([noMeta], DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('present but unreadable');
    expect(out).toContain('1 handoff file(s) found');
    expect(out).not.toContain('| Thread |');
  });

  it('renders the thread table when handoffs have valid frontmatter', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 2 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('**Continuity — 1 thread tracked**');
    expect(out).toContain('| alpha | in-progress | 2026-04-20 (2 days ago) | A handoff summary. |');
    expect(out).toContain('do not auto-load any handoff');
  });

  it('pluralizes threads correctly', () => {
    const files = [
      makeHandoff({ thread: 'alpha' }),
      makeHandoff({ thread: 'beta' }),
    ];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('**Continuity — 2 threads tracked**');
  });
});

describe('renderContinuitySection — thread collapsing', () => {
  it('collapses multiple handoffs in the same thread to the most recent', () => {
    const files = [
      makeHandoff({ thread: 'alpha', ageDays: 20, summary: 'Old alpha summary' }),
      makeHandoff({ thread: 'alpha', ageDays: 2, summary: 'New alpha summary' }),
    ];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('New alpha summary');
    expect(out).not.toContain('Old alpha summary');
    expect(out).toContain('**Continuity — 1 thread tracked**');
  });
});

describe('renderContinuitySection — stale warning', () => {
  it('adds a stale warning when the most recent handoff exceeds staleThresholdDays', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 45 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('**Stale**');
    expect(out).toContain('last handoff 45 days old');
  });

  it('does not add a stale warning when within the threshold', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 5 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).not.toContain('**Stale**');
  });

  it('respects a custom staleThresholdDays', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 10 })];
    const out = renderContinuitySection(files, { ...DEFAULT_CONTINUITY_CONFIG, staleThresholdDays: 7 }, NOW);
    expect(out).toContain('**Stale**');
    expect(out).toContain('10 days old');
  });
});

describe('renderContinuitySection — truncation', () => {
  it('truncates to inlineThreadCap and shows the remainder count', () => {
    const files = Array.from({ length: 12 }, (_, i) =>
      makeHandoff({ thread: `thread-${String(i).padStart(2, '0')}`, ageDays: i + 1 }),
    );
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('**Continuity — 12 threads tracked**');
    expect(out).toContain('2 more threads in `docs/handoffs/INDEX.md`');

    // Only 10 visible rows (cap) — count "| thread-" occurrences
    const rowMatches = out.match(/\| thread-\d{2} \|/g) ?? [];
    expect(rowMatches).toHaveLength(10);
  });

  it('does not truncate when total <= cap', () => {
    const files = Array.from({ length: 3 }, (_, i) =>
      makeHandoff({ thread: `thread-${i}`, ageDays: i + 1 }),
    );
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).not.toContain('more threads in');
  });
});

describe('renderContinuitySection — sort modes', () => {
  const files = [
    makeHandoff({ thread: 'zebra',  ageDays: 20, status: 'in-progress' }),
    makeHandoff({ thread: 'alpha',  ageDays: 5,  status: 'paused' }),
    makeHandoff({ thread: 'middle', ageDays: 2,  status: 'closed' }),
  ];

  it('default sort is date desc (most recent first)', () => {
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    const idxMiddle = out.indexOf('| middle |');
    const idxAlpha = out.indexOf('| alpha |');
    const idxZebra = out.indexOf('| zebra |');
    expect(idxMiddle).toBeGreaterThan(-1);
    expect(idxMiddle).toBeLessThan(idxAlpha);
    expect(idxAlpha).toBeLessThan(idxZebra);
  });

  it('sort=thread is alphabetical', () => {
    const out = renderContinuitySection(files, { ...DEFAULT_CONTINUITY_CONFIG, sort: 'thread' }, NOW);
    const idxAlpha = out.indexOf('| alpha |');
    const idxMiddle = out.indexOf('| middle |');
    const idxZebra = out.indexOf('| zebra |');
    expect(idxAlpha).toBeLessThan(idxMiddle);
    expect(idxMiddle).toBeLessThan(idxZebra);
  });

  it('sort=status puts in-progress first, closed/done/abandoned last', () => {
    const out = renderContinuitySection(files, { ...DEFAULT_CONTINUITY_CONFIG, sort: 'status' }, NOW);
    const idxZebra = out.indexOf('| zebra |');   // in-progress
    const idxAlpha = out.indexOf('| alpha |');   // paused
    const idxMiddle = out.indexOf('| middle |'); // closed
    expect(idxZebra).toBeLessThan(idxAlpha);
    expect(idxAlpha).toBeLessThan(idxMiddle);
  });
});

describe('renderContinuitySection — escaping', () => {
  it('escapes pipes in summaries so the table does not break', () => {
    const files = [makeHandoff({ thread: 'alpha', summary: 'Summary with a | pipe in it' })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('Summary with a \\| pipe in it');
  });
});

describe('renderContinuitySection — age formatting', () => {
  it('shows "today" when age is 0 days', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 0 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('(today)');
  });

  it('shows "1 day ago" (singular) when age is 1 day', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 1 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('(1 day ago)');
  });

  it('shows "N days ago" for larger ages', () => {
    const files = [makeHandoff({ thread: 'alpha', ageDays: 14 })];
    const out = renderContinuitySection(files, DEFAULT_CONTINUITY_CONFIG, NOW);
    expect(out).toContain('(14 days ago)');
  });
});
