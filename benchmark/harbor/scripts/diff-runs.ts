#!/usr/bin/env node
/**
 * Generate a paired `diff.md` from two `run.json` files.
 *
 * Usage: tsx benchmark/harbor/scripts/diff-runs.ts <baselineRunDir> <staiplerRunDir> [<outPath>]
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { generateDiffMd } from '@staipler/core';
import type { RunReport } from '@staipler/core';

function main() {
  const [, , baselineDir, staiplerDir, outPathArg] = process.argv;
  if (!baselineDir || !staiplerDir) {
    console.error('usage: diff-runs <baselineRunDir> <staiplerRunDir> [<outPath>]');
    process.exit(1);
  }
  const baseline = JSON.parse(readFileSync(join(baselineDir, 'run.json'), 'utf-8')) as RunReport;
  const staipler = JSON.parse(readFileSync(join(staiplerDir, 'run.json'), 'utf-8')) as RunReport;
  const outPath = outPathArg ? resolve(outPathArg) : resolve(baselineDir, '..', 'diff.md');
  writeFileSync(outPath, generateDiffMd(baseline, staipler));
  console.log(`Wrote ${outPath}`);
}

main();
