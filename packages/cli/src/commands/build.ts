import { Command } from 'commander';
import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { buildStack, findProjectRoot } from '@staipler/core';

export const buildCommand = new Command('build')
  .description('Compile a stack to a bundle')
  .argument('<stack>', 'Stack directory name under stacks/')
  .option('--out <path>', 'Output file path')
  .option('--format <format>', 'Output format: json, text, markdown', 'json')
  .action((stackName: string, opts: { out?: string; format: string }) => {
    try {
      const projectRoot = findProjectRoot(process.cwd());
      const stacksDir = resolve(projectRoot, 'stacks');
      const libraryDir = resolve(projectRoot, 'library');
      const contractsDir = resolve(projectRoot, 'contracts');
      const bundle = buildStack(stackName, stacksDir, { libraryDir, contractsDir });

      let output: string;
      if (opts.format === 'text') {
        output = bundle.fullText;
      } else if (opts.format === 'markdown') {
        output = bundle.fullText;
      } else {
        output = JSON.stringify(bundle, null, 2);
      }

      if (opts.out) {
        writeFileSync(opts.out, output);
        console.log(`Bundle written to ${opts.out}`);
      } else {
        console.log(output);
      }

      // Print warnings to stderr
      for (const w of bundle.warnings) {
        console.error(`[WARN] ${w.code}: ${w.message}`);
      }

      // Print contract failures to stderr
      for (const c of bundle.contractResults) {
        if (!c.passed) {
          console.error(`[CONTRACT FAIL] ${c.contract}: ${c.issues.join(', ')}`);
        }
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
