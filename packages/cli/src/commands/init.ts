import { Command } from 'commander';
import { existsSync, writeFileSync } from 'fs';
import { resolve, basename, relative } from 'path';
import {
  scan,
  analyze,
  loadConfig,
  DEFAULT_CONFIG,
  findInjectTarget,
  injectStatus,
  saveKpiSnapshot,
} from '@staipler/core';
import type { KpiSnapshot, StaiplerConfig } from '@staipler/core';

const LAYER_HINTS: Record<string, string> = {
  constraints: 'Hard limits and non-negotiables',
  context: 'Domain knowledge and business rules',
  evals: 'Test cases and acceptance criteria',
  examples: 'Few-shot examples and templates',
  goals: 'Success criteria and priorities',
  identity: 'Role, persona, and character',
  memory: 'Runtime session context',
  policies: 'Compliance, legal, brand rules',
  prompts: 'Reusable prompt fragments',
  skills: 'Workflows and decision trees',
  style: 'Tone, formatting, response shape',
  tools: 'Available tools and usage rules',
};

const AGENT_FILES = ['CLAUDE.md', 'AGENTS.md', '.cursorrules', '.windsurfrules', '.clinerules', 'GEMINI.md'];

function detectAgentFile(dir: string): string | null {
  for (const file of AGENT_FILES) {
    if (existsSync(resolve(dir, file))) return file;
  }
  return null;
}

