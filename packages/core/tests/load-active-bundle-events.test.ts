import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { EventBus, memorySink } from '../src/events/index.js';
import { loadActiveBundle } from '../src/eval/load-active-bundle.js';

function seedRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'staipler-lab-'));
  mkdirSync(join(dir, 'library'), { recursive: true });
  writeFileSync(
    join(dir, 'IDENTITY.md'),
    '# Identity\n\nYou are a careful assistant that values evidence.\n',
  );
  writeFileSync(
    join(dir, 'CONSTRAINTS.md'),
    '# Constraints\n\n- Never commit secrets.\n- Never force-push main.\n',
  );
  return dir;
}

describe('loadActiveBundle visibility', () => {
  it('emits scan/analyze/bundle events for a seeded repo', () => {
    const repo = seedRepo();
    const bus = new EventBus();
    const { events, sink } = memorySink();
    bus.addSink(sink);

    const { bundle } = loadActiveBundle(repo, bus);

    const stages = new Set(events.map(e => e.stage));
    expect(stages.has('scan')).toBe(true);
    expect(stages.has('analyze')).toBe(true);
    expect(stages.has('bundle')).toBe(true);

    const bundleDone = events.find(e => e.stage === 'bundle' && e.kind === 'done');
    expect(bundleDone).toBeDefined();
    expect((bundleDone as { bundle_hash: string }).bundle_hash).toBe(bundle.hash);
  });

  it('populates provenance per layer using real file paths', () => {
    const repo = seedRepo();
    const { bundle } = loadActiveBundle(repo);
    const identityProv = bundle.provenance.find(p => p.layer === 'identity');
    const constraintsProv = bundle.provenance.find(p => p.layer === 'constraints');
    expect(identityProv?.sources[0]?.sourceTitle).toContain('IDENTITY.md');
    expect(constraintsProv?.sources[0]?.sourceTitle).toContain('CONSTRAINTS.md');
    expect(identityProv?.sources[0]?.provider).toBe('filesystem');
  });
});
