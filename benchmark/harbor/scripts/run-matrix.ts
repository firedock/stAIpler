#!/usr/bin/env node
/**
 * Paired-run benchmark orchestrator.
 *
 * Every stage emits structured visibility events so the CLI, JSONL log, and
 * dashboard all see the same pipeline in real time. See
 * `packages/core/src/events/bus.ts`.
 */
import { spawnSync, execFileSync } from 'child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { dirname, join, resolve } from 'path';
import { createHash } from 'crypto';
import {
  BENCHMARK_READY_BUNDLE_CONTRACT_VERSION,
  EventBus,
  consoleSink,
  evaluateRequirement,
  generateRunJson,
  generateSummaryMd,
  generateDiffMd,
  jsonlFileSink,
  loadActiveBundle,
  loadDataset,
  parseChangedFiles,
  memorySink,
} from '@staipler/core';
import type {
  BenchmarkMode,
  BenchmarkTask,
  FileSystemProbe,
  Requirement,
  RequirementResult,
  RunMeta,
  TaskRunResult,
} from '@staipler/core';
import {
  ADAPTER_VERSION,
  compileClaudeCode,
  materialize,
} from '@staipler/adapter-claude-code';
import type { ClaudeCodeArtifacts } from '@staipler/adapter-claude-code';

interface RunOptions {
  repoRoot: string;
  datasetDir: string;
  outDir: string;
  modes: BenchmarkMode[];
  model: string;
  claudeBin: string;
  timeoutSeconds: number;
  envAllowlist: string[];
  networkPolicy: 'none' | 'allowlist';
  networkAllowlist: string[];
  allowDirty: boolean;
  limit?: number;
  quiet: boolean;
}

function parseArgs(argv: string[]): RunOptions {
  const get = (flag: string, fallback?: string): string | undefined => {
    const idx = argv.indexOf(flag);
    if (idx >= 0 && idx + 1 < argv.length) return argv[idx + 1];
    return fallback;
  };
  const modeArg = get('--mode', 'both');
  const modes: BenchmarkMode[] =
    modeArg === 'baseline' ? ['baseline']
    : modeArg === 'staipler' ? ['staipler']
    : ['baseline', 'staipler'];
  return {
    repoRoot: resolve(get('--repo', process.cwd())!),
    datasetDir: resolve(get('--dataset', 'benchmark/harbor/datasets/staipler-core')!),
    outDir: resolve(get('--out', 'benchmark/runs')!),
    modes,
    model: get('--model', 'sonnet')!,
    claudeBin: process.env.STAIPLER_CLAUDE_BIN ?? get('--claude-bin', 'claude')!,
    timeoutSeconds: parseInt(get('--timeout', '180')!, 10),
    envAllowlist: (get('--env-allowlist', 'PATH,HOME,USER') ?? '').split(',').filter(Boolean),
    networkPolicy: (get('--network', 'none') as 'none' | 'allowlist') ?? 'none',
    networkAllowlist: (get('--network-allowlist', '') ?? '').split(',').filter(Boolean),
    allowDirty: argv.includes('--allow-dirty'),
    limit: get('--limit') ? parseInt(get('--limit')!, 10) : undefined,
    quiet: argv.includes('--quiet'),
  };
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function safeExec(cmd: string, args: string[], cwd?: string): string {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch {
    return '';
  }
}

function ensureRepoClean(repoRoot: string, allowDirty: boolean, bus: EventBus): void {
  const status = safeExec('git', ['status', '--porcelain'], repoRoot);
  if (status.length > 0 && !allowDirty) {
    throw new Error(
      'Repo has uncommitted changes. Pass --allow-dirty to run snapshot tasks anyway (will be recorded in the manifest).',
    );
  }
  if (status.length > 0 && allowDirty) {
    bus.emit({ stage: 'warning', kind: 'dirty-repo', message: 'running with --allow-dirty; results are not fully reproducible', detail: status.split('\n').length + ' changed path(s)' });
  }
}

function gitCommit(repoRoot: string): string {
  return safeExec('git', ['rev-parse', 'HEAD'], repoRoot) || 'unknown';
}

function claudeVersion(claudeBin: string): string {
  return safeExec(claudeBin, ['--version']) || 'unknown';
}

function buildTaskSetHash(tasks: BenchmarkTask[]): string {
  return sha256(tasks.map(t => t.id).sort().join('\n'));
}

function filteredEnv(allowlist: string[]): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of allowlist) {
    if (process.env[key] !== undefined) out[key] = process.env[key];
  }
  return out;
}

