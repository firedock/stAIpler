import { describe, it, expect } from 'vitest';
import {
  evaluateRequirement,
  parseChangedFiles,
  matchGlob,
} from '../src/eval/requirement-evaluator.js';
import type { Requirement } from '../src/eval/benchmark-spec.js';
import type { FileSystemProbe } from '../src/eval/requirement-evaluator.js';

const emptyText = { stdout: '', stderr: '', transcript: '' };
const emptyDiff = { diff: '', changedFiles: [] };
const emptyFs: FileSystemProbe = { exists: () => false, readFile: () => null };

describe('parseChangedFiles', () => {
  it('extracts changed file paths from a unified git diff', () => {
    const diff = `diff --git a/src/foo.ts b/src/foo.ts
index 111..222 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@
-old
+new
diff --git a/src/bar.ts b/src/bar.ts
--- a/src/bar.ts
+++ b/src/bar.ts
@@
+added
`;
    expect(parseChangedFiles(diff)).toEqual(['src/bar.ts', 'src/foo.ts']);
  });

  it('picks up renames by their target path', () => {
    const diff = `diff --git a/old.ts b/new.ts
similarity index 100%
rename from old.ts
rename to new.ts
`;
    expect(parseChangedFiles(diff)).toEqual(['new.ts']);
  });

  it('returns [] for an empty diff', () => {
    expect(parseChangedFiles('')).toEqual([]);
  });
});

describe('matchGlob', () => {
  it('matches ** across directory segments', () => {
    expect(matchGlob('packages/core/src/a.ts', 'packages/**/*.ts')).toBe(true);
    expect(matchGlob('packages/core/src/a.ts', 'packages/core/*.ts')).toBe(false);
  });

  it('does not cross / for single *', () => {
    expect(matchGlob('a/b.ts', '*.ts')).toBe(false);
    expect(matchGlob('a.ts', '*.ts')).toBe(true);
  });
});

describe('evaluateRequirement — no_edit_outside uses diff, not transcript', () => {
  it('fails when a changed file sits outside the allowlist, regardless of transcript content', () => {
    const req: Requirement = {
      id: 'r',
      type: 'no_edit_outside',
      description: 'stay in packages/core',
      allowed_globs: ['packages/core/**'],
      scoring: 'deterministic',
    };
    const textThatLies = {
      stdout: 'I only edited packages/core/foo.ts',
      stderr: '',
      transcript: 'I only edited packages/core/foo.ts',
    };
    const actualDiff = {
      diff: 'diff --git a/packages/web/page.tsx b/packages/web/page.tsx\n',
      changedFiles: ['packages/web/page.tsx'],
    };
    const result = evaluateRequirement(req, textThatLies, actualDiff, emptyFs);
    expect(result.passed).toBe(false);
    expect(result.detail).toContain('packages/web/page.tsx');
  });

  it('passes when every changed file is under the allowlist', () => {
    const req: Requirement = {
      id: 'r',
      type: 'no_edit_outside',
      description: 'stay in packages/core',
      allowed_globs: ['packages/core/**'],
      scoring: 'deterministic',
    };
    const actualDiff = {
      diff: 'diff --git a/packages/core/a.ts b/packages/core/a.ts\n',
      changedFiles: ['packages/core/a.ts'],
    };
    const result = evaluateRequirement(req, emptyText, actualDiff, emptyFs);
    expect(result.passed).toBe(true);
  });
});

describe('evaluateRequirement — text_contains respects target', () => {
  it('reads from the declared target stream', () => {
    const req: Requirement = {
      id: 'r',
      type: 'text_contains',
      description: 'tests ran',
      target: 'stderr',
      value: 'ran 3 tests',
      case_sensitive: true,
      scoring: 'deterministic',
    };
    const text = { stdout: '', stderr: 'ran 3 tests', transcript: '' };
    expect(evaluateRequirement(req, text, emptyDiff, emptyFs).passed).toBe(true);
  });
});

describe('evaluateRequirement — file_contains uses the FileSystemProbe', () => {
  it('passes only when probe returns content matching the needle', () => {
    const req: Requirement = {
      id: 'r',
      type: 'file_contains',
      description: 'c',
      path: 'x.md',
      value: 'hello',
      case_sensitive: true,
      scoring: 'deterministic',
    };
    const probe: FileSystemProbe = {
      exists: () => true,
      readFile: p => (p === 'x.md' ? 'hello world' : null),
    };
    expect(evaluateRequirement(req, emptyText, emptyDiff, probe).passed).toBe(true);
  });
});
