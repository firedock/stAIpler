#!/usr/bin/env node
import { Command } from 'commander';
import { buildCommand } from './commands/build.js';
import { validateCommand } from './commands/validate.js';
import { evalCommand } from './commands/eval.js';
import { optimizeCommand } from './commands/optimize.js';

const program = new Command()
  .name('staipler')
  .description('Compose AI instruction layers')
  .version('0.1.0');

program.addCommand(buildCommand);
program.addCommand(validateCommand);
program.addCommand(evalCommand);
program.addCommand(optimizeCommand);

program.parse();
