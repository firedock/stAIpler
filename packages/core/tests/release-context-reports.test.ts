import { describe, it, expect } from 'vitest';
import {
  generateDiffMd,
  generateRunJson,
  generateSummaryMd,
} from '../src/eval/benchmark-report.js';
import type { ReleaseContext, RunMeta } from '../src/eval/benchmark-report.js';
import type { TaskRunResult } from '../src/eval/benchmark-spec.js';

function baseMeta(overrides: Partial<RunMeta> = {}): RunMeta {
  return {
    release_id: 'abcdef012345',
    bundle_hash: 'f'.repeat(64),
    adapter_version: '0.1.0',
    core_contract_version: 1,
    git_commit: 'abc',
    benchmark_runner_git_commit: 'abc',
    claude_cli_version: '1.0.0',
    node_version: 'v22',
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

function mkResult(partial: Partial<TaskRunResult> = {}): TaskRunResult {
  return {
    task_id: 't1',
    category: 'constraint-obedience',
    mode: 'baseline',
    pass: true,
    deterministic_pass: true,
    judge_assisted_pass: null,
    elapsed_ms: 0,
    exit_code: 0,
    token_usage: null,
    cost_usd: null,
    failure_category: null,
    requirement_results: [
      { requirement_id: 'r1', requirement_type: 'text_contains', scoring: 'deterministic', passed: true },
    ],
    artifacts: { transcript_path: '', stdout_path: '', stderr_path: '', workspace_diff_path: '' },
    ...partial,
  };
}

function releaseCtx(overrides: Partial<ReleaseContext> = {}): ReleaseContext {
  return {
    coverage: { present: ['identity'], weak: [], missing: ['goals'], readinessScore: 60, grade: 'D' },
    provenance: [
      {
        layer: 'identity',
        status: 'source-grounded',
        sources: [{ sourceTitle: 'IDENTITY.md', sourceUrl: null, provider: 'filesystem' }],
      },
    ],
    conflicts: [],
    gaps: ['goals'],
    skill_sources: [
      {
        slug: 'triage',
        path: '.claude/skills/triage/SKILL.md',
        sha256: 'a'.repeat(64),
        sources: [{ sourceTitle: 'docs/skills.md', sourceUrl: null, provider: 'filesystem' }],
      },
    ],
    ...overrides,
  };
}

describe('summary.md with release context', () => {
  it('includes release coverage, provenance, and skills sections', () => {
    const report = generateRunJson([mkResult()], baseMeta(), releaseCtx());
    const md = generateSummaryMd(report);
    expect(md).toContain('## Release coverage');
    expect(md).toContain('## Release provenance');
    expect(md).toContain('## Skills in this release');
    expect(md).toContain('IDENTITY.md');
    expect(md).toContain('triage');
    expect(md).toContain('`goals`'); // gap
  });

  it('flags unresolved conflicts in the release section', () => {
    const report = generateRunJson(
      [mkResult()],
      baseMeta(),
      releaseCtx({
        conflicts: [
          { description: 'style-a vs style-b', resolution: 'unresolved', resolvedBy: 'unresolved' },
        ],
      }),
    );
    const md = generateSummaryMd(report);
    expect(md).toContain('Release conflicts');
    expect(md).toContain('unresolved');
    expect(md).toContain('style-a vs style-b');
  });

  it('renders requirement-level pass/fail badges in the per-task table', () => {
    const report = generateRunJson(
      [
        mkResult({
          task_id: 't-one',
          pass: false,
          deterministic_pass: false,
          requirement_results: [
            { requirement_id: 'r1', requirement_type: 'no_edit_outside', scoring: 'deterministic', passed: false },
            { requirement_id: 'r2', requirement_type: 'file_exists', scoring: 'deterministic', passed: true },
          ],
        }),
      ],
      baseMeta(),
    );
    const md = generateSummaryMd(report);
    expect(md).toContain('✗ r1');
    expect(md).toContain('✓ r2');
  });
});

describe('diff.md with release context', () => {
  it('surfaces release caveats when the release has conflicts or gaps', () => {
    const baseline = generateRunJson([mkResult()], baseMeta(), releaseCtx({
      conflicts: [{ description: 'x', resolution: 'unresolved', resolvedBy: 'unresolved' }],
    }));
    const staipler = generateRunJson(
      [mkResult({ mode: 'staipler' })],
      baseMeta({ mode: 'staipler' }),
      releaseCtx({
        conflicts: [{ description: 'x', resolution: 'unresolved', resolvedBy: 'unresolved' }],
      }),
    );
    const md = generateDiffMd(baseline, staipler);
    expect(md).toContain('## Release caveats');
    expect(md).toContain('unresolved');
    expect(md).toContain('Missing layers');
  });
});
