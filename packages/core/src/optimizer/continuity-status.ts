import type { ScannedFile, HandoffMetadata, HandoffStatus } from './scanner.js';
import { parseHandoffDate } from './scanner.js';
import type { ContinuityConfig, ContinuitySortMode } from '../config.js';
import { DEFAULT_CONTINUITY_CONFIG } from '../config.js';

/**
 * Render the Continuity section for the CLAUDE.md status block.
 *
 * Takes the scanner's list of continuity-kind files and the user's continuity
 * config, produces the markdown block. Returns the empty string if continuity
 * is intentionally suppressed (no files AND user has explicit `inlineThreadCap: 0`);
 * otherwise always returns content — "missing" state is meaningful signal.
 */
export function renderContinuitySection(
  continuityFiles: ScannedFile[],
  config: ContinuityConfig = DEFAULT_CONTINUITY_CONFIG,
  now: Date = new Date(),
): string {
  const threads = collapseToThreads(continuityFiles);

  if (threads.length === 0) {
    if (continuityFiles.length === 0) {
      return [
        '**Continuity — missing**',
        '',
        'No handoff exists. Run `/handoff` at the end of your next working session to capture session context so the next agent can pick up where you left off.',
      ].join('\n');
    }
    // Handoff files exist but none has valid frontmatter — degraded state worth surfacing honestly.
    return [
      '**Continuity — present but unreadable**',
      '',
      `${continuityFiles.length} handoff file(s) found under \`docs/handoffs/\` but none has valid frontmatter. The next agent cannot read thread, status, or summary from these files.`,
    ].join('\n');
  }

  const sorted = sortThreads(threads, config.sort);
  const total = sorted.length;
  const cap = Math.max(0, config.inlineThreadCap);
  const visible = cap > 0 ? sorted.slice(0, cap) : sorted;
  const truncatedCount = total - visible.length;

  const lines: string[] = [];
  lines.push(`**Continuity — ${total} thread${total === 1 ? '' : 's'} tracked**`);
  lines.push('');

  const mostRecentDate = newestHandoffDate(continuityFiles);
  if (mostRecentDate) {
    const ageDays = daysBetween(mostRecentDate, now);
    if (ageDays > config.staleThresholdDays) {
      lines.push(`**Stale**: last handoff ${ageDays} days old. Consider writing a new one before starting fresh work.`);
      lines.push('');
    }
  }

  lines.push('| Thread | Status | Age | Summary |');
  lines.push('|---|---|---|---|');
  for (const t of visible) {
    lines.push(`| ${t.thread} | ${t.status} | ${formatAge(t.date, now)} | ${escapePipes(t.summary)} |`);
  }
  lines.push('');

  if (truncatedCount > 0) {
    lines.push(`_(${truncatedCount} more thread${truncatedCount === 1 ? '' : 's'} in \`docs/handoffs/INDEX.md\`.)_`);
    lines.push('');
  }

  lines.push(
    '_For the agent reading this: do not auto-load any handoff. If the user\'s first message references an existing thread, confirm and load the most recent handoff in that thread from `docs/handoffs/`. If ambiguous, ask which thread. Never guess._',
  );

  return lines.join('\n');
}

// ---- Internals ----

interface ThreadRow {
  thread: string;
  status: HandoffStatus;
  date: Date;        // date of the most recent handoff in this thread
  summary: string;   // summary from the most recent handoff in this thread
  title: string;
}

function collapseToThreads(files: ScannedFile[]): ThreadRow[] {
  const byThread = new Map<string, { meta: HandoffMetadata; date: Date }>();

  for (const file of files) {
    const meta = file.handoffMetadata;
    if (!meta) continue;

    const fileDate = parseHandoffDate(file.name) ?? safeParseISODate(meta.date);
    if (!fileDate) continue;

    const existing = byThread.get(meta.thread);
    if (!existing || fileDate > existing.date) {
      byThread.set(meta.thread, { meta, date: fileDate });
    }
  }

  return [...byThread.values()].map(({ meta, date }) => ({
    thread: meta.thread,
    status: meta.status,
    date,
    summary: meta.summary,
    title: meta.title,
  }));
}

function newestHandoffDate(files: ScannedFile[]): Date | null {
  let newest: Date | null = null;
  for (const file of files) {
    const d = parseHandoffDate(file.name);
    if (d && (!newest || d > newest)) newest = d;
  }
  return newest;
}

/** Status sort priority — higher = shown first. */
const STATUS_PRIORITY: Record<HandoffStatus, number> = {
  'in-progress': 6,
  blocked: 5,
  paused: 4,
  open: 3,
  closed: 2,
  done: 2,
  abandoned: 1,
};

function sortThreads(rows: ThreadRow[], mode: ContinuitySortMode): ThreadRow[] {
  const copy = [...rows];
  switch (mode) {
    case 'status':
      copy.sort((a, b) => {
        const diff = STATUS_PRIORITY[b.status] - STATUS_PRIORITY[a.status];
        if (diff !== 0) return diff;
        return b.date.getTime() - a.date.getTime();
      });
      return copy;
    case 'thread':
      copy.sort((a, b) => a.thread.localeCompare(b.thread, undefined, { sensitivity: 'base' }));
      return copy;
    case 'date':
    default:
      copy.sort((a, b) => b.date.getTime() - a.date.getTime());
      return copy;
  }
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86_400_000));
}

function formatAge(date: Date, now: Date): string {
  const iso = date.toISOString().slice(0, 10);
  const days = daysBetween(date, now);
  if (days === 0) return `${iso} (today)`;
  if (days === 1) return `${iso} (1 day ago)`;
  return `${iso} (${days} days ago)`;
}

function safeParseISODate(s: string): Date | null {
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return Number.isNaN(date.getTime()) ? null : date;
}

function escapePipes(s: string): string {
  return s.replace(/\|/g, '\\|');
}
