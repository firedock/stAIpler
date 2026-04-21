import { describe, it, expect } from 'vitest';
import { execFileSync, spawnSync } from 'child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { tmpdir } from 'os';

const repoRoot = resolve(__dirname, '..', '..', '..');
const runMatrixScript = join(repoRoot, 'benchmark/harbor/scripts/run-matrix.ts');

function initGitRepo(cwd: string) {
  execFileSync('git', ['init', '-q'], { cwd });
  execFileSync('git', ['config', 'user.email', 'bench@staipler.local'], { cwd });
  execFileSync('git', ['config', 'user.name', 'staipler-bench'], { cwd });
  execFileSync('git', ['add', '-A'], { cwd, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'smoke'], { cwd, stdio: 'ignore' });
}

describe('benchmark runner end-to-end (mock claude)', () => {
  it('runs baseline + staipler on a tiny dataset and emits events.jsonl + reports', () => {
    const tmpRepo = mkdtempSync(join(tmpdir(), 'staipler-e2e-'));
    // Minimal "project" with some instruction files so the active bundle is non-empty.
    writeFileSync(join(tmpRepo, 'pnpm-workspace.yaml'), 'packages:\n');
    writeFileSync(
      join(tmpRepo, 'IDENTITY.md'),
      '# Identity\n\nYou are a careful assistant focused on evidence-grounded code review.\n',
    );
    writeFileSync(
      join(tmpRepo, 'CONSTRAINTS.md'),
      '# Constraints\n\n- Never commit secrets.\n- Never force-push main.\n',
    );

    // Tiny dataset with one fixture task that must pass deterministically.
    const datasetDir = join(tmpRepo, 'benchmark/datasets/tiny');
    const tasksDir = join(datasetDir, 'tasks/constraint-obedience');
    mkdirSync(tasksDir, { recursive: true });
    writeFileSync(join(datasetDir, 'manifest.yml'), 'name: tiny\nversion: 0.0.1\ntask_count: 1\n');
    writeFileSync(
      join(tasksDir, 'smoke-001.yml'),
      `id: smoke-001
title: mock smoke
category: constraint-obedience
workspace_source: fixture
description: smoke test
input:
  prompt: |
    Say hello.
  files:
    - path: note.md
      content: "hi\\n"
requirements:
  - id: note-exists
    type: file_exists
    description: note must exist
    path: note.md
  - id: stdout-has-mock
    type: text_contains
    description: mock-claude banner must appear
    target: stdout
    value: "mock-claude received"
timeout_seconds: 30
`,
    );

    // Provide a fixture base-repo so workspace_source=fixture tasks have a seed
    mkdirSync(join(tmpRepo, 'benchmark/harbor/fixtures/base-repo'), { recursive: true });
    writeFileSync(join(tmpRepo, 'benchmark/harbor/fixtures/base-repo/README.md'), '# base\n');

    initGitRepo(tmpRepo);
    const claudeBin = join(repoRoot, 'benchmark/harbor/fixtures/mock-claude/claude');

    const outDir = join(tmpRepo, 'benchmark/runs');
    const res = spawnSync(
      'pnpm',
      ['exec', 'tsx', runMatrixScript,
        '--repo', tmpRepo,
        '--dataset', datasetDir,
        '--out', outDir,
        '--mode', 'both',
        '--model', 'sonnet',
        '--timeout', '30',
        '--quiet',
      ],
      {
        cwd: repoRoot,
        encoding: 'utf-8',
        env: { ...process.env, STAIPLER_CLAUDE_BIN: claudeBin },
        timeout: 120_000,
      },
    );

    if (res.status !== 0) {
      throw new Error(`run-matrix exited ${res.status}\nstdout:\n${res.stdout}\nstderr:\n${res.stderr}`);
    }

    // Find the release id — there should be exactly one subdir under outDir
    const entries = readFileSync; void entries;
    const releases = execFileSync('ls', [outDir], { encoding: 'utf-8' }).trim().split('\n');
    expect(releases.length).toBeGreaterThanOrEqual(1);
    const releaseId = releases[0];

    const runDir = join(outDir, releaseId);
    expect(existsSync(join(runDir, 'events.jsonl'))).toBe(true);
    expect(existsSync(join(runDir, 'diff.md'))).toBe(true);
    expect(existsSync(join(runDir, 'baseline/run.json'))).toBe(true);
    expect(existsSync(join(runDir, 'staipler/run.json'))).toBe(true);
    expect(existsSync(join(runDir, 'staipler/summary.md'))).toBe(true);

    const baselineRun = JSON.parse(readFileSync(join(runDir, 'baseline/run.json'), 'utf-8'));
    const staiplerRun = JSON.parse(readFileSync(join(runDir, 'staipler/run.json'), 'utf-8'));
    expect(baselineRun.results).toHaveLength(1);
    expect(staiplerRun.results).toHaveLength(1);
    expect(baselineRun.results[0].task_id).toBe('smoke-001');
    expect(baselineRun.release).toBeDefined();
    expect(staiplerRun.release).toBeDefined();

    // events.jsonl must contain a compile release event and a task done event
    const events = readFileSync(join(runDir, 'events.jsonl'), 'utf-8')
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(events.find(e => e.stage === 'release' && e.kind === 'compiled')).toBeDefined();
    expect(events.find(e => e.stage === 'task' && e.kind === 'done' && e.mode === 'staipler')).toBeDefined();
    expect(events.find(e => e.stage === 'run' && e.kind === 'done')).toBeDefined();

    // Each mode's per-task dir must have three artifacts
    for (const mode of ['baseline', 'staipler']) {
      const taskDir = join(runDir, mode, 'tasks/smoke-001');
      expect(existsSync(join(taskDir, 'stdout.txt'))).toBe(true);
      expect(existsSync(join(taskDir, 'stderr.txt'))).toBe(true);
      expect(existsSync(join(taskDir, 'workspace.diff'))).toBe(true);
    }

    // Release manifest must include provenance and conflicts (empty) fields
    const manifestPath = join(tmpRepo, '.staipler/releases', `${releaseId}.json`);
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    expect(Array.isArray(manifest.provenance)).toBe(true);
    expect(Array.isArray(manifest.conflicts)).toBe(true);
    expect(manifest.provenance.length).toBeGreaterThan(0);
  }, 180_000);
});