function initWorkspaceGit(workspace: string): string {
  execFileSync('git', ['init', '-q'], { cwd: workspace, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'bench@staipler.local'], { cwd: workspace });
  execFileSync('git', ['config', 'user.name', 'staipler-bench'], { cwd: workspace });
  execFileSync('git', ['add', '-A'], { cwd: workspace, stdio: 'ignore' });
  execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'pre-run'], { cwd: workspace, stdio: 'ignore' });
  return safeExec('git', ['rev-parse', 'HEAD'], workspace);
}

function writeTaskFiles(task: BenchmarkTask, workspace: string, fixtureBase: string): void {
  if (existsSync(fixtureBase)) {
    cpSync(fixtureBase, workspace, { recursive: true });
  } else {
    mkdirSync(workspace, { recursive: true });
  }
  for (const file of task.input.files ?? []) {
    const full = join(workspace, file.path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, file.content);
  }
}

function provisionWorkspace(
  task: BenchmarkTask,
  repoRoot: string,
  fixtureBase: string,
): { workspace: string; cleanup: () => void } {
  if (task.workspace_source === 'current_repo_snapshot') {
    const tmp = mkdtempSync(join(tmpdir(), `staipler-bench-snap-${task.id}-`));
    execFileSync('git', ['worktree', 'add', '--detach', tmp], { cwd: repoRoot, stdio: 'ignore' });
    for (const file of task.input.files ?? []) {
      const full = join(tmp, file.path);
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, file.content);
    }
    return {
      workspace: tmp,
      cleanup: () => {
        try {
          execFileSync('git', ['worktree', 'remove', '--force', tmp], { cwd: repoRoot, stdio: 'ignore' });
        } catch {}
        try { rmSync(tmp, { recursive: true, force: true }); } catch {}
      },
    };
  }
  const tmp = mkdtempSync(join(tmpdir(), `staipler-bench-fix-${task.id}-`));
  writeTaskFiles(task, tmp, fixtureBase);
  return {
    workspace: tmp,
    cleanup: () => { try { rmSync(tmp, { recursive: true, force: true }); } catch {} },
  };
}

function runClaude(
  claudeBin: string,
  model: string,
  prompt: string,
  cwd: string,
  timeoutSeconds: number,
  env: NodeJS.ProcessEnv,
): { stdout: string; stderr: string; exitCode: number | null; elapsedMs: number; timedOut: boolean } {
  const start = Date.now();
  // `--permission-mode bypassPermissions` is required for agentic behavior in
  // ephemeral benchmark workspaces: without it, `claude -p` runs tools but the
  // permission layer blocks edits since stdin has no interactive approver, so
  // every task trivially fails with zero workspace changes. The workspaces
  // are throwaway temp dirs / worktrees, so bypass is safe here.
  const res = spawnSync(
    claudeBin,
    ['-p', '--model', model, '--permission-mode', 'bypassPermissions'],
    {
      cwd,
      input: prompt,
      env,
      timeout: timeoutSeconds * 1000,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    },
  );
  const elapsedMs = Date.now() - start;
  return {
    stdout: res.stdout ?? '',
    stderr: res.stderr ?? '',
    exitCode: res.status,
    elapsedMs,
    timedOut: res.error?.message?.includes('timed out') ?? (res.signal === 'SIGTERM'),
  };
}

function workspaceDiffAfter(workspace: string): string {
  safeExec('git', ['add', '-A'], workspace);
  return safeExec('git', ['diff', '--cached'], workspace);
}

function makeFsProbe(workspace: string): FileSystemProbe {
  return {
    exists: p => existsSync(join(workspace, p)),
    readFile: p => {
      try { return readFileSync(join(workspace, p), 'utf-8'); } catch { return null; }
    },
  };
}

