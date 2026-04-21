import { appendFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { EventSink, VisibilityEvent } from './bus.js';

/**
 * Render an event to a single human-readable line.
 *
 * Format: `[+ms] stage/kind detail` — colorless by default so the same output
 * works in CI logs, terminals, and the dashboard's log viewer.
 */
export function formatEventLine(event: VisibilityEvent): string {
  const ts = `[+${String(event.elapsed_ms).padStart(6, ' ')}ms]`;
  const stageKind = `${event.stage}/${'kind' in event ? event.kind : ''}`.padEnd(24, ' ');
  switch (event.stage) {
    case 'scan':
      return `${ts} ${stageKind} ${event.kind === 'file' ? event.path : event.kind === 'done' ? `${event.file_count ?? 0} file(s)` : ''}`.trimEnd();
    case 'analyze':
      if (event.kind === 'layer') return `${ts} ${stageKind} ${event.layer} ${event.status} (${event.quality_score}/100)`.trimEnd();
      if (event.kind === 'done') return `${ts} ${stageKind} readiness=${event.readiness_score} grade=${event.grade}`.trimEnd();
      return `${ts} ${stageKind}`;
    case 'bundle':
      if (event.kind === 'section') return `${ts} ${stageKind} ${event.layer}`.trimEnd();
      if (event.kind === 'conflict' || event.kind === 'gap') return `${ts} ${stageKind} ${event.detail ?? event.layer ?? ''}`.trimEnd();
      if (event.kind === 'done') return `${ts} ${stageKind} sections=${event.section_count} conflicts=${event.conflict_count} gaps=${event.gap_count} hash=${(event.bundle_hash ?? '').slice(0, 12)}`.trimEnd();
      return `${ts} ${stageKind}`;
    case 'render':
      if (event.kind === 'claude-md') return `${ts} ${stageKind} ${event.path} (${event.byte_count} B)`.trimEnd();
      if (event.kind === 'skill') return `${ts} ${stageKind} ${event.skill_slug} → ${event.path}`.trimEnd();
      if (event.kind === 'manifest') return `${ts} ${stageKind} ${event.path}`.trimEnd();
      return `${ts} ${stageKind}`;
    case 'materialize':
      if (event.kind === 'write') return `${ts} ${stageKind} ${event.path} (${event.byte_count} B)`.trimEnd();
      if (event.kind === 'done') return `${ts} ${stageKind} ${event.artifact_count} artifact(s)`.trimEnd();
      return `${ts} ${stageKind}`;
    case 'release':
      if (event.kind === 'compiled') {
        return `${ts} ${stageKind} release_id=${event.release_id} conflicts=${event.conflicts_unresolved ?? 0} gaps=${(event.gaps ?? []).join(',') || 'none'}`.trimEnd();
      }
      return `${ts} ${stageKind} ${event.path ?? event.release_id}`.trimEnd();
    case 'task':
      if (event.kind === 'start') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} (${event.category}, ${event.workspace_source})`.trimEnd();
      if (event.kind === 'provision') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} → ${event.workspace_path}`.trimEnd();
      if (event.kind === 'materialize-artifacts') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} staipler artifacts written`.trimEnd();
      if (event.kind === 'spawn') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} claude -p`.trimEnd();
      if (event.kind === 'spawn-done') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} exit=${event.exit_code} in ${event.elapsed_task_ms}ms`.trimEnd();
      if (event.kind === 'evaluate') return `${ts} ${stageKind} [${event.mode}] ${event.task_id} ${event.detail ?? ''}`.trimEnd();
      if (event.kind === 'done') {
        const judge = event.judge_assisted_pass === null || event.judge_assisted_pass === undefined ? '—' : event.judge_assisted_pass ? 'pass' : 'fail';
        return `${ts} ${stageKind} [${event.mode}] ${event.task_id} ${event.pass ? 'PASS' : 'FAIL'} det=${event.deterministic_pass ? 'pass' : 'fail'} judge=${judge}${event.failure_category ? ` (${event.failure_category})` : ''}`.trimEnd();
      }
      return `${ts} ${stageKind}`;
    case 'requirement':
      return `${ts} ${stageKind} [${event.mode}] ${event.task_id} ${event.requirement_id} (${event.scoring}) ${event.passed ? 'pass' : 'fail'}${event.detail ? ` — ${event.detail}` : ''}`.trimEnd();
    case 'run':
      if (event.kind === 'start') return `${ts} ${stageKind} release_id=${event.release_id} tasks=${event.task_count}`.trimEnd();
      if (event.kind === 'mode-start') return `${ts} ${stageKind} [${event.mode}]`.trimEnd();
      if (event.kind === 'mode-done') return `${ts} ${stageKind} [${event.mode}] det=${event.deterministic_pass_rate}% judge=${event.judge_assisted_pass_rate === null || event.judge_assisted_pass_rate === undefined ? 'n/a' : `${event.judge_assisted_pass_rate}%`} overall=${event.pass_rate}% in ${event.elapsed_total_ms}ms`.trimEnd();
      if (event.kind === 'done') return `${ts} ${stageKind} release_id=${event.release_id}`.trimEnd();
      return `${ts} ${stageKind}`;
    case 'warning':
      return `${ts} ${stageKind} ${event.message}${event.detail ? ` — ${event.detail}` : ''}`.trimEnd();
  }
}

export function consoleSink(write: (line: string) => void = s => process.stdout.write(`${s}\n`)): EventSink {
  return (event: VisibilityEvent) => write(formatEventLine(event));
}

export function jsonlFileSink(path: string): EventSink {
  mkdirSync(dirname(path), { recursive: true });
  return (event: VisibilityEvent) => {
    appendFileSync(path, JSON.stringify(event) + '\n');
  };
}

export function memorySink(): { events: VisibilityEvent[]; sink: EventSink } {
  const events: VisibilityEvent[] = [];
  return {
    events,
    sink: (event: VisibilityEvent) => { events.push(event); },
  };
}
