import type { TaskRunResult } from './benchmark-spec.js';

export const FAILURE_CATEGORIES = [
  'requirement-failed',
  'timeout',
  'tool-error',
  'parse-error',
  'out-of-scope-edit',
  'hallucinated-file-ref',
  'missed-constraint',
  'wrong-architecture',
  'lost-context',
  'poor-handoff',
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

/**
 * Classifier that maps a failed run to a single category. Callers that already
 * know the concrete failure mode (e.g. timeout, tool-error) should set
 * `result.failure_category` directly and skip this heuristic.
 */
export function classifyFailure(result: TaskRunResult): FailureCategory | null {
  if (result.pass) return null;

  if (result.failure_category) return result.failure_category;

  const failed = result.requirement_results.filter(r => !r.passed);
  if (failed.length === 0) return 'requirement-failed';

  const failedTypes = new Set(failed.map(r => r.requirement_type));
  if (failedTypes.has('no_edit_outside') || failedTypes.has('allowed_edit_globs')) {
    return 'out-of-scope-edit';
  }
  if (failedTypes.has('file_exists') || failedTypes.has('file_contains')) {
    return 'missed-constraint';
  }
  if (failedTypes.has('llm_judge')) {
    switch (result.category) {
      case 'handoff-quality': return 'poor-handoff';
      case 'architecture-compliance': return 'wrong-architecture';
      case 'context-retention': return 'lost-context';
      default: return 'requirement-failed';
    }
  }
  return 'requirement-failed';
}