function runTask(
  task: BenchmarkTask,
  mode: BenchmarkMode,
  opts: RunOptions,
  artifacts: ClaudeCodeArtifacts | null,
  outBase: string,
  bus: EventBus,
): TaskRunResult {
  const taskOut = join(outBase, 'tasks', task.id);
  mkdirSync(taskOut, { recursive: true });
  const artifactPaths = {
    transcript_path: join(taskOut, 'transcript.txt'),
    stdout_path: join(taskOut, 'stdout.txt'),
    stderr_path: join(taskOut, 'stderr.txt'),
    workspace_diff_path: join(taskOut, 'workspace.diff'),
  };

  bus.emit({
    stage: 'task',
    kind: 'start',
    task_id: task.id,
    mode,
    category: task.category,
    workspace_source: task.workspace_source,
  });

  const fixtureBase = resolve(opts.repoRoot, 'benchmark/harbor/fixtures/base-repo');
  const { workspace, cleanup } = provisionWorkspace(task, opts.repoRoot, fixtureBase);
  bus.emit({
    stage: 'task',
    kind: 'provision',
    task_id: task.id,
    mode,
    workspace_path: workspace,
  });

  try {
    initWorkspaceGit(workspace);

    if (mode === 'staipler' && artifacts) {
      materialize(artifacts, workspace, { writeReleaseManifest: false });
      execFileSync('git', ['add', '-A'], { cwd: workspace, stdio: 'ignore' });
      execFileSync('git', ['commit', '-q', '--allow-empty', '-m', 'staipler artifacts'], {
        cwd: workspace,
        stdio: 'ignore',
      });
      bus.emit({ stage: 'task', kind: 'materialize-artifacts', task_id: task.id, mode });
    }

    const env = filteredEnv(opts.envAllowlist);
    bus.emit({ stage: 'task', kind: 'spawn', task_id: task.id, mode });
    const run = runClaude(opts.claudeBin, opts.model, task.input.prompt, workspace, task.timeout_seconds, env);
    bus.emit({
      stage: 'task',
      kind: 'spawn-done',
      task_id: task.id,
      mode,
      exit_code: run.exitCode,
      elapsed_task_ms: run.elapsedMs,
    });

    writeFileSync(artifactPaths.stdout_path, run.stdout);
    writeFileSync(artifactPaths.stderr_path, run.stderr);
    writeFileSync(
      artifactPaths.transcript_path,
      `=== stdout ===\n${run.stdout}\n\n=== stderr ===\n${run.stderr}\n`,
    );

    const diffText = workspaceDiffAfter(workspace);
    writeFileSync(artifactPaths.workspace_diff_path, diffText);

    const textCtx = { stdout: run.stdout, stderr: run.stderr, transcript: `${run.stdout}\n${run.stderr}` };
    const diffCtx = { diff: diffText, changedFiles: parseChangedFiles(diffText) };
    const probe = makeFsProbe(workspace);

    bus.emit({
      stage: 'task',
      kind: 'evaluate',
      task_id: task.id,
      mode,
      detail: `${task.requirements.length} requirement(s)`,
    });

    const requirement_results: RequirementResult[] = task.requirements.map((req: Requirement) => {
      const r = evaluateRequirement(req, textCtx, diffCtx, probe);
      bus.emit({
        stage: 'requirement',
        kind: 'evaluated',
        task_id: task.id,
        mode,
        requirement_id: r.requirement_id,
        requirement_type: r.requirement_type,
        scoring: r.scoring,
        passed: r.passed,
        detail: r.detail,
      });
      return r;
    });

    const deterministic = requirement_results.filter(r => r.scoring === 'deterministic');
    const judge = requirement_results.filter(r => r.scoring === 'judge_assisted');
    const deterministic_pass = deterministic.length === 0 ? true : deterministic.every(r => r.passed);
    const judge_assisted_pass = judge.length === 0 ? null : judge.every(r => r.passed);

    let failure_category: TaskRunResult['failure_category'] = null;
    if (run.timedOut) failure_category = 'timeout';
    else if (run.exitCode !== 0 && run.exitCode !== null) failure_category = 'tool-error';

    const pass = failure_category === null && deterministic_pass && judge_assisted_pass !== false;

    const result: TaskRunResult = {
      task_id: task.id,
      category: task.category,
      mode,
      pass,
      deterministic_pass,
      judge_assisted_pass,
      elapsed_ms: run.elapsedMs,
      exit_code: run.exitCode,
      token_usage: null,
      cost_usd: null,
      failure_category,
      requirement_results,
      artifacts: artifactPaths,
    };

    bus.emit({
      stage: 'task',
      kind: 'done',
      task_id: task.id,
      mode,
      category: task.category,
      pass,
      deterministic_pass,
      judge_assisted_pass,
      failure_category,
      elapsed_task_ms: run.elapsedMs,
    });

    return result;
  } finally {
    cleanup();
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const started_at = new Date().toISOString();
  const bus = new EventBus();
  if (!opts.quiet) bus.addSink(consoleSink());
  // Buffer events emitted before we know the output directory (e.g. compile
  // events), then flush them into events.jsonl once the release_id is known.
  const { events: bufferedEvents, sink: bufferSink } = memorySink();
  bus.addSink(bufferSink);

  ensureRepoClean(opts.repoRoot, opts.allowDirty, bus);
  const git_commit = gitCommit(opts.repoRoot);
  const runner_commit = git_commit;

  const { bundle, ready } = loadActiveBundle(opts.repoRoot, bus);
  const artifacts = compileClaudeCode(ready, { gitCommit: git_commit, bus });
  const release_id = artifacts.manifest.release_id;
  const releaseDir = join(opts.repoRoot, '.staipler/releases');
  mkdirSync(releaseDir, { recursive: true });
  const releaseManifestPath = join(releaseDir, `${release_id}.json`);
  writeFileSync(releaseManifestPath, JSON.stringify(artifacts.manifest, null, 2));
  bus.emit({
    stage: 'release',
    kind: 'persisted',
    release_id,
    bundle_hash: bundle.hash,
    path: releaseManifestPath,
  });

  const tasks = loadDataset(opts.datasetDir).slice(0, opts.limit);
  const task_set_hash = buildTaskSetHash(tasks);
  const cliVer = claudeVersion(opts.claudeBin);

  const outRoot = join(opts.outDir, release_id);
  mkdirSync(outRoot, { recursive: true });

  // Flush the buffered compile events (scan/analyze/bundle/render/release/etc.)
  // into events.jsonl so the stream is complete from moment zero.
  const jsonlPath = join(outRoot, 'events.jsonl');
  const fileSink = jsonlFileSink(jsonlPath);
  for (const ev of bufferedEvents) fileSink(ev);
  bus.addSink(fileSink);

  bus.emit({ stage: 'run', kind: 'start', release_id, task_count: tasks.length });

  const reports: Record<BenchmarkMode, ReturnType<typeof generateRunJson> | null> = {
    baseline: null,
    staipler: null,
  };

  for (const mode of opts.modes) {
    bus.emit({ stage: 'run', kind: 'mode-start', mode, task_count: tasks.length });
    const modeDir = join(outRoot, mode);
    mkdirSync(modeDir, { recursive: true });
    const results: TaskRunResult[] = [];
    for (const task of tasks) {
      const result = runTask(task, mode, opts, mode === 'staipler' ? artifacts : null, modeDir, bus);
      results.push(result);
    }
    const finished_at = new Date().toISOString();
    const meta: RunMeta = {
      release_id,
      bundle_hash: bundle.hash,
      adapter_version: ADAPTER_VERSION,
      core_contract_version: BENCHMARK_READY_BUNDLE_CONTRACT_VERSION,
      git_commit,
      benchmark_runner_git_commit: runner_commit,
      claude_cli_version: cliVer,
      node_version: process.version,
      platform: `${process.platform}-${process.arch}`,
      model: opts.model,
      mode,
      timeout_seconds: opts.timeoutSeconds,
      timeout_policy: 'kill-on-timeout',
      env_allowlist: opts.envAllowlist,
      network_policy: opts.networkPolicy,
      network_allowlist: opts.networkAllowlist,
      allow_dirty: opts.allowDirty,
      started_at,
      finished_at,
      total_elapsed_ms: results.reduce((s, r) => s + r.elapsed_ms, 0),
      task_set_hash,
    };
    const report = generateRunJson(results, meta, {
      provenance: artifacts.manifest.provenance,
      conflicts: artifacts.manifest.conflicts,
      gaps: artifacts.manifest.gaps,
      skill_sources: artifacts.manifest.skill_sources,
      coverage: artifacts.manifest.coverage,
    });
    reports[mode] = report;
    writeFileSync(join(modeDir, 'run.json'), JSON.stringify(report, null, 2));
    writeFileSync(join(modeDir, 'summary.md'), generateSummaryMd(report));
    bus.emit({
      stage: 'run',
      kind: 'mode-done',
      mode,
      task_count: tasks.length,
      pass_rate: report.pass_rates.overall.rate,
      deterministic_pass_rate: report.pass_rates.deterministic.rate,
      judge_assisted_pass_rate: report.pass_rates.judge_assisted.total === 0 ? null : report.pass_rates.judge_assisted.rate,
      elapsed_total_ms: meta.total_elapsed_ms,
    });
  }

  if (reports.baseline && reports.staipler) {
    writeFileSync(join(outRoot, 'diff.md'), generateDiffMd(reports.baseline, reports.staipler));
  }

  bus.emit({ stage: 'run', kind: 'done', release_id });
  if (!opts.quiet) {
    process.stdout.write(`\nRun artifacts: ${outRoot}\n`);
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
