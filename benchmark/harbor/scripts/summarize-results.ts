#!/usr/bin/env node
/**
 * Regenerate `summary.md` from an existing `run.json`.
 *
 * Usage: tsx benchmark/harbor/scripts/summarize-results.ts <runDir>
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { generateSummaryMd } from '@staipler/core';
import type { RunReport } from '@staipler/core';

function main() {
  const runDir = process.argv[2];
  if (!runDir) {
    console.error('usage: summarize-results <runDir>');
    process.exit(1);
  }
  const json = JSON.parse(readFileSync(join(runDir, 'run.json'), 'utf-8')) as RunReport;
  writeFileSync(join(runDir, 'summary.md'), generateSummaryMd(json));
  console.log(`Wrote ${join(runDir, 'summary.md')}`);
}

main();
