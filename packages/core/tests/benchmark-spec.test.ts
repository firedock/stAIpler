import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { BenchmarkTaskSchema, loadTask, loadDataset } from '../src/eval/benchmark-spec.js';

function writeTask(dir: string, name: string, body: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), body);
}

describe('BenchmarkTaskSchema', () => {
  it('accepts a minimal deterministic task', () => {
    const parsed = BenchmarkTaskSchema.parse({
      id: 'con-001',
      title: 'No force push',
      category: 'constraint-obedience',
      workspace_source: 'fixture',
      description: 'Ensure agent does not force-push',
      input: { prompt: 'Do a safe operation.' },
      requirements: [
        { id: 'r1', type: 'text_contains', description: 'no force push in stdout', value: 'push --force' },
      ],
    });
    expect(parsed.id).toBe('con-001');
    expect(parsed.timeout_seconds).toBe(180);
    expect(parsed.network).toBe('none');
  });

  it('rejects tasks with unknown category', () => {
    expect(() =>
      BenchmarkTaskSchema.parse({
        id: 'x',
        title: 'x',
        category: 'nope',
        workspace_source: 'fixture',
        description: 'x',
        input: { prompt: 'x' },
        requirements: [{ id: 'r', type: 'file_exists', description: 'x', path: 'x' }],
      }),
    ).toThrow();
  });

  it('accepts all discriminated requirement types', () => {
    const parsed = BenchmarkTaskSchema.parse({
      id: 'adp-001',
      title: 'adapt',
      category: 'project-adaptation',
      workspace_source: 'current_repo_snapshot',
      description: 'd',
      input: { prompt: 'p' },
      requirements: [
        { id: 'a', type: 'text_contains', description: 'a', value: 'ok' },
        { id: 'a2', type: 'text_absent', description: 'a2', value: 'fail' },
        { id: 'b', type: 'text_matches', description: 'b', pattern: '^ok$' },
        { id: 'c', type: 'file_exists', description: 'c', path: 'x.md' },
        { id: 'd', type: 'file_absent', description: 'd', path: 'secret.env' },
        { id: 'e', type: 'file_contains', description: 'e', path: 'x.md', value: 'hello' },
        { id: 'f', type: 'no_edit_outside', description: 'f', allowed_globs: ['src/**'] },
        { id: 'g', type: 'allowed_edit_globs', description: 'g', globs: ['src/**'] },
        { id: 'h', type: 'workspace_diff_matches', description: 'h', pattern: '\\+import' },
        { id: 'h2', type: 'workspace_diff_absent', description: 'h2', pattern: 'secret' },
        { id: 'i', type: 'llm_judge', description: 'i', rubric: 'Was it good?' },
      ],
    });
    expect(parsed.requirements).toHaveLength(11);
    expect(parsed.requirements.find(r => r.id === 'i')?.scoring).toBe('judge_assisted');
    expect(parsed.requirements.find(r => r.id === 'a')?.scoring).toBe('deterministic');
    expect(parsed.requirements.find(r => r.id === 'a2')?.scoring).toBe('deterministic');
    expect(parsed.requirements.find(r => r.id === 'h2')?.scoring).toBe('deterministic');
  });
});

describe('loadTask / loadDataset', () => {
  it('round-trips YAML through the schema', () => {
    const dir = mkdtempSync(join(tmpdir(), 'staipler-bench-'));
    const subdir = join(dir, 'constraint-obedience');
    writeTask(
      subdir,
      'con-001.yml',
      `id: con-001
title: test
category: constraint-obedience
workspace_source: fixture
description: descr
input:
  prompt: do it
requirements:
  - id: r1
    type: file_exists
    description: r1
    path: README.md
`,
    );
    writeTask(dir, 'manifest.yml', 'name: test\nversion: 0.1.0\n');
    const tasks = loadDataset(dir);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe('con-001');
    const direct = loadTask(join(subdir, 'con-001.yml'));
    expect(direct.category).toBe('constraint-obedience');
  });
});
