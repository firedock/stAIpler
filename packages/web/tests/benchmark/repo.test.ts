import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  listReleases,
  listRunsForRelease,
  readRelease,
  readRunEvents,
  readTaskArtifacts,
  resetRepoRootCacheForTests,
} from '../../src/lib/benchmark/repo';

function seed(): string {
  const root = mkdtempSync(join(tmpdir(), 'staipler-webrepo-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');

  const releasesDir = join(root, '.staipler', 'releases');
  mkdirSync(releasesDir, { recursive: true });
  writeFileSync(
    join(releasesDir, 'abc123abc123.json'),
    JSON.stringify({
      release_id: 'abc123abc123',
      bundle_hash: 'f'.repeat(64),
      adapter_version: '0.1.0',
      core_contract_version: 1,
      git_commit: 'deadbeefdeadbeef',
      built_at: '2026-04-21T00:00:00.000Z',
      determinism_hash: 'd'.repeat(64),
      coverage: { present: ['identity'], weak: [], missing: ['goals'], readinessScore: 60, grade: 'D' },
      gaps: ['goals'],
      conflicts: [{ description: 'style conflict', resolution: 'unresolved', resolvedBy: 'unresolved' }],
      skill_sources: [{
        slug: 'triage',
        path: '.claude/skills/triage/SKILL.md',
        sha256: 'a'.repeat(64),
        sources: [{ sourceTitle: 'docs/skills.md', sourceUrl: null, provider: 'filesystem' }],
      }],
      provenance: [{
        layer: 'identity',
        status: 'source-grounded',
        sources: [{ sourceTitle: 'IDENTITY.md', sourceUrl: null, provider: 'filesystem' }],
      }],
    }),
  );

  const runDir = join(root, 'benchmark', 'runs', 'abc123abc123');
  for (const mode of ['baseline', 'staipler'] as const) {
    const modeDir = join(runDir, mode);
    mkdirSync(modeDir, { recursive: true });
    writeFileSync(
      join(modeDir, 'run.json'),
      JSON.stringify({
        meta: {
          mode,
          model: 'sonnet',
          started_at: 'T1',
          finished_at: 'T2',
          task_set_hash: 't'.repeat(64),
        },
        pass_rates: {
          deterministic: { passed: 1, total: 1, rate: 100 },
          judge_assisted: { passed: 0, total: 0, rate: 0 },
          overall: { passed: 1, total: 1, rate: 100 },
        },
        results: [{
          task_id: 'con-001',
          category: 'constraint-obedience',
          mode,
          pass: true,
          deterministic_pass: true,
          judge_assisted_pass: null,
          elapsed_ms: 1000,
          failure_category: null,
          requirement_results: [
            { requirement_id: 'r1', requirement_type: 'file_exists', scoring: 'deterministic', passed: true },
          ],
        }],
      }),
    );
    const taskDir = join(modeDir, 'tasks', 'con-001');
    mkdirSync(taskDir, { recursive: true });
    writeFileSync(join(taskDir, 'stdout.txt'), 'hello world\n');
    writeFileSync(join(taskDir, 'stderr.txt'), '');
    writeFileSync(join(taskDir, 'workspace.diff'), 'diff --git a/foo b/foo\n');
    writeFileSync(join(taskDir, 'transcript.txt'), 'transcript');
  }
  writeFileSync(
    join(runDir, 'events.jsonl'),
    JSON.stringify({ t: 0, elapsed_ms: 0, stage: 'run', kind: 'start' }) + '\n',
  );

  return root;
}

let tmp: string;

beforeEach(() => {
  tmp = seed();
  process.env.STAIPLER_REPO_ROOT = tmp;
  resetRepoRootCacheForTests();
});

afterEach(() => {
  delete process.env.STAIPLER_REPO_ROOT;
  resetRepoRootCacheForTests();
  rmSync(tmp, { recursive: true, force: true });
});

describe('benchmark repo adapter', () => {
  it('lists releases with coverage, conflicts, provenance, and skill sources', () => {
    const releases = listReleases();
    expect(releases).toHaveLength(1);
    expect(releases[0].release_id).toBe('abc123abc123');
    expect(releases[0].coverage.grade).toBe('D');
    expect(releases[0].conflicts[0].resolution).toBe('unresolved');
    expect(releases[0].provenance[0].sources[0].sourceTitle).toBe('IDENTITY.md');
    expect(releases[0].skill_sources[0].slug).toBe('triage');
  });

  it('reads a specific release by id', () => {
    const r = readRelease('abc123abc123');
    expect(r?.bundle_hash.length).toBe(64);
  });

  it('lists runs across both modes', () => {
    const runs = listRunsForRelease('abc123abc123');
    expect(runs.map(r => r.mode).sort()).toEqual(['baseline', 'staipler']);
    expect(runs[0].pass_rates.overall.rate).toBe(100);
    expect(runs[0].results[0].task_id).toBe('con-001');
  });

  it('reads task artifacts including requirements', () => {
    const a = readTaskArtifacts('abc123abc123', 'baseline', 'con-001');
    expect(a?.stdout).toContain('hello world');
    expect(a?.workspace_diff).toContain('diff --git');
    expect(a?.requirements[0].requirement_id).toBe('r1');
  });

  it('reads events.jsonl raw', () => {
    const text = readRunEvents('abc123abc123');
    expect(text).toContain('"stage":"run"');
  });
});
