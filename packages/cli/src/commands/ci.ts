import { Command } from 'commander';
import { resolve } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  loadConfig,
  saveKpiSnapshot,
} from '@staipler/core';
import type { KpiSnapshot } from '@staipler/core';

export const ciCommand = new Command('ci')
  .description('Check instruction stack against quality thresholds (for CI/CD)')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--min-score <n>', 'Minimum readiness score (overrides config)', parseInt)
  .option('--require <layers>', 'Required layers, comma-separated (overrides config)')
  .option('--json', 'Output results as JSON')
  .action(async (dir: string | undefined, opts: { minScore?: number; require?: string; json?: boolean }) => {
    let projectRoot: string;
    try {
      projectRoot = findProjectRoot(process.cwd());
    } catch {
      projectRoot = process.cwd();
    }

    const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;
    const { config } = loadConfig(projectRoot);

    const minScore = opts.minScore ?? config.minScore;
    const requiredLayers = opts.require
      ? opts.require.split(',').map(s => s.trim())
      : config.requiredLayers;

    // Scan and analyze
    const scanResult = scan(scanDir);
    const analysis = analyze(scanResult);

    // Check thresholds
    const failures: string[] = [];

    if (analysis.readinessScore < minScore) {
      failures.push(`Score ${analysis.readinessScore}/100 is below minimum ${minScore}`);
    }

    for (const required of requiredLayers) {
      const layer = analysis.layers.find(l => l.kind === required);
      if (!layer || layer.status === 'missing') {
        failures.push(`Required layer "${required}" is missing`);
      }
    }

    // Save snapshot
    const snapshot: KpiSnapshot = {
      timestamp: new Date().toISOString(),
      readinessScore: analysis.readinessScore,
      grade: analysis.grade,
      layerScores: Object.fromEntries(analysis.layers.map(l => [l.kind, l.qualityScore])),
      action: 'scan',
      notes: `CI check: ${failures.length === 0 ? 'PASS' : 'FAIL'}`,
    };

    try {
      saveKpiSnapshot(projectRoot, snapshot);
    } catch {
      // Non-fatal — CI environments may not have write access to .staipler/
    }

    if (opts.json) {
      console.log(JSON.stringify({
        pass: failures.length === 0,
        score: analysis.readinessScore,
        grade: analysis.grade,
        minScore,
        requiredLayers,
        failures,
        layers: Object.fromEntries(analysis.layers.map(l => [l.kind, { score: l.qualityScore, status: l.status }])),
      }, null, 2));
    } else {
      const pass = failures.length === 0;
      const icon = pass ? '\x1b[32m\u2713 PASS\x1b[0m' : '\x1b[31m\u2717 FAIL\x1b[0m';

      console.log(`\n  stAIpler CI  ${icon}\n`);
      console.log(`  Score:    ${analysis.readinessScore}/100 (${analysis.grade}) ${analysis.readinessScore >= minScore ? '' : `\x1b[31m< ${minScore} minimum\x1b[0m`}`);
      console.log(`  Files:    ${scanResult.files.length} instruction files found`);
      console.log(`  Layers:   ${analysis.layers.filter(l => l.status === 'present').length} present, ${analysis.layers.filter(l => l.status === 'weak').length} weak, ${analysis.layers.filter(l => l.status === 'missing').length} missing`);
      if (scanResult.memoryProvider) {
        console.log(`  Memory:   \x1b[32m${scanResult.memoryProvider.name}\x1b[0m (${scanResult.memoryProvider.detectedVia})`);
      }

      if (failures.length > 0) {
        console.log(`\n  \x1b[31mFailures:\x1b[0m`);
        for (const f of failures) {
          console.log(`    \u2717 ${f}`);
        }
        console.log(`\n  Fix with: \x1b[1mnpx staipler optimize\x1b[0m\n`);
      } else {
        console.log(`\n  All checks passed.\n`);
      }
    }

    process.exit(failures.length > 0 ? 1 : 0);
  });
