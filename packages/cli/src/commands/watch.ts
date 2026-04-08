import { Command } from 'commander';
import { watch as fsWatch, existsSync, statSync } from 'fs';
import { resolve, relative, join } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  loadConfig,
  saveKpiSnapshot,
  findInjectTarget,
  injectStatus,
} from '@staipler/core';
import type { AnalysisResult, KpiSnapshot, ScanResult } from '@staipler/core';

const LAYER_ORDER = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

const LAYER_HINTS: Record<string, string> = {
  constraints: 'Limits',
  context: 'Domain',
  evals: 'Tests',
  examples: 'Few-shot',
  goals: 'Priorities',
  identity: 'Persona',
  memory: 'Session',
  policies: 'Compliance',
  prompts: 'Fragments',
  skills: 'Workflows',
  style: 'Formatting',
  tools: 'Tool rules',
};

function renderBar(score: number, width: number = 20): string {
  const filled = Math.round((score / 100) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function gradeColor(grade: string): string {
  const colors: Record<string, string> = {
    A: '\x1b[32m', // green
    B: '\x1b[36m', // cyan
    C: '\x1b[33m', // yellow
    D: '\x1b[33m', // yellow
    F: '\x1b[31m', // red
  };
  return colors[grade] ?? '';
}

function statusIcon(status: string): string {
  if (status === 'present') return '\x1b[32m\u2713\x1b[0m';
  if (status === 'weak') return '\x1b[33m~\x1b[0m';
  return '\x1b[31m\u2717\x1b[0m';
}

function importanceLabel(imp: string): string {
  if (imp === 'critical') return '\x1b[31m!\x1b[0m';
  if (imp === 'recommended') return '\x1b[33m*\x1b[0m';
  return ' ';
}

function render(analysis: AnalysisResult, scanResult: ScanResult, projectRoot: string, lastChange: string | null, delta: number | null): void {
  const { readinessScore, grade, layers } = analysis;
  const reset = '\x1b[0m';
  const dim = '\x1b[2m';
  const bold = '\x1b[1m';
  const gc = gradeColor(grade);

  // Clear screen and move to top
  process.stdout.write('\x1b[2J\x1b[H');

  console.log(`  ${bold}stAIpler${reset} ${dim}v0.1.0${reset} ${dim}\u2014 watching ${relative(process.cwd(), projectRoot) || '.'}${reset}\n`);

  // Score hero
  const bar = renderBar(readinessScore);
  const deltaStr = delta !== null
    ? (delta > 0 ? `\x1b[32m \u25b2 +${delta}${reset}` : delta < 0 ? `\x1b[31m \u25bc ${delta}${reset}` : `${dim} \u2014${reset}`)
    : '';
  console.log(`  ${bold}Empowerment:${reset} ${gc}${readinessScore}/100 (${grade})${reset}  ${dim}${bar}${reset}${deltaStr}\n`);

  // Layer grid — 2 columns
  const present = layers.filter(l => l.status === 'present').length;
  const missing = layers.filter(l => l.status === 'missing').length;
  const weak = layers.filter(l => l.status === 'weak').length;

  console.log(`  ${dim}Layers: ${present} present, ${weak} weak, ${missing} missing${reset}\n`);

  const half = Math.ceil(LAYER_ORDER.length / 2);
  for (let i = 0; i < half; i++) {
    const left = layers.find(l => l.kind === LAYER_ORDER[i]);
    const right = i + half < LAYER_ORDER.length ? layers.find(l => l.kind === LAYER_ORDER[i + half]) : null;

    const leftHint = left ? `${dim}${LAYER_HINTS[left.kind] ?? ''}${reset}` : '';
    const leftStr = left
      ? `  ${statusIcon(left.status)} ${importanceLabel(left.importance)} ${left.kind.padEnd(12)} ${String(left.qualityScore).padStart(3)}/100  ${leftHint}`
      : '';
    const rightHint = right ? `${dim}${LAYER_HINTS[right.kind] ?? ''}${reset}` : '';
    const rightStr = right
      ? `  ${statusIcon(right.status)} ${importanceLabel(right.importance)} ${right.kind.padEnd(12)} ${String(right.qualityScore).padStart(3)}/100  ${rightHint}`
      : '';

    console.log(`${leftStr.padEnd(45)}${rightStr}`);
  }

  console.log('');

  // Critical issues
  if (analysis.criticalIssues.length > 0) {
    console.log(`  \x1b[31m${bold}Critical:${reset}`);
    for (const issue of analysis.criticalIssues.slice(0, 3)) {
      console.log(`  ${dim}\u2022${reset} ${issue.split(' \u2014 ')[0]}`);
    }
    console.log('');
  }

  // Knowledge base summary
  const kb = scanResult.knowledgeBase;
  if (kb.length > 0) {
    const totalKbSize = kb.reduce((s, f) => s + f.size, 0);
    console.log(`  ${dim}Knowledge base: ${kb.length} files (${(totalKbSize / 1024).toFixed(1)}K)${reset}`);
  }
  console.log('');

  // Last change
  if (lastChange) {
    console.log(`  ${dim}Last change: ${lastChange}${reset}`);
  }
  console.log(`  ${dim}Press ${bold}o${reset}${dim} optimize \u00b7 ${bold}i${reset}${dim} inject \u00b7 ${bold}q${reset}${dim} quit${reset}`);
}

export const watchCommand = new Command('watch')
  .description('Watch instruction files and show live empowerment score')
  .argument('[dir]', 'Directory to watch (default: current directory)')
  .option('--inject', 'Auto-inject status into agent config file on every change')
  .option('--no-clear', 'Don\'t clear the screen between updates')
  .action(async (dir: string | undefined, opts: { inject?: boolean; clear?: boolean }) => {
    let projectRoot: string;
    try {
      projectRoot = findProjectRoot(process.cwd());
    } catch {
      // No project root — use cwd
      projectRoot = process.cwd();
    }

    const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;
    const { config } = loadConfig(projectRoot);

    let prevScore: number | null = null;
    let lastChange: string | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    function runScan() {
      try {
        const scanResult = scan(scanDir);
        const analysis = analyze(scanResult);
        const delta = prevScore !== null ? analysis.readinessScore - prevScore : null;

        render(analysis, scanResult, projectRoot, lastChange, delta);
        prevScore = analysis.readinessScore;

        // Auto-inject if enabled
        if (opts.inject || config.inject) {
          const target = findInjectTarget(projectRoot, config.inject);
          if (target) {
            injectStatus(target, analysis);
          }
        }
      } catch (err) {
        console.error(`  Scan error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    function debouncedScan(trigger?: string) {
      lastChange = trigger ?? null;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(runScan, config.watchDebounce);
    }

    // Initial scan
    runScan();

    // Watch for file changes recursively
    const watchers: ReturnType<typeof fsWatch>[] = [];

    function watchDir(watchPath: string) {
      if (!existsSync(watchPath)) return;
      try {
        const watcher = fsWatch(watchPath, { recursive: true }, (eventType, filename) => {
          if (!filename) return;
          const lower = filename.toLowerCase();
          // Only re-scan on instruction file changes
          if (
            lower.endsWith('.md') ||
            lower.endsWith('.mdc') ||
            lower.includes('cursorrules') ||
            lower.includes('windsurfrules') ||
            lower.includes('clinerules') ||
            lower.includes('.staipler.json')
          ) {
            debouncedScan(`${eventType}: ${filename}`);
          }
        });
        watchers.push(watcher);
      } catch {
        // Can't watch this dir
      }
    }

    watchDir(scanDir);

    // Keyboard input
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf-8');

      process.stdin.on('data', async (key: string) => {
        if (key === 'q' || key === '\x03') {
          // q or Ctrl+C
          for (const w of watchers) w.close();
          process.stdin.setRawMode(false);
          console.log('\n');
          process.exit(0);
        }
        if (key === 'o') {
          // Trigger optimize
          process.stdout.write('\x1b[2J\x1b[H');
          console.log('\n  Optimizing with AI... (this may take a minute)\n');
          try {
            const { optimize: runOptimize, createPlan } = await import('@staipler/core');
            const scanResult = scan(scanDir);
            const analysis = analyze(scanResult);
            const plan = createPlan(analysis);

            if (plan.generate.length === 0 && plan.improve.length === 0) {
              console.log('  Nothing to optimize — stack looks good!');
              setTimeout(runScan, 2000);
              return;
            }

            const result = await runOptimize(analysis, 'sonnet', (msg) => {
              console.log(`    ${msg}`);
            });

            // Write assets
            const { writeFileSync, mkdirSync } = await import('fs');
            const { resolve: resolvePath } = await import('path');
            const outDir = resolvePath(projectRoot, 'library/optimized');
            mkdirSync(outDir, { recursive: true });
            for (const asset of result.assets) {
              writeFileSync(resolvePath(outDir, `${asset.kind}.md`), asset.content);
            }

            console.log(`\n  Done! ${result.beforeScore} → ${result.afterScore}`);
            setTimeout(runScan, 2000);
          } catch (err) {
            console.error(`  Optimize failed: ${err instanceof Error ? err.message : String(err)}`);
            setTimeout(runScan, 3000);
          }
        }
        if (key === 'i') {
          // Inject status
          const scanResult = scan(scanDir);
          const analysis = analyze(scanResult);
          const target = findInjectTarget(projectRoot, config.inject);
          if (target) {
            const result = injectStatus(target, analysis);
            lastChange = `Injected status into ${relative(projectRoot, target)}`;
            setTimeout(runScan, 500);
          } else {
            lastChange = 'No agent file found (create CLAUDE.md or set "inject" in .staipler.json)';
            setTimeout(runScan, 500);
          }
        }
        if (key === 'r') {
          // Force re-scan
          debouncedScan('Manual rescan');
        }
      });
    }

    // Keep alive
    const keepAlive = setInterval(() => {}, 60_000);
    process.on('SIGINT', () => {
      clearInterval(keepAlive);
      for (const w of watchers) w.close();
      process.exit(0);
    });
  });
