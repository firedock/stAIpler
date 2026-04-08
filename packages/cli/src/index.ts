#!/usr/bin/env node
import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { validateCommand } from './commands/validate.js';
import { evalCommand } from './commands/eval.js';
import { optimizeCommand } from './commands/optimize.js';
import { dashboardCommand } from './commands/dashboard.js';
import { watchCommand } from './commands/watch.js';
import { ciCommand } from './commands/ci.js';
import { injectCommand } from './commands/inject.js';
import { initCommand } from './commands/init.js';
import { evalProjectCommand } from './commands/eval-project.js';

const program = new Command()
  .name('staipler')
  .description('AI agent context optimizer — scan, score, and improve your instruction stack')
  .version('0.1.0');

program.addCommand(initCommand);
program.addCommand(buildCommand);
program.addCommand(validateCommand);
program.addCommand(evalCommand);
program.addCommand(optimizeCommand);
program.addCommand(dashboardCommand);
program.addCommand(watchCommand);
program.addCommand(ciCommand);
program.addCommand(injectCommand);
program.addCommand(evalProjectCommand);

program.parse();
