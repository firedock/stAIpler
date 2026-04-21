import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { loadDataset } from '../src/eval/benchmark-spec.js';

const datasetDir = resolve(__dirname, '../../../benchmark/harbor/datasets/staipler-core');

describe('staipler-core benchmark dataset', () => {
  if (!existsSync(datasetDir)) {
    it.skip('dataset not present', () => { /* skip */ });
    return;
  }

  it('loads exactly 20 tasks across five categories', () => {
    const tasks = loadDataset(datasetDir);
    expect(tasks).toHaveLength(20);
    const byCategory: Record<string, number> = {};
    for (const t of tasks) byCategory[t.category] = (byCategory[t.category] ?? 0) + 1;
    expect(byCategory['constraint-obedience']).toBe(5);
    expect(byCategory['project-adaptation']).toBe(5);
    expect(byCategory['context-retention']).toBe(4);
    expect(byCategory['architecture-compliance']).toBe(4);
    expect(byCategory['handoff-quality']).toBe(2);
  });

  it('includes exactly the expected number of judge-assisted requirements', () => {
    const tasks = loadDataset(datasetDir);
    const judgeCount = tasks.reduce(
      (acc, t) => acc + t.requirements.filter(r => r.scoring === 'judge_assisted').length,
      0,
    );
    // 2 handoff tasks + 1 in arch-004 → 3 judge requirements total
    expect(judgeCount).toBe(3);
  });

  it('every task has at least one deterministic requirement', () => {
    const tasks = loadDataset(datasetDir);
    for (const t of tasks) {
      const deterministic = t.requirements.filter(r => r.scoring === 'deterministic');
      expect(deterministic.length, `task ${t.id} must have deterministic requirements`).toBeGreaterThan(0);
    }
  });
});
