import { Command } from 'commander';
import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { resolve, join } from 'path';
import {
  buildStack,
  findProjectRoot,
  parseAsset,
  validateStack,
  loadContracts,
  evaluateContract,
} from '@staipler/core';
import type { ContractResult } from '@staipler/core';

export const validateCommand = new Command('validate')
  .description('Validate stacks and assets')
  .argument('[stack]', 'Optional stack name to validate (validates all if omitted)')
  .action((stackName?: string) => {
    try {
      const projectRoot = findProjectRoot(process.cwd());
      const stacksDir = resolve(projectRoot, 'stacks');
      const libraryDir = resolve(projectRoot, 'library');
      const contractsDir = resolve(projectRoot, 'contracts');
      let hasErrors = false;

      const stacks = stackName
        ? [stackName]
        : readdirSync(stacksDir).filter(f =>
            statSync(join(stacksDir, f)).isDirectory() &&
            existsSync(join(stacksDir, f, 'stack.yaml')),
          );

      for (const name of stacks) {
        console.log(`\nValidating stack: ${name}`);
        try {
          const bundle = buildStack(name, stacksDir, { libraryDir, contractsDir });

          // Report builtin results
          for (const result of bundle.contractResults) {
            if (result.passed) {
              console.log(`  ✓ ${result.contract}`);
            } else {
              console.log(`  ✗ ${result.contract}`);
              for (const issue of result.issues) {
                console.log(`    - ${issue}`);
              }
              hasErrors = true;
            }
          }

          // Report warnings
          for (const w of bundle.warnings) {
            console.log(`  ⚠ ${w.code}: ${w.message}`);
          }

          if (bundle.contractResults.every(c => c.passed) && bundle.warnings.length === 0) {
            console.log(`  Stack "${name}" is valid.`);
          }
        } catch (err) {
          console.log(`  ✗ ${err instanceof Error ? err.message : String(err)}`);
          hasErrors = true;
        }
      }

      if (hasErrors) {
        process.exit(1);
      }
    } catch (err) {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  });
