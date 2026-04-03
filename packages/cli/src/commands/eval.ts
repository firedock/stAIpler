import { Command } from 'commander';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import {
  findProjectRoot,
  CUSTOMER_SUPPORT_SCENARIOS,
  runEval,
  generateReport,
} from '@staipler/core';
import type { EvalConfig } from '@staipler/core';

export const evalCommand = new Command('eval')
  .description('Evaluate a stack against a control (no instructions) using Claude')
  .argument('<stack>', 'Stack to evaluate')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--out <dir>', 'Output directory for report', '.output/eval')
  .option('--scenarios <ids>', 'Comma-separated scenario IDs to run (default: all)')
  .action(async (stackName: string, opts: { model: string; out: string; scenarios?: string }) => {
    try {
      const projectRoot = findProjectRoot(process.cwd());
      const stacksDir = resolve(projectRoot, 'stacks');
      const libraryDir = resolve(projectRoot, 'library');
      const contractsDir = resolve(projectRoot, 'contracts');
      const outputDir = resolve(projectRoot, opts.out);

      let scenarios = CUSTOMER_SUPPORT_SCENARIOS;
      if (opts.scenarios) {
        const ids = opts.scenarios.split(',').map(s => s.trim());
        scenarios = scenarios.filter(s => ids.includes(s.id));
        if (scenarios.length === 0) {
          console.error(`No scenarios matched. Available: ${CUSTOMER_SUPPORT_SCENARIOS.map(s => s.id).join(', ')}`);
          process.exit(1);
        }
      }

      console.log(`stAIpler Eval`);
      console.log(`Stack: ${stackName}`);
      console.log(`Model: ${opts.model}`);
      console.log(`Scenarios: ${scenarios.length}`);
      console.log(`Output: ${outputDir}`);

      const config: EvalConfig = {
        stackName,
        stacksDir,
        libraryDir,
        contractsDir,
        outputDir,
        model: opts.model,
        scenarios,
      };

      const result = await runEval(config);

      // Write results
      mkdirSync(outputDir, { recursive: true });

      const reportHtml = generateReport(result);
      const reportPath = resolve(outputDir, 'report.html');
      writeFileSync(reportPath, reportHtml);

      const dataPath = resolve(outputDir, 'results.json');
      writeFileSync(dataPath, JSON.stringify(result, null, 2));

      console.log(`\n${'='.repeat(50)}`);
      console.log(`RESULTS`);
      console.log(`${'='.repeat(50)}`);
      console.log(`Control avg:  ${result.aggregate.controlOverall.toFixed(2)}`);
      console.log(`stAIpler avg: ${result.aggregate.staiplerOverall.toFixed(2)}`);
      console.log(`Improvement:  ${result.aggregate.improvement > 0 ? '+' : ''}${result.aggregate.improvement}%`);
      console.log(`Wins: stAIpler ${result.aggregate.wins.staipler} | Control ${result.aggregate.wins.control} | Tie ${result.aggregate.wins.tie}`);
      console.log(`\nReport: ${reportPath}`);
      console.log(`Data:   ${dataPath}`);
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
