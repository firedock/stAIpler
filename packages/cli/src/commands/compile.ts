import { Command } from 'commander';
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { EventBus, consoleSink, loadActiveBundle } from '@staipler/core';
import {
  compileClaudeCode,
  materialize,
} from '@staipler/adapter-claude-code';

function gitHead(cwd: string): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export const compileCommand = new Command('compile')
  .description('Compile the current project state to a compiler target')
  .option('--target <name>', 'compiler target (claude-code)', 'claude-code')
  .option('--out <dir>', 'output directory', '.')
  .option('--no-release-manifest', 'skip writing .staipler/releases/<id>.json')
  .option('--quiet', 'suppress live event stream', false)
  .action((opts: { target: string; out: string; releaseManifest: boolean; quiet: boolean }) => {
    if (opts.target !== 'claude-code') {
      console.error(`Unknown target: ${opts.target}. Supported: claude-code.`);
      process.exit(1);
    }
    const cwd = resolve(process.cwd());
    const bus = new EventBus();
    if (!opts.quiet) bus.addSink(consoleSink());

    const { ready, bundle } = loadActiveBundle(cwd, bus);
    const artifacts = compileClaudeCode(ready, { gitCommit: gitHead(cwd), bus });
    const outDir = resolve(opts.out);
    const result = materialize(artifacts, outDir, {
      writeReleaseManifest: opts.releaseManifest !== false,
      bus,
    });
    writeFileSync(
      join(outDir, '.staipler', `claude-code-manifest-${artifacts.manifest.release_id}.json`),
      JSON.stringify(artifacts.manifest, null, 2),
    );
    if (!opts.quiet) {
      process.stdout.write(`\nCLAUDE.md → ${result.claudeMdPath}\n`);
      for (const p of result.skillPaths) process.stdout.write(`skill     → ${p}\n`);
      if (result.releaseManifestPath) process.stdout.write(`manifest  → ${result.releaseManifestPath}\n`);
      process.stdout.write(`release_id  ${artifacts.manifest.release_id}\n`);
      process.stdout.write(`bundle_hash ${bundle.hash}\n`);
    }
  });
