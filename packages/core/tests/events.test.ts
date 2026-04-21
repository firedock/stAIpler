import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventBus, consoleSink, formatEventLine, jsonlFileSink, memorySink } from '../src/events/index.js';

describe('EventBus', () => {
  it('emits events with monotonic elapsed_ms and full timestamps', async () => {
    const bus = new EventBus();
    const { events, sink } = memorySink();
    bus.addSink(sink);

    bus.emit({ stage: 'scan', kind: 'start' });
    await new Promise(r => setTimeout(r, 5));
    bus.emit({ stage: 'scan', kind: 'done', file_count: 0 });

    expect(events).toHaveLength(2);
    expect(events[0].t).toBeGreaterThan(0);
    expect(events[1].elapsed_ms).toBeGreaterThanOrEqual(events[0].elapsed_ms);
  });

  it('does not throw when a sink throws', () => {
    const bus = new EventBus();
    bus.addSink(() => { throw new Error('bad sink'); });
    expect(() => bus.emit({ stage: 'scan', kind: 'start' })).not.toThrow();
  });

  it('delivers events to every sink in order', () => {
    const bus = new EventBus();
    const a: string[] = [];
    const b: string[] = [];
    bus.addSink(e => a.push(e.stage));
    bus.addSink(e => b.push(e.stage));
    bus.emit({ stage: 'scan', kind: 'start' });
    bus.emit({ stage: 'analyze', kind: 'start' });
    expect(a).toEqual(['scan', 'analyze']);
    expect(b).toEqual(['scan', 'analyze']);
  });
});

describe('formatEventLine', () => {
  it('renders task done events with pass/fail badges', () => {
    const line = formatEventLine({
      t: 0,
      elapsed_ms: 1234,
      stage: 'task',
      kind: 'done',
      task_id: 'con-001',
      mode: 'staipler',
      pass: false,
      deterministic_pass: false,
      judge_assisted_pass: null,
      failure_category: 'out-of-scope-edit',
      elapsed_task_ms: 950,
    });
    expect(line).toContain('con-001');
    expect(line).toContain('FAIL');
    expect(line).toContain('out-of-scope-edit');
  });

  it('renders requirement events with scoring tag', () => {
    const line = formatEventLine({
      t: 0,
      elapsed_ms: 1,
      stage: 'requirement',
      kind: 'evaluated',
      task_id: 't',
      mode: 'baseline',
      requirement_id: 'r1',
      requirement_type: 'no_edit_outside',
      scoring: 'deterministic',
      passed: false,
      detail: 'edits outside src/**',
    });
    expect(line).toContain('deterministic');
    expect(line).toContain('fail');
    expect(line).toContain('edits outside src/**');
  });
});

describe('jsonlFileSink', () => {
  it('writes one JSON object per line, parseable back', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staipler-events-'));
    const path = join(dir, 'events.jsonl');
    const bus = new EventBus();
    bus.addSink(jsonlFileSink(path));
    bus.emit({ stage: 'scan', kind: 'start' });
    bus.emit({ stage: 'scan', kind: 'done', file_count: 2 });
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    expect(lines).toHaveLength(2);
    const parsed = lines.map(l => JSON.parse(l));
    expect(parsed[0].stage).toBe('scan');
    expect(parsed[1].file_count).toBe(2);
  });
});

describe('consoleSink', () => {
  it('writes via the provided write function', () => {
    const lines: string[] = [];
    const sink = consoleSink(line => lines.push(line));
    sink({
      t: 0,
      elapsed_ms: 0,
      stage: 'run',
      kind: 'start',
      release_id: 'abc123def456',
      task_count: 3,
    });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('release_id=abc123def456');
  });
});
