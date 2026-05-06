import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, basename } from 'path';
import { execSync } from 'child_process';
import { createInterface } from 'readline';
import {
  scan,
  analyze,
  loadConfig,
  DEFAULT_CONFIG,
  injectStatus,
  saveKpiSnapshot,
  generateInitReport,
} from '@staipler/core';
import type { KpiSnapshot } from '@staipler/core';
import { uploadReport } from '../utils/upload-report.js';

const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];

function detectAgentFile(dir: string): string | null {
  for (const file of AGENT_FILES) {
    if (existsSync(resolve(dir, file))) return file;
  }
  return null;
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const a = answer.trim().toLowerCase();
      resolve(a === 'y' || a === 'yes');
    });
  });
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
  .option('--reset', 'Reset .staipler.json to defaults — discards any customizations')
  .option('--proof', 'Run quick proof after init')
  .option('--no-proof', 'Skip quick proof')
  .option('--no-open', 'Don\'t auto-open the report in browser')
  .option('--no-share', 'Don\'t upload the report to staipler.com (local only)')
  .action(async (opts: { inject?: string; minScore?: number; yes?: boolean; reset?: boolean; proof?: boolean; open?: boolean; share?: boolean }) => {
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
    const hasExistingConfig = existingConfig !== null && resolve(existingConfig) === configPath;

    // Confirm destructive --reset before clobbering an existing config
    if (hasExistingConfig && opts.reset && !opts.yes && process.stdin.isTTY) {
      const ok = await confirm(
        `  ${dim}Reset will overwrite ${configPath} with defaults. Continue? [y/N] ${r}`,
      );
      if (!ok) {
        console.log(`  ${dim}Aborted — no changes written.${r}\n`);
        return;
      }
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
    if (!injectTarget && hasExistingConfig && !opts.reset && typeof loadedConfig.inject === 'string') {
      injectTarget = loadedConfig.inject;
    }
    if (!injectTarget) {
      const detected = detectAgentFile(projectDir);
      if (detected) {
        injectTarget = detected;
      }
    }

    // Step 4: Write .staipler.json
    // Smart-merge: when an existing config is present and --reset is NOT set,
    // preserve all user-customized fields and only override what was explicitly
    // passed via CLI flags. Reserve the clobber path for `--reset`.
    let config: Record<string, unknown>;
    let preservedKeys: string[] = [];
    if (hasExistingConfig && !opts.reset) {
      let raw: Record<string, unknown> = {};
      try {
        raw = JSON.parse(readFileSync(configPath, 'utf-8'));
      } catch {
        raw = {};
      }
      config = { ...raw };
      if (opts.minScore !== undefined) config.minScore = opts.minScore;
      if (opts.inject !== undefined) config.inject = opts.inject;
      else if (config.inject == null && injectTarget) config.inject = injectTarget;
      preservedKeys = Object.keys(raw).filter(k => k !== '$schema');
      const summary = preservedKeys.length > 0
        ? ` ${dim}(preserved: ${preservedKeys.join(', ')})${r}`
        : '';
      console.log(`  ${dim}Reinitialized stAIpler — kept existing .staipler.json${summary}${r}`);
    } else {
      config = {
        minScore: opts.minScore ?? DEFAULT_CONFIG.minScore,
        requiredLayers: DEFAULT_CONFIG.requiredLayers,
        inject: injectTarget,
      };
      if (hasExistingConfig && opts.reset) {
        console.log(`  ${dim}Resetting .staipler.json to defaults${r}`);
      }
    }
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

    // Next commands — formatted like `staipler --help` with name + description
    const nextCommands: Array<[string, string]> = [
      ['optimize', 'Scan, analyze, and optimize your instruction stack'],
      ['dashboard', 'Generate and open the project context dashboard'],
      ['watch', 'Watch instruction files and show live empowerment score'],
      ['eval-project', 'A/B test your project with and without stAIpler context'],
      ['ci', 'Check instruction stack against quality thresholds (for CI/CD)'],
      ['inject', 'Re-inject empowerment status into your agent config file'],
      ['memory', "Inspect your agent's memory — what it knows and what's missing"],
    ];
    const headline = score < 60
      ? 'Your score is low — start with optimize to fill the biggest gaps:'
      : score < 80
        ? 'Solid start. Tighten things up with:'
        : 'Strong baseline. Keep it healthy with:';
    const nameWidth = Math.max(...nextCommands.map(([name]) => name.length));
    console.log(`  ${purple}${bold}Next commands${r}  ${dim}${headline}${r}`);
    for (const [name, desc] of nextCommands) {
      const padded = name.padEnd(nameWidth, ' ');
      console.log(`    ${bold}staipler ${padded}${r}  ${dim}${desc}${r}`);
    }
    console.log(`\n  ${dim}Run ${r}${bold}staipler --help${r}${dim} for the full command list.${r}\n`);

    // Run quick proof only if explicitly requested with --proof
    if (opts.proof && process.stdin.isTTY) {
      const { runQuickProof } = await import('./quick-proof.js');
      await runQuickProof(analysis, scanResult, 'sonnet', projectDir);
    }
  });
