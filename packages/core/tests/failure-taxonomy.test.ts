import { describe, it, expect } from 'vitest';
import { FAILURE_CATEGORIES, classifyFailure } from '../src/eval/failure-taxonomy.js';
import type { TaskRunResult } from '../src/eval/benchmark-spec.js';

function mk(partial: Partial<TaskRunResult>): TaskRunResult {
  return {
    task_id: 't',
    category: 'constraint-obedience',
    mode: 'staipler',
    pass: false,
    deterministic_pass: false,
    judge_assisted_pass: null,
    elapsed_ms: 0,
    exit_code: 0,
    token_usage: null,
    cost_usd: null,
    failure_category: null,
    requirement_results: [],
    artifacts: {
      transcript_path: '',
      stdout_path: '',
      stderr_path: '',
      workspace_diff_path: '',
    },
    ...partial,
  };
}

describe('classifyFailure', () => {
  it('returns null for passing runs', () => {
    expect(classifyFailure(mk({ pass: true }))).toBe(null);
  });

  it('maps out-of-scope edit requirements to out-of-scope-edit', () => {
    const cat = classifyFailure(
      mk({
        requirement_results: [
          { requirement_id: 'r', requirement_type: 'no_edit_outside', scoring: 'deterministic', passed: false },
        ],
      }),
    );
    expect(cat).toBe('out-of-scope-edit');
  });

  it('maps file requirements to missed-constraint', () => {
    const cat = classifyFailure(
      mk({
        requirement_results: [
          { requirement_id: 'r', requirement_type: 'file_contains', scoring: 'deterministic', passed: false },
        ],
      }),
    );
    expect(cat).toBe('missed-constraint');
  });

  it('maps judge failures to category-specific labels', () => {
    const judgeFail = (category: TaskRunResult['category']) =>
      classifyFailure(
        mk({
          category,
          requirement_results: [
            { requirement_id: 'r', requirement_type: 'llm_judge', scoring: 'judge_assisted', passed: false },
          ],
        }),
      );
    expect(judgeFail('handoff-quality')).toBe('poor-handoff');
    expect(judgeFail('architecture-compliance')).toBe('wrong-architecture');
    expect(judgeFail('context-retention')).toBe('lost-context');
  });

  it('preserves preset failure_category', () => {
    const cat = classifyFailure(mk({ failure_category: 'timeout' }));
    expect(cat).toBe('timeout');
  });

  it('exposes every FAILURE_CATEGORIES entry as a string literal', () => {
    expect(FAILURE_CATEGORIES).toContain('timeout');
    expect(FAILURE_CATEGORIES).toContain('requirement-failed');
  });
});
