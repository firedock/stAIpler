import { Command } from 'commander';
import { resolve, relative } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  loadConfig,
  findInjectTarget,
  injectStatus,
} from '@staipler/core';

export const injectCommand = new Command('inject')
  .description('Inject empowerment status into your agent config file (CLAUDE.md, .cursorrules, etc.)')
  .argument('[dir]', 'Directory to scan (default: current directory)')
  .option('--target <file>', 'Target file to inject into (overrides config and auto-detection)')
  .action(async (dir: string | undefined, opts: { target?: string }) => {
    let projectRoot: string;
    try {
      projectRoot = findProjectRoot(process.cwd());
    } catch {
      projectRoot = process.cwd();
    }

    const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;
    const { config } = loadConfig(projectRoot);

    // Scan
    console.log('\n  Scanning...');
    const scanResult = scan(scanDir);
    const analysis = analyze(scanResult);

    // Find target
    const targetOverride = opts.target ? resolve(process.cwd(), opts.target) : null;
    const target = targetOverride ?? findInjectTarget(projectRoot, config.inject);

    if (!target) {
      console.log('\n  No agent config file found.');
      console.log('  Create one of: CLAUDE.md, .cursorrules, AGENTS.md, GEMINI.md');
      console.log('  Or set "inject" in .staipler.json to specify a file.\n');
      process.exit(1);
    }

    const result = injectStatus(target, analysis);
    const rel = relative(projectRoot, target);

    if (result.created) {
      console.log(`  Created ${rel} with empowerment status`);
    } else {
      console.log(`  Updated ${rel} with empowerment status`);
    }

    console.log(`  Score: ${analysis.readinessScore}/100 (${analysis.grade})`);
    const missing = analysis.layers.filter(l => l.status === 'missing');
    if (missing.length > 0) {
      console.log(`  Missing: ${missing.map(l => l.kind).join(', ')}`);
    }
    console.log(`\n  Your agent now knows its own blind spots.\n`);
  });
