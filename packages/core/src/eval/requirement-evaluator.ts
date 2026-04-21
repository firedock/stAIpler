import type { Requirement, RequirementResult } from './benchmark-spec.js';

export interface TextContext {
  stdout: string;
  stderr: string;
  transcript: string;
}

export interface DiffContext {
  /** Full `git diff` text from pre- to post-run workspace state */
  diff: string;
  /** Changed file paths (relative to workspace root) parsed from the diff */
  changedFiles: string[];
}

/**
 * Extract the list of changed file paths from a unified git diff.
 * Handles `diff --git a/<path> b/<path>` headers; falls back to the 'b/' side.
 * Renames are treated as edits to the new name.
 */
export function parseChangedFiles(diffText: string): string[] {
  const out = new Set<string>();
  const lines = diffText.split('\n');
  for (const line of lines) {
    const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (m) {
      out.add(m[2]);
      continue;
    }
    const renameTo = line.match(/^rename to (.+)$/);
    if (renameTo) out.add(renameTo[1]);
  }
  return [...out].sort();
}

/**
 * Minimal glob matcher supporting `*`, `**`, `?` and literal paths.
 * Good enough for benchmark allow-lists; not a full glob implementation.
 */
export function matchGlob(path: string, pattern: string): boolean {
  const re = new RegExp(
    '^' +
      pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*\*/g, '§§')
        .replace(/\*/g, '[^/]*')
        .replace(/§§/g, '.*')
        .replace(/\?/g, '[^/]') +
      '$',
  );
  return re.test(path);
}

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some(p => matchGlob(path, p));
}

function ok(req: Requirement, detail?: string): RequirementResult {
  return {
    requirement_id: req.id,
    requirement_type: req.type,
    scoring: req.scoring,
    passed: true,
    detail,
  };
}

function fail(req: Requirement, detail: string): RequirementResult {
  return {
    requirement_id: req.id,
    requirement_type: req.type,
    scoring: req.scoring,
    passed: false,
    detail,
  };
}

function getText(req: Requirement, ctx: TextContext): string {
  const target = (req as { target?: 'stdout' | 'stderr' | 'transcript' }).target ?? 'stdout';
  if (target === 'stdout') return ctx.stdout;
  if (target === 'stderr') return ctx.stderr;
  return ctx.transcript;
}

export interface FileSystemProbe {
  exists(path: string): boolean;
  readFile(path: string): string | null;
}

/**
 * Evaluate a single requirement against pre-collected context.
 * Pure — all I/O is funneled through the FileSystemProbe callback so tests
 * can substitute fixtures.
 */
export function evaluateRequirement(
  req: Requirement,
  text: TextContext,
  diff: DiffContext,
  fs: FileSystemProbe,
): RequirementResult {
  switch (req.type) {
    case 'text_contains': {
      const body = getText(req, text);
      const needle = req.case_sensitive ? req.value : req.value.toLowerCase();
      const hay = req.case_sensitive ? body : body.toLowerCase();
      return hay.includes(needle)
        ? ok(req)
        : fail(req, `expected ${req.target ?? 'stdout'} to contain "${req.value}"`);
    }
    case 'text_absent': {
      const body = getText(req, text);
      const needle = req.case_sensitive ? req.value : req.value.toLowerCase();
      const hay = req.case_sensitive ? body : body.toLowerCase();
      return !hay.includes(needle)
        ? ok(req)
        : fail(req, `${req.target ?? 'stdout'} unexpectedly contains "${req.value}"`);
    }
    case 'text_matches': {
      const body = getText(req, text);
      const re = new RegExp(req.pattern, req.flags);
      return re.test(body)
        ? ok(req)
        : fail(req, `pattern /${req.pattern}/${req.flags} did not match ${req.target ?? 'stdout'}`);
    }
    case 'file_exists':
      return fs.exists(req.path) ? ok(req) : fail(req, `expected file at ${req.path}`);
    case 'file_absent':
      return !fs.exists(req.path) ? ok(req) : fail(req, `file ${req.path} should not exist`);
    case 'file_contains': {
      const body = fs.readFile(req.path);
      if (body === null) return fail(req, `file ${req.path} does not exist`);
      const needle = req.case_sensitive ? req.value : req.value.toLowerCase();
      const hay = req.case_sensitive ? body : body.toLowerCase();
      return hay.includes(needle)
        ? ok(req)
        : fail(req, `file ${req.path} does not contain "${req.value}"`);
    }
    case 'no_edit_outside': {
      const offenders = diff.changedFiles.filter(f => !matchesAny(f, req.allowed_globs));
      return offenders.length === 0
        ? ok(req, `${diff.changedFiles.length} changed file(s) all within allowed globs`)
        : fail(req, `out-of-scope edits: ${offenders.join(', ')}`);
    }
    case 'allowed_edit_globs': {
      const offenders = diff.changedFiles.filter(f => !matchesAny(f, req.globs));
      return offenders.length === 0
        ? ok(req, `${diff.changedFiles.length} changed file(s) all within allowed globs`)
        : fail(req, `edits outside allowed globs: ${offenders.join(', ')}`);
    }
    case 'workspace_diff_matches': {
      const re = new RegExp(req.pattern, req.flags);
      return re.test(diff.diff)
        ? ok(req)
        : fail(req, `pattern /${req.pattern}/${req.flags} did not match workspace diff`);
    }
    case 'workspace_diff_absent': {
      const re = new RegExp(req.pattern, req.flags);
      return !re.test(diff.diff)
        ? ok(req)
        : fail(req, `pattern /${req.pattern}/${req.flags} unexpectedly matched workspace diff`);
    }
    case 'llm_judge':
      return fail(req, 'llm_judge must be evaluated by the judge harness, not this helper');
  }
}
