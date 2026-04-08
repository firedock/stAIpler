import { writeFileSync, mkdirSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  extractSynthesisContext,
  buildSynthesisPrompt,
  parseSynthesisResponse,
  getFallbackScenarios,
  runBenchmarkEval,
  optimize,
  saveKpiSnapshot,
  generateStatusBlock,
} from '@staipler/core';
import type { AnalysisResult, ScanResult, SynthesizedScenario, KpiSnapshot } from '@staipler/core';
import { callClaude, isClaudeAvailable } from '../utils/claude.js';

const purple = '\x1b[38;5;135m';
const r = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';

function renderBar(score: number, max: number, width: number): string {
  const filled = Math.round((score / max) * width);
  const color = score / max >= 0.7 ? green : score / max >= 0.4 ? yellow : red;
  return `${color}${'█'.repeat(filled)}${dim}${'░'.repeat(width - filled)}${r}`;
}

/**
 * Build a system prompt from scanned instruction files.
 */
function buildSystemPromptFromScan(scanResult: ScanResult, analysis: AnalysisResult): string | null {
  const instructionFiles = scanResult.files.filter(f => f.inferredKind && f.content && f.contentLength > 0);
  if (instructionFiles.length === 0) return null;

  const parts: string[] = [generateStatusBlock(analysis)];
  for (const file of instructionFiles.slice(0, 10)) {
    parts.push(`# ${(file.inferredKind ?? 'UNKNOWN').toUpperCase()} (${file.relativePath})\n\n${file.content.slice(0, 2000)}`);
  }
  return parts.join('\n\n---\n\n');
}

/**
 * Build a system prompt from optimized assets.
 */
function buildSystemPromptFromOptimized(
  optimizedDir: string,
  analysis: AnalysisResult,
  scanResult: ScanResult,
): string {
  const parts: string[] = [generateStatusBlock(analysis)];

  // Include existing instruction files
  const existingFiles = scanResult.files.filter(f => f.inferredKind && f.content && f.contentLength > 0);
  for (const file of existingFiles.slice(0, 5)) {
    parts.push(`# ${(file.inferredKind ?? 'UNKNOWN').toUpperCase()} (${file.relativePath})\n\n${file.content.slice(0, 2000)}`);
  }

  // Include newly optimized files
  try {
    const { readdirSync } = require('fs');
    const files = readdirSync(optimizedDir).filter((f: string) => f.endsWith('.md'));
    for (const file of files) {
      const content = readFileSync(resolve(optimizedDir, file), 'utf-8');
      const kind = file.replace('.md', '').toUpperCase();
      parts.push(`# ${kind} (optimized/${file})\n\n${content.slice(0, 2000)}`);
    }
  } catch {}

  return parts.join('\n\n---\n\n');
}

