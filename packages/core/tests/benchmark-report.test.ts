import { describe, it, expect } from 'vitest';
import {
  generateRunJson,
  generateSummaryMd,
  generateDiffMd,
  pairResults,
  computePassRates,
} from '../src/eval/benchmark-report.js';
import type { TaskRunResult } from '../src/eval/benchmark-spec.js';
import type { RunMeta } from '../src/eval/benchmark-report.js';

function baseMeta(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    release_id: 'abcdef012345',
    bundle_hash: 'f'.repeat(64),
    adapter_version: '0.1.0',
    core_contract_version: 1,
    git_commit: 'abc',
    benchmark_runner_git_commit: 'abc',
    claude_cli_version: '1.0.0',
    node_version: 'v22.0.0',
    platform: 'darwin-arm64',
    model: 'sonnet',
    mode: 'baseline',
    timeout_seconds: 180,
    timeout_policy: 'kill-on-timeout',
    env_allowlist: ['PATH'],
    network_policy: 'none',
    network_allowlist: [],
    allow_dirty: false,
    started_at: 'T1',
    finished_at: 'T2',
    total_elapsed_ms: 0,
    task_set_hash: 'a'.repeat(64),
    ...overrides,
  };
}

function mkResult(partial: Partial<TaskRunResult>): TaskRunResult {
  return {
    task_id: 'con-001',
    category: 'constraint-obedience',
    mode: 'baseline',
    pass: true,
    deterministic_pass: true,
    judge_assisted_pass: null,
    elapsed_ms: 1000,
    exit_code: 0,
    token_usage: null,
    cost_usd: null,
    failure_category: null,
    requirement_results: [
      { requirement_id: 'r1', requirement_type: 'text_contains', scoring: 'deterministic', passed: true },
    ],
    artifacts: {
      transcript_path: 't.txt',
      stdout_path: 'o.txt',
      stderr_path: 'e.txt',
      workspace_diff_path: 'd.diff',
    },
    ...partial,
  };
}

describe('computePassRates', () => {
  it('separates deterministic from judge-assisted counts', () => {
    const rates = computePassRates([
      mkResult({ task_id: 't1', pass: true, deterministic_pass: true }),
      mkResult({
        task_id: 't2',
        pass: false,
        deterministic_pass: true,
        judge_assisted_pass: false,
        requirement_results: [
          { requirement_id: 'r1', requirement_type: 'text_contains', scoring: 'deterministic', passed: true },
          { requirement_id: 'r2', requirement_type: 'llm_judge', scoring: 'judge_assisted', passed: false },
        ],
      }),
    ]);
    expect(rates.deterministic.total).toBe(2);
    expect(rates.deterministic.passed).toBe(2);
    expect(rates.judge_assisted.total).toBe(1);
    expect(rates.judge_assisted.passed).toBe(0);
    expect(rates.overall.passed).toBe(1);
  });
});

describe('generateSummaryMd', () => {
  it('reports deterministic and judge-assisted rates separately', () => {
    const report = generateRunJson(
      [mkResult({ task_id: 't1' })],
      baseMeta(),
    );
    const md = generateSummaryMd(report);
    expect(md).toContain('Deterministic');
    expect(md).toContain('Judge-assisted');
    expect(md).toContain('reported separately on purpose');
  });
});

describe('pairResults / generateDiffMd', () => {
  it('joins by task_id and flags regressions', () => {
    const baseline = generateRunJson(
      [
        mkResult({ task_id: 't1', pass: true }),
        mkResult({ task_id: 't2', pass: false, deterministic_pass: false, failure_category: 'requirement-failed' }),
      ],
      baseMeta(),
    );
    const staipler = generateRunJson(
      [
        mkResult({ task_id: 't1', mode: 'staipler', pass: false, deterministic_pass: false, failure_category: 'requirement-failed' }),
        mkResult({ task_id: 't2', mode: 'staipler', pass: true, deterministic_pass: true }),
      ],
      baseMeta({ mode: 'staipler' }),
    );
    const pairs = pairResults(baseline, staipler);
    expect(pairs).toHaveLength(2);
    expect(pairs.find(p => p.task_id === 't1')?.is_regression).toBe(true);
    expect(pairs.find(p => p.task_id === 't2')?.delta_pass).toBe(1);

    const md = generateDiffMd(baseline, staipler);
    expect(md).toContain('Regressions');
    expect(md).toContain('t1');
    expect(md).toContain('t2');
  });

  it('surfaces one-sided tasks without throwing', () => {
    const baseline = generateRunJson([mkResult({ task_id: 'only-b' })], baseMeta());
    const staipler = generateRunJson(
      [mkResult({ task_id: 'only-s', mode: 'staipler' })],
      baseMeta({ mode: 'staipler' }),
    );
    const pairs = pairResults(baseline, staipler);
    expect(pairs).toHaveLength(2);
    expect(pairs.find(p => p.task_id === 'only-b')?.staipler).toBeNull();
    expect(pairs.find(p => p.task_id === 'only-s')?.baseline).toBeNull();
  });

  it('warns when task-set hashes differ', () => {
    const baseline = generateRunJson([mkResult()], baseMeta({ task_set_hash: 'a'.repeat(64) }));
    const staipler = generateRunJson(
      [mkResult({ mode: 'staipler' })],
      baseMeta({ mode: 'staipler', task_set_hash: 'b'.repeat(64) }),
    );
    expect(generateDiffMd(baseline, staipler)).toContain('Task-set hashes differ');
  });
});
