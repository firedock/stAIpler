import { Command } from 'commander';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { createInterface } from 'readline';
import chalk from 'chalk';
import { loadConfig } from '../utils/config.js';
import { fetchPlan, type PlanFile } from '../utils/api.js';

type Action = 'new' | 'modified' | 'unchanged';
interface FileDiff {
  file: PlanFile;
  outPath: string;
  action: Action;
  existingChars: number;
  newChars: number;
}

function classifyFile(file: PlanFile, outDir: string, cwd: string): FileDiff {
  const outPath = resolve(cwd, outDir, file.filename);
  if (!existsSync(outPath)) {
    return { file, outPath, action: 'new', existingChars: 0, newChars: file.content.length };
  }
  const existing = readFileSync(outPath, 'utf-8');
  if (existing.trim() === file.content.trim()) {
    return { file, outPath, action: 'unchanged', existingChars: existing.length, newChars: file.content.length };
  }
  return { file, outPath, action: 'modified', existingChars: existing.length, newChars: file.content.length };
}

function statusLabel(status: PlanFile['status']): string {
  if (status === 'source-grounded') return chalk.green('source-grounded');
  if (status === 'ai-generated') return chalk.yellow('AI-generated  ');
  return chalk.cyan('mixed         ');
}

function actionLabel(action: Action): string {
  if (action === 'new') return chalk.green('+ NEW    ');
  if (action === 'modified') return chalk.yellow('~ CHANGED');
  return chalk.gray('= same   ');
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes');
    });
  });
}

export const pullCommand = new Command('pull')
  .description('Pull a stAIpler project\'s compiled instruction stack into your local repo')
  .argument('<project-id>', 'Project ID from your stAIpler dashboard URL')
  .option('--out <dir>', 'Output directory for instruction files', 'library/optimized')
  .option('--yes', 'Skip the confirmation prompt and write all files')
  .option('--dry-run', 'Show what would change without writing anything')
  .action(async (projectId: string, opts: { out: string; yes?: boolean; dryRun?: boolean }) => {
    const config = loadConfig();
    if (!config) {
      console.error(chalk.red('\n  Not logged in.'));
      console.error('  Generate a token from your project dashboard, then run:');
      console.error(chalk.cyan('    staipler login --token <your-token>\n'));
      process.exit(1);
    }

    console.log('\n  Fetching plan from stAIpler...');

    let plan;
    try {
      plan = await fetchPlan(config, projectId);
    } catch (err) {
      console.error(chalk.red(`\n  ${err instanceof Error ? err.message : 'Unknown error'}\n`));
      process.exit(1);
    }

    console.log(`  Project: ${chalk.bold(plan.project.name)}`);
    console.log(`  Score:   ${plan.project.readinessScore}/100 (${plan.project.grade})`);

    if (plan.message) {
      console.log(chalk.yellow(`\n  ${plan.message}\n`));
      process.exit(0);
    }

    if (plan.files.length === 0) {
      console.log(chalk.yellow('\n  Nothing to pull — this project has no compiled layers yet.'));
      console.log('  Visit staipler.com to connect data sources or run optimization first.\n');
      process.exit(0);
    }

    // Classify every file in the plan
    const cwd = process.cwd();
    const diffs = plan.files.map(f => classifyFile(f, opts.out, cwd));

    const newCount = diffs.filter(d => d.action === 'new').length;
    const changedCount = diffs.filter(d => d.action === 'modified').length;
    const unchangedCount = diffs.filter(d => d.action === 'unchanged').length;

    console.log(`\n  ${plan.files.length} layer(s) in plan → ${chalk.cyan(opts.out + '/')}\n`);
    for (const diff of diffs) {
      const charDelta = diff.action === 'modified'
        ? chalk.gray(`(${diff.existingChars} → ${diff.newChars} chars)`)
        : chalk.gray(`(${diff.newChars} chars)`);
      console.log(`    ${actionLabel(diff.action)}  ${diff.file.filename.padEnd(20)} ${statusLabel(diff.file.status)}  ${charDelta}`);
    }

    if (plan.gaps.length > 0) {
      console.log(chalk.gray(`\n    Gaps not in plan: ${plan.gaps.join(', ')}`));
      console.log(chalk.gray('    Run optimization on staipler.com to fill these.'));
    }

    if (plan.conflicts.length > 0) {
      console.log(chalk.yellow(`\n    ${plan.conflicts.length} unresolved conflict(s) — review on staipler.com before pulling.`));
    }

    if (newCount === 0 && changedCount === 0) {
      console.log(chalk.green('\n  Nothing to write — your local files are already in sync.\n'));
      process.exit(0);
    }

    console.log(chalk.bold(`\n  Summary: ${newCount} new, ${changedCount} changed, ${unchangedCount} unchanged`));

    if (opts.dryRun) {
      console.log(chalk.gray('\n  Dry run — no files written. Remove --dry-run to apply.\n'));
      process.exit(0);
    }

    if (!opts.yes) {
      const ok = await confirm(chalk.cyan(`\n  Write ${newCount + changedCount} file(s) to ${opts.out}/? [y/N] `));
      if (!ok) {
        console.log('  Aborted.\n');
        process.exit(0);
      }
    }

    const outDir = resolve(cwd, opts.out);
    mkdirSync(outDir, { recursive: true });

    let written = 0;
    for (const diff of diffs) {
      if (diff.action === 'unchanged') continue;
      writeFileSync(diff.outPath, diff.file.content);
      written++;
    }

    console.log(chalk.green(`\n  Wrote ${written} file(s) to ${opts.out}/`));
    console.log(`  Review with: ${chalk.cyan(`git diff ${opts.out}/`)}`);
    console.log(`  Then commit when ready.\n`);
  });
