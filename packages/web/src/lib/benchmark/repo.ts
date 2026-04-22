import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, resolve, dirname } from 'path';

/**
 * Walk upward from the web package until we find the monorepo root
 * (identified by pnpm-workspace.yaml). Cached per process.
 *
 * The dashboard reads benchmark artifacts from the filesystem on purpose —
 * the #1 rule of this codebase is total visibility: releases, runs, and
 * events must be browsable without a database round-trip.
 */
let cachedWalk: string | null = null;

/**
 * A pnpm-workspace.yaml can legitimately appear inside packages (to override
 * builtDeps flags, etc.), so we can't use it alone as the repo-root sentinel.
 * The monorepo root is uniquely identified by having BOTH pnpm-workspace.yaml
 * AND the benchmark/harbor directory.
 */
function isRepoRoot(dir: string): boolean {
  return (
    existsSync(join(dir, 'pnpm-workspace.yaml')) &&
    existsSync(join(dir, 'benchmark', 'harbor'))
  );
}

export function repoRoot(): string {
  const override = process.env.STAIPLER_REPO_ROOT;
  if (override) return resolve(override);
  if (cachedWalk) return cachedWalk;
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (isRepoRoot(current)) {
      cachedWalk = current;
      return cachedWalk;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  cachedWalk = process.cwd();
  return cachedWalk;
}

export function resetRepoRootCacheForTests(): void {
  cachedWalk = null;
}

export interface ReleaseSummary {
  release_id: string;
  bundle_hash: string;
  adapter_version: string;
  core_contract_version: number;
  git_commit: string;
  built_at: string;
  determinism_hash: string;
  coverage: { present: string[]; weak: string[]; missing: string[]; readinessScore: number; grade: string };
  gaps: string[];
  conflicts: Array<{ description: string; resolution: string; resolvedBy: string }>;
  skill_sources: Array<{ slug: string; path: string; sources: Array<{ sourceTitle: string; provider: string }> }>;
  provenance: Array<{ layer: string; status: string; sources: Array<{ sourceTitle: string; provider: string }> }>;
}

export interface RunSummary {
  release_id: string;
  mode: 'baseline' | 'staipler';
  model: string;
  started_at: string;
  finished_at: string;
  pass_rates: {
    deterministic: { passed: number; total: number; rate: number };
    judge_assisted: { passed: number; total: number; rate: number };
    overall: { passed: number; total: number; rate: number };
  };
  task_set_hash: string;
  results: Array<{
    task_id: string;
    category: string;
    pass: boolean;
    deterministic_pass: boolean;
    judge_assisted_pass: boolean | null;
    elapsed_ms: number;
    failure_category: string | null;
  }>;
}

export interface TaskArtifacts {
  stdout: string;
  stderr: string;
  workspace_diff: string;
  transcript: string;
  requirements: Array<{
    requirement_id: string;
    requirement_type: string;
    scoring: 'deterministic' | 'judge_assisted';
    passed: boolean;
    detail?: string;
  }>;
}

export function listReleases(): ReleaseSummary[] {
  const dir = join(repoRoot(), '.staipler', 'releases');
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return files.map(({ f }) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as ReleaseSummary);
}

export function readRelease(releaseId: string): ReleaseSummary | null {
  const path = join(repoRoot(), '.staipler', 'releases', `${releaseId}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf-8')) as ReleaseSummary;
}

export function listRunsForRelease(releaseId: string): RunSummary[] {
  const dir = join(repoRoot(), 'benchmark', 'runs', releaseId);
  if (!existsSync(dir)) return [];
  const out: RunSummary[] = [];
  for (const mode of ['baseline', 'staipler'] as const) {
    const runPath = join(dir, mode, 'run.json');
    if (!existsSync(runPath)) continue;
    const json = JSON.parse(readFileSync(runPath, 'utf-8'));
    out.push({
      release_id: releaseId,
      mode,
      model: json.meta.model,
      started_at: json.meta.started_at,
      finished_at: json.meta.finished_at,
      pass_rates: json.pass_rates,
      task_set_hash: json.meta.task_set_hash,
      results: json.results.map((r: {
        task_id: string;
        category: string;
        pass: boolean;
        deterministic_pass: boolean;
        judge_assisted_pass: boolean | null;
        elapsed_ms: number;
        failure_category: string | null;
      }) => ({
        task_id: r.task_id,
        category: r.category,
        pass: r.pass,
        deterministic_pass: r.deterministic_pass,
        judge_assisted_pass: r.judge_assisted_pass,
        elapsed_ms: r.elapsed_ms,
        failure_category: r.failure_category,
      })),
    });
  }
  return out;
}

export function readTaskArtifacts(
  releaseId: string,
  mode: 'baseline' | 'staipler',
  taskId: string,
): TaskArtifacts | null {
  const base = join(repoRoot(), 'benchmark', 'runs', releaseId, mode, 'tasks', taskId);
  if (!existsSync(base)) return null;
  const runPath = join(repoRoot(), 'benchmark', 'runs', releaseId, mode, 'run.json');
  let requirements: TaskArtifacts['requirements'] = [];
  if (existsSync(runPath)) {
    const run = JSON.parse(readFileSync(runPath, 'utf-8'));
    const result = (run.results as Array<{ task_id: string; requirement_results: TaskArtifacts['requirements'] }>)
      .find(r => r.task_id === taskId);
    if (result) requirements = result.requirement_results;
  }
  const readOrEmpty = (name: string) => {
    const p = join(base, name);
    return existsSync(p) ? readFileSync(p, 'utf-8') : '';
  };
  return {
    stdout: readOrEmpty('stdout.txt'),
    stderr: readOrEmpty('stderr.txt'),
    workspace_diff: readOrEmpty('workspace.diff'),
    transcript: readOrEmpty('transcript.txt'),
    requirements,
  };
}

export function readRunEvents(releaseId: string): string {
  const path = join(repoRoot(), 'benchmark', 'runs', releaseId, 'events.jsonl');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}
