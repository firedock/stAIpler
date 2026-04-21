import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventBus, memorySink } from '@staipler/core';
import { compileClaudeCode } from '../src/compile.js';
import { materialize } from '../src/materialize.js';
import { makeReadyBundle, makeBundle } from './fixtures.js';

describe('compileClaudeCode event emission', () => {
  it('emits render events for CLAUDE.md and every skill', () => {
    const bus = new EventBus();
    const { events, sink } = memorySink();
    bus.addSink(sink);
    const out = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc', bus });

    const renderEvents = events.filter(e => e.stage === 'render');
    expect(renderEvents.some(e => e.kind === 'claude-md')).toBe(true);
    const skillRenders = renderEvents.filter(e => e.kind === 'skill');
    expect(skillRenders).toHaveLength(out.skills.length);
  });

  it('emits release/compiled with release_id and conflict count', () => {
    const bus = new EventBus();
    const { events, sink } = memorySink();
    bus.addSink(sink);
    const input = makeReadyBundle({
      bundle: makeBundle({
        conflicts: [
          { candidateA: 'a', candidateB: 'b', description: 'x', resolution: 'unresolved', resolvedBy: 'unresolved' },
        ],
      }),
    });
    const out = compileClaudeCode(input, { gitCommit: 'abc', bus });
    const compiled = events.find(e => e.stage === 'release' && e.kind === 'compiled');
    expect(compiled).toBeDefined();
    expect((compiled as { release_id: string }).release_id).toBe(out.manifest.release_id);
    expect((compiled as { conflicts_unresolved: number }).conflicts_unresolved).toBe(1);
  });
});

describe('materialize event emission', () => {
  it('emits a write event for CLAUDE.md, each skill, and the release manifest', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staipler-mat-'));
    const bus = new EventBus();
    const { events, sink } = memorySink();
    bus.addSink(sink);
    const out = compileClaudeCode(makeReadyBundle(), { gitCommit: 'abc' });
    materialize(out, dir, { bus });
    const writes = events.filter(e => e.stage === 'materialize' && e.kind === 'write');
    expect(writes.length).toBe(1 + out.skills.length + 1);
    expect(events.find(e => e.stage === 'release' && e.kind === 'persisted')).toBeDefined();
    expect(events.find(e => e.stage === 'materialize' && e.kind === 'done')).toBeDefined();
  });
});