export const initCommand = new Command('init')
  .description('Initialize stAIpler in your project — creates config, runs first scan, and injects agent status')
  .option('--inject <file>', 'Agent config file to inject status into (e.g., CLAUDE.md)')
  .option('--min-score <n>', 'Minimum score for CI checks', parseInt)
  .option('--yes', 'Skip prompts, use defaults')
  .action(async (opts: { inject?: string; minScore?: number; yes?: boolean }) => {
    const projectDir = process.cwd();
    const projectName = basename(projectDir);
    const configPath = resolve(projectDir, '.staipler.json');

    console.log(`\n  \x1b[1mstAIpler init\x1b[0m — setting up ${projectName}\n`);

    // Step 1: Check for existing config
    const { configPath: existingConfig } = loadConfig(projectDir);
    if (existingConfig && resolve(existingConfig) === configPath) {
      console.log(`  \x1b[33m!\x1b[0m .staipler.json already exists — updating\n`);
    }

    // Step 2: Run initial scan
    console.log('  Scanning for instruction files...');
    const scanResult = scan(projectDir);
    const analysis = analyze(scanResult);

    console.log(`  Found ${scanResult.files.length} instruction files`);
    console.log(`  Empowerment: ${analysis.readinessScore}/100 (${analysis.grade})\n`);

    // Step 3: Detect or choose agent file for injection
    let injectTarget = opts.inject ?? null;
    if (!injectTarget) {
      const detected = detectAgentFile(projectDir);
      if (detected) {
        injectTarget = detected;
        console.log(`  Detected agent config: ${detected}`);
      }
    }

    // Step 4: Write .staipler.json
    const config: Partial<StaiplerConfig> & { $schema?: string } = {
      minScore: opts.minScore ?? DEFAULT_CONFIG.minScore,
      requiredLayers: DEFAULT_CONFIG.requiredLayers,
      inject: injectTarget,
    };

    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
    console.log('  Created .staipler.json');

    // Step 5: Inject status into agent file
    if (injectTarget) {
      const targetPath = resolve(projectDir, injectTarget);
      const result = injectStatus(targetPath, analysis);
      if (result.created) {
        console.log(`  Created ${injectTarget} with empowerment status`);
      } else {
        console.log(`  Injected status into ${injectTarget}`);
      }
    }

    // Step 6: Save initial KPI snapshot
    try {
      const snapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: analysis.readinessScore,
        grade: analysis.grade,
        layerScores: Object.fromEntries(analysis.layers.map(l => [l.kind, l.qualityScore])),
        action: 'scan',
        notes: 'Initial scan via staipler init',
      };
      saveKpiSnapshot(projectDir, snapshot, projectName);
    } catch {
      // Non-fatal
    }

    // Step 7: Print summary
    const missing = analysis.layers.filter(l => l.status === 'missing');
    const present = analysis.layers.filter(l => l.status === 'present');

    console.log('\n  \x1b[1m\x1b[32mReady!\x1b[0m\n');
    console.log('  \x1b[2mCreated:\x1b[0m');
    console.log('    .staipler.json     — project config');
    if (injectTarget) {
      console.log(`    ${injectTarget.padEnd(20)} — agent status (auto-updates)`);
    }
    console.log('    .staipler/kpi.json — score history\n');

    console.log('  \x1b[2mLayer coverage:\x1b[0m');
    for (const layer of analysis.layers) {
      const icon = layer.status === 'present' ? '\x1b[32m✓\x1b[0m' : layer.status === 'weak' ? '\x1b[33m~\x1b[0m' : '\x1b[31m✗\x1b[0m';
      const hint = LAYER_HINTS[layer.kind] ?? '';
      // Show the highest-confidence file, skip low-confidence matches
      const bestFile = layer.files.length > 0
        ? layer.files.reduce((a, b) => a.inferredConfidence > b.inferredConfidence ? a : b)
        : null;
      const filePath = bestFile && bestFile.inferredConfidence >= 0.5
        ? `\x1b[36m${bestFile.relativePath}\x1b[0m`
        : '';
      // Special handling for memory layer — show provider if detected
      if (layer.kind === 'memory' && scanResult.memoryProvider) {
        const mp = scanResult.memoryProvider;
        console.log(`    ${icon} ${layer.kind.padEnd(14)} ${hint.padEnd(36)} \x1b[32m${mp.name}\x1b[0m \x1b[2m(${mp.detectedVia}: ${mp.source})\x1b[0m`);
      } else {
        console.log(`    ${icon} ${layer.kind.padEnd(14)} ${hint.padEnd(36)} ${filePath}`);
      }
    }

    // Context-aware suggestions grouped by layer
    const suggestions = scanResult.suggestions;
    if (suggestions.length > 0) {
      const byLayer = new Map<string, typeof suggestions>();
      for (const s of suggestions) {
        if (!byLayer.has(s.layer)) byLayer.set(s.layer, []);
        byLayer.get(s.layer)!.push(s);
      }

      console.log(`\n  \x1b[33m?\x1b[0m \x1b[1mSuggestions\x1b[0m \x1b[2m(based on your project)\x1b[0m`);
      for (const [layer, layerSuggestions] of byLayer) {
        console.log(`\n    \x1b[2m${layer}:\x1b[0m`);
        for (const s of layerSuggestions) {
          console.log(`    \x1b[2m•\x1b[0m ${s.name.padEnd(20)} \x1b[2m${s.description}\x1b[0m`);
          console.log(`      \x1b[2m${s.url}  (${s.reason})\x1b[0m`);
        }
      }
    }

    // Knowledge base
    const kb = scanResult.knowledgeBase;
    if (kb.length > 0) {
      const totalKbSize = kb.reduce((s, f) => s + f.size, 0);
      console.log(`\n  \x1b[2mKnowledge base: ${kb.length} files (${(totalKbSize / 1024).toFixed(1)}K) the model can see\x1b[0m`);
      for (const file of kb) {
        const sizeStr = file.size >= 1024
          ? `${(file.size / 1024).toFixed(1)}K`
          : `${file.size}B`;
        console.log(`    \x1b[2m•\x1b[0m ${file.relativePath.padEnd(36)} \x1b[2m${file.description.padEnd(26)} ${sizeStr}\x1b[0m`);
      }
    } else {
      console.log(`\n  \x1b[2mKnowledge base: no project docs found (README.md, package.json, etc.)\x1b[0m`);
    }

    console.log('\n  \x1b[2mNext steps:\x1b[0m');
    console.log('    staipler watch        — live score as you work');
    if (missing.length > 0) {
      console.log('    staipler optimize     — AI fills missing layers');
    }
    console.log('    staipler ci           — add to your CI/CD pipeline');
    console.log('');
  });