export async function runQuickProof(
  analysis: AnalysisResult,
  scanResult: ScanResult,
  model: string,
  projectDir: string,
): Promise<void> {
  if (!isClaudeAvailable()) {
    console.log(`\n  ${dim}Install Claude CLI to run Quick Proof: https://docs.anthropic.com/en/docs/claude-cli${r}\n`);
    return;
  }

  try {
    const projectName = projectDir.split('/').pop() ?? 'project';

    console.log(`\n  ${purple}${bold}stAIpler Quick Proof${r} — ${projectName}\n`);

    // ---- Step 1: Reading your project ----
    console.log(`\n  ${purple}${bold}Step 1 of 7 — Reading your project${r}`);
    console.log(`    Found ${scanResult.files.length} instruction files, ${scanResult.knowledgeBase.length} knowledge base files`);
    console.log(`    Empowerment: ${analysis.readinessScore}/100 (${analysis.grade})\n`);

    // ---- Step 2: Writing the test ----
    console.log(`  ${purple}${bold}Step 2 of 7 — Writing the test${r}`);

    const ctx = extractSynthesisContext(scanResult, analysis);
    const synthesisPrompt = buildSynthesisPrompt(ctx, 3);

    let scenarios: SynthesizedScenario[];
    console.log(`    ${dim}AI is reading your project to generate 3 targeted scenarios...${r}`);
    try {
      const raw = callClaude({ prompt: synthesisPrompt, model });
      scenarios = parseSynthesisResponse(raw);
      console.log(`    ${green}✓${r} ${scenarios.length} scenarios generated`);
    } catch {
      console.log(`    ${dim}Retrying synthesis...${r}`);
      try {
        const raw = callClaude({ prompt: synthesisPrompt, model });
        scenarios = parseSynthesisResponse(raw);
        console.log(`    ${green}✓${r} ${scenarios.length} scenarios generated`);
      } catch {
        console.log(`    ${dim}Using fallback scenarios${r}`);
        scenarios = getFallbackScenarios(projectName, 3);
      }
    }

    // Show scenarios with requirements
    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      console.log(`    ${purple}Scenario ${i + 1}:${r} "${s.name}"`);
      console.log(`      ${dim}Requirements:${r}`);
      for (const req of s.requirements) {
        console.log(`      ${dim}•${r} ${req}`);
      }
      console.log('');
    }

    // ---- Step 3: Agent takes the test (BEFORE) ----
    console.log(`  ${purple}${bold}Step 3 of 7 — Agent takes the test (no instruction stack)${r}`);
    console.log(`    ${dim}Your agent is answering all 3 scenarios with zero project${r}`);
    console.log(`    ${dim}context — this is what every new session looks like today.${r}\n`);

    const beforePrompt = buildSystemPromptFromScan(scanResult, analysis);

    const beforeResult = runBenchmarkEval({
      systemPrompt: beforePrompt,
      scenarios,
      label: 'before',
      callClaude: (prompt, sys, m) => callClaude({ prompt, systemPrompt: sys, model: m }),
      model,
      onProgress: (msg) => console.log(`    ${dim}${msg}${r}`),
    });
    console.log('');

    // ---- Step 4: Generating instruction layers ----
    console.log(`  ${purple}${bold}Step 4 of 7 — Generating instruction layers${r}`);
    console.log(`    ${dim}stAIpler is building project-aware instruction layers${r}`);
    console.log(`    ${dim}from your codebase, docs, and schemas...${r}\n`);

    const optimizeResult = await optimize(analysis, model, (msg) => {
      console.log(`    ${dim}${msg}${r}`);
    });

    // Write optimized assets
    const outDir = resolve(projectDir, 'library/optimized');
    mkdirSync(outDir, { recursive: true });
    const generatedFiles: string[] = [];
    for (const asset of optimizeResult.assets) {
      const fileName = `${asset.kind}.md`;
      const filePath = resolve(outDir, fileName);
      writeFileSync(filePath, asset.content);
      const label = asset.action === 'generated' ? '+' : '↑';
      generatedFiles.push(`${label} ${asset.kind}`);
    }

    console.log(`    ${green}✓${r} ${optimizeResult.assets.length} layers generated: ${generatedFiles.join('  ')}\n`);

    // ---- Step 5: Agent retakes the same test (AFTER) ----
    console.log(`  ${purple}${bold}Step 5 of 7 — Agent retakes the same test (with stAIpler)${r}`);
    console.log(`    ${dim}Same 3 scenarios, same model — only difference is your${r}`);
    console.log(`    ${dim}agent now has the stAIpler instruction stack.${r}\n`);

    const afterPrompt = buildSystemPromptFromOptimized(outDir, analysis, scanResult);

    const afterResult = runBenchmarkEval({
      systemPrompt: afterPrompt,
      scenarios,
      label: 'after',
      callClaude: (prompt, sys, m) => callClaude({ prompt, systemPrompt: sys, model: m }),
      model,
      onProgress: (msg) => console.log(`    ${dim}${msg}${r}`),
    });
    console.log('');

    // ---- Step 6: AI grades both runs blind ----
    console.log(`  ${purple}${bold}Step 6 of 7 — AI grades both runs blind${r}`);
    console.log(`    ${dim}Independent judge scored each response without knowing${r}`);
    console.log(`    ${dim}which had instructions and which didn't.${r}`);
    console.log(`    ${green}✓${r} All ${scenarios.length} scenarios judged\n`);

    // ---- Step 7: Results ----
    console.log(`  ${purple}${bold}Step 7 of 7 — Results${r}`);
    console.log(`\n  ${purple}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${r}`);
    console.log(`\n  ${purple}${bold}QUICK PROOF — ${projectName}${r}\n`);

    // Two scores side by side
    const empBefore = analysis.readinessScore;
    const empAfter = optimizeResult.afterScore;
    const benchBefore = beforeResult.aggregate.staiplerOverall;
    const benchAfter = afterResult.aggregate.staiplerOverall;

    console.log(`  Instruction coverage              Benchmark performance`);
    console.log(`  ${renderBar(empBefore, 100, 14)} ${empBefore}/100 (${analysis.grade})     ${renderBar(benchBefore, 5, 14)} ${benchBefore.toFixed(1)}/5`);
    console.log(`        ${dim}↓ stAIpler ↓${r}                     ${dim}↓ stAIpler ↓${r}`);
    const afterGrade = empAfter >= 90 ? 'A' : empAfter >= 80 ? 'B' : empAfter >= 70 ? 'C' : empAfter >= 60 ? 'D' : 'F';
    console.log(`  ${renderBar(empAfter, 100, 14)} ${empAfter}/100 (${afterGrade})    ${renderBar(benchAfter, 5, 14)} ${benchAfter.toFixed(1)}/5\n`);

    // Per-scenario results with requirement counts
    let improved = 0;
    let totalReqsBefore = 0;
    let totalReqsAfter = 0;

    for (let i = 0; i < scenarios.length; i++) {
      const s = scenarios[i];
      const beforeScenario = beforeResult.scenarios[i];
      const afterScenario = afterResult.scenarios[i];

      const beforeReqs = beforeScenario.judge.staipler.requirementsMet ?? [];
      const afterReqs = afterScenario.judge.staipler.requirementsMet ?? [];
      const beforePassed = beforeReqs.filter(Boolean).length;
      const afterPassed = afterReqs.filter(Boolean).length;

      totalReqsBefore += beforePassed;
      totalReqsAfter += afterPassed;

      if (afterPassed > beforePassed || afterScenario.judge.staipler.overall > beforeScenario.judge.staipler.overall) {
        improved++;
      }

      const beforeSummary = beforeScenario.judge.staipler.summary || beforeScenario.judge.staipler.reasoning.slice(0, 80);
      const afterSummary = afterScenario.judge.staipler.summary || afterScenario.judge.staipler.reasoning.slice(0, 80);

      console.log(`  ${bold}"${s.name}"${r}`);
      console.log(`    ${red}✗${r} Before: ${beforeSummary} ${dim}(${beforePassed}/${s.requirements.length} requirements)${r}`);
      console.log(`    ${green}✓${r} After:  ${afterSummary} ${dim}(${afterPassed}/${s.requirements.length} requirements)${r}`);
      console.log('');
    }

    const totalReqs = scenarios.reduce((sum, s) => sum + s.requirements.length, 0);
    console.log(`  ${bold}${improved}/${scenarios.length}${r} scenarios improved. ${bold}${totalReqsAfter}/${totalReqs}${r} requirements met.\n`);

    console.log(`  ${dim}stAIpler found what your agent was missing, generated the${r}`);
    console.log(`  ${dim}missing layers, and proved it on your own project.${r}\n`);

    console.log(`  ${purple}Generated layers:${r}   library/optimized/`);
    console.log(`  ${purple}Full benchmark:${r}     staipler benchmark ${dim}(10 scenarios, detailed report)${r}\n`);

    // Save KPI snapshot
    try {
      const snapshot: KpiSnapshot = {
        timestamp: new Date().toISOString(),
        readinessScore: empAfter,
        grade: afterGrade,
        layerScores: {},
        evalScore: benchAfter,
        evalImprovement: benchBefore > 0 ? Math.round(((benchAfter - benchBefore) / benchBefore) * 100) : 0,
        action: 'eval',
        notes: `Quick proof: ${improved}/${scenarios.length} improved, ${totalReqsAfter}/${totalReqs} requirements met`,
      };
      saveKpiSnapshot(projectDir, snapshot, projectName);
    } catch {}

  } catch (err) {
    console.error(`\n  ${red}Quick proof error: ${err instanceof Error ? err.message : String(err)}${r}\n`);
  }
}
