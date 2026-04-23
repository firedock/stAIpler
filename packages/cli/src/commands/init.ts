import { Command } from 'commander';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';
import { execSync } from 'child_process';
import {
  scan,
  analyze,
  loadConfig,
  DEFAULT_CONFIG,
  injectStatus,
  saveKpiSnapshot,
  generateInitReport,
} from '@staipler/core';
import type { KpiSnapshot, StaiplerConfig } from '@staipler/core';
import { uploadReport } from '../utils/upload-report.js';

const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];

function detectAgentFile(dir: string): string | null {
  for (const file of AGENT_FILES) {
    if (existsSync(resolve(dir, file))) return file;
  }
  return null;
}

function openInBrowser(filePath: string): void {
  try {
    const platform = process.platform;
    if (platform === 'darwin') {
      execSync(`open "${filePath}"`, { stdio: 'ignore' });
    } else if (platform === 'win32') {
      execSync(`start "" "${filePath}"`, { stdio: 'ignore' });
    } else {
      execSync(`xdg-open "${filePath}"`, { stdio: 'ignore' });
    }
  } catch {
    // Silently fail — URL is printed regardless
  }
}

export const initCommand = new Command('init')
  .description('Initialize stAIpler in your project — creates config, runs first scan, and injects agent status')
  .option('--inject <file>', 'Agent config file to inject status into (e.g., CLAUDE.md)')
  .option('--min-score <n>', 'Minimum score for CI checks', parseInt)
  .option('--yes', 'Skip prompts, use defaults')
  .option('--proof', 'Run quick proof after init')
  .option('--no-proof', 'Skip quick proof')
  .option('--no-open', 'Don\'t auto-open the report in browser')
  .option('--no-share', 'Don\'t upload the report to staipler.com (local only)')
  .action(async (opts: { inject?: string; minScore?: number; yes?: boolean; proof?: boolean; open?: boolean; share?: boolean }) => {
    const projectDir = process.cwd();
    const projectName = basename(projectDir);
    const configPath = resolve(projectDir, '.staipler.json');

    const purple = '\x1b[38;5;135m';
    const r = '\x1b[0m';
    const bold = '\x1b[1m';
    const dim = '\x1b[2m';

    console.log(`\n  ${purple}${bold}stAIpler init${r} — setting up ${projectName}\n`);

    // Step 1: Check for existing config
    const { config: loadedConfig, configPath: existingConfig } = loadConfig(projectDir);
    if (existingConfig && resolve(existingConfig) === configPath) {
      console.log(`  ${dim}Updating existing .staipler.json${r}`);
    }

    // Step 2: Run initial scan
    const scanResult = scan(projectDir);
    const analysis = analyze(scanResult);
    const score = analysis.readinessScore;
    const grade = analysis.grade;
    const present = analysis.layers.filter(l => l.status === 'present').length;
    const missing = analysis.layers.filter(l => l.status === 'missing').length;

    // Step 3: Detect or choose agent file for injection
    let injectTarget = opts.inject ?? null;
    if (!injectTarget) {
      const detected = detectAgentFile(projectDir);
      if (detected) {
        injectTarget = detected;
      }
    }

    // Step 4: Write .staipler.json
    const config: Partial<StaiplerConfig> & { $schema?: string } = {
      minScore: opts.minScore ?? DEFAULT_CONFIG.minScore,
      requiredLayers: DEFAULT_CONFIG.requiredLayers,
      inject: injectTarget,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

    // Step 5: Inject status into agent file
    if (injectTarget) {
      const targetPath = resolve(projectDir, injectTarget);
      injectStatus(targetPath, analysis, loadedConfig.continuity);
    }

    // Step 6: Save initial KPI snapshot
    try {
      const snapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: analysis.readinessScore,
        grade: analysis.grade,
        layerScores: Object.fromEntries(analysis.layers.map(l => [l.kind, l.qualityScore])),
        action: 'scan',
        notes: 'Initial scan via staipler init',
      };
      saveKpiSnapshot(projectDir, snapshot, projectName);
    } catch {
      // Non-fatal
    }

    // Step 7: Generate the HTML report
    const reportDir = resolve(projectDir, '.staipler');
    mkdirSync(reportDir, { recursive: true });
    const reportPath = resolve(reportDir, 'report.html');
    const html = generateInitReport({ projectName, analysis, scanResult, injectTarget });
    writeFileSync(reportPath, html);

    // ---- TERMINAL OUTPUT (minimal) ----
    const gc = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
    const barWidth = 30;
    const filled = Math.round((score / 100) * barWidth);
    const bar = `${gc}${'█'.repeat(filled)}${dim}${'░'.repeat(barWidth - filled)}${r}`;
    console.log(`  ${bar}  ${bold}${gc}${score}/100 (${grade})${r}  Empowerment Score`);
    console.log(`  ${dim}${scanResult.files.length} instruction files · ${present} layers present · ${missing} missing${r}\n`);

    // Try to upload the report to staipler.com for a public shareable URL
    let publicUrl: string | null = null;
    if (opts.share !== false) {
      const uploaded = await uploadReport({
        projectName,
        html,
        score,
        grade,
        presentLayers: present,
        missingLayers: missing,
      });
      if (uploaded) {
        publicUrl = uploaded.url;
      }
    }

    // Open the best-available report in the browser
    if (opts.open !== false) {
      openInBrowser(publicUrl ?? reportPath);
    }

    if (publicUrl) {
      console.log(`  ${purple}${bold}View & share your report:${r}`);
      console.log(`  ${bold}${publicUrl}${r}`);
      console.log(`  ${dim}Public, no login required · Expires in 30 days${r}\n`);
      console.log(`  ${dim}Local copy: file://${reportPath}${r}\n`);
    } else {
      console.log(`  ${purple}${bold}View your report:${r}`);
      console.log(`  ${dim}file://${reportPath}${r}\n`);
    }

    // Run quick proof only if explicitly requested with --proof
    if (opts.proof && process.stdin.isTTY) {
      const { runQuickProof } = await import('./quick-proof.js');
      await runQuickProof(analysis, scanResult, 'sonnet', projectDir);
    }
  });
