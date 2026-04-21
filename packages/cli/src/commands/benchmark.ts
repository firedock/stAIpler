import { Command } from 'commander';
import { spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { generateDiffMd, generateSummaryMd } from '@staipler/core';
import type { RunReport } from '@staipler/core';

/**
 * Find the monorepo root by walking upward from the built CLI's location
 * looking for `pnpm-workspace.yaml`. Falls back to cwd. The naive "go up N
 * directories" approach breaks after tsup bundles dist/commands into
 * dist/index.js, so we locate the workspace robustly instead.
 */
function findRepoRoot(): string {
  const start = fileURLToPath(new URL('.', import.meta.url));
  let current = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, 'pnpm-workspace.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

const repoRoot = findRepoRoot();
const runMatrixScript = resolve(repoRoot, 'benchmark/harbor/scripts/run-matrix.ts');

function runScript(args: string[]): Promise<number> {
  return new Promise(resolvePromise => {
    const child = spawn('pnpm', ['exec', 'tsx', runMatrixScript, ...args], {
      stdio: 'inherit',
      cwd: repoRoot,
    });
    child.on('exit', code => resolvePromise(code ?? 1));
  });
}

const runCmd = new Command('run')
  .description('Run the paired benchmark matrix (baseline + staipler)')
  .option('--mode <mode>', 'baseline | staipler | both', 'both')
  .option('--dataset <path>', 'dataset directory', 'benchmark/harbor/datasets/staipler-core')
  .option('--out <path>', 'output directory', 'benchmark/runs')
  .option('--model <name>', 'Claude model', 'sonnet')
  .option('--timeout <seconds>', 'per-task timeout', '180')
  .option('--env-allowlist <csv>', 'env vars forwarded to the subprocess', 'PATH,HOME,USER')
  .option('--network <policy>', 'none | allowlist', 'none')
  .option('--network-allowlist <csv>', 'allowed hosts when --network=allowlist', '')
  .option('--allow-dirty', 'allow running snapshot tasks with a dirty working tree')
  .option('--limit <n>', 'only run the first N tasks')
  .action(async opts => {
    const args = [
      '--mode', opts.mode,
      '--dataset', opts.dataset,
      '--out', opts.out,
      '--model', opts.model,
      '--timeout', opts.timeout,
      '--env-allowlist', opts.envAllowlist,
      '--network', opts.network,
      '--network-allowlist', opts.networkAllowlist,
    ];
    if (opts.allowDirty) args.push('--allow-dirty');
    if (opts.limit) args.push('--limit', opts.limit);
    const code = await runScript(args);
    process.exit(code);
  });

const summarizeCmd = new Command('summarize')
  .description('Regenerate summary.md from a run.json')
  .argument('<runDir>', 'directory containing run.json')
  .action((runDir: string) => {
    const report = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf-8')) as RunReport;
    writeFileSync(join(runDir, 'summary.md'), generateSummaryMd(report));
    console.log(`Wrote ${join(runDir, 'summary.md')}`);
  });

const diffCmd = new Command('diff')
  .description('Generate diff.md from a baseline and a staipler run')
  .argument('<baselineRunDir>', 'directory with baseline run.json')
  .argument('<staiplerRunDir>', 'directory with staipler run.json')
  .option('--out <path>', 'output file (defaults to <baseline>/../diff.md)')
  .action((baselineDir: string, staiplerDir: string, opts: { out?: string }) => {
    const baseline = JSON.parse(readFileSync(join(baselineDir, 'run.json'), 'utf-8')) as RunReport;
    const staipler = JSON.parse(readFileSync(join(staiplerDir, 'run.json'), 'utf-8')) as RunReport;
    const outPath = opts.out ? resolve(opts.out) : resolve(baselineDir, '..', 'diff.md');
    writeFileSync(outPath, generateDiffMd(baseline, staipler));
    console.log(`Wrote ${outPath}`);
  });

export const benchmarkCommand = new Command('benchmark')
  .description('Paired baseline/staipler benchmark runner')
  .addCommand(runCmd)
  .addCommand(summarizeCmd)
  .addCommand(diffCmd);
