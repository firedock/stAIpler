import { Command } from 'commander';
import { execSync } from 'child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, basename } from 'path';
import {
  findProjectRoot,
  scan,
  analyze,
  generateStatusBlock,
} from '@staipler/core';

interface EvalResult {
  question: string;
  controlResponse: string;
  staiplerResponse: string;
  instructionContext: string;
}

function callClaude(prompt: string, systemPrompt: string | null, model: string): string {
  const ts = Date.now();
  const tmpDir = '/tmp/staipler-eval-project';
  mkdirSync(tmpDir, { recursive: true });

  const promptFile = resolve(tmpDir, `prompt-${ts}.txt`);
  writeFileSync(promptFile, prompt);
  const cleanup: string[] = [promptFile];

  let cmd: string;
  if (systemPrompt) {
    const sysFile = resolve(tmpDir, `sys-${ts}.txt`);
    writeFileSync(sysFile, systemPrompt);
    cleanup.push(sysFile);
    cmd = `cat '${promptFile}' | claude -p --model ${model} --system-prompt "$(cat '${sysFile}')"`;
  } else {
    cmd = `cat '${promptFile}' | claude -p --model ${model}`;
  }

  try {
    return execSync(cmd, {
      encoding: 'utf-8',
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: '/bin/bash',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } finally {
    for (const f of cleanup) {
      try { execSync(`rm -f '${f}'`); } catch {}
    }
  }
}

const purple = '\x1b[38;5;135m';
const r = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const cyan = '\x1b[36m';

const DEFAULT_QUESTIONS = [
  'What is this project and what does it do?',
  'What are the main technologies and dependencies used?',
  'What conventions or patterns should I follow when contributing?',
  'What are the most important files and directories to understand?',
  'Are there any security concerns or sensitive areas I should be careful with?',
];

export const evalProjectCommand = new Command('eval-project')
  .description('A/B test your project with and without stAIpler instruction context')
  .argument('[dir]', 'Directory to evaluate (default: current directory)')
  .option('--model <model>', 'Claude model to use', 'sonnet')
  .option('--questions <file>', 'File with custom questions (one per line)')
  .option('--question <q>', 'Single question to test')
  .option('--out <dir>', 'Output directory for results', '.output/eval-project')
  .action(async (dir: string | undefined, opts: { model: string; questions?: string; question?: string; out: string }) => {
    let projectRoot: string;
    try {
      projectRoot = findProjectRoot(process.cwd());
    } catch {
      projectRoot = process.cwd();
    }

    const scanDir = dir ? resolve(process.cwd(), dir) : projectRoot;
    const projectName = basename(scanDir);

    console.log(`\n  ${purple}${bold}stAIpler eval-project${r} — ${projectName}\n`);

    // Step 1: Scan and build instruction context
    console.log(`  ${purple}${bold}Scanning...${r}`);
    const scanResult = scan(scanDir);
    const analysis = analyze(scanResult);

    // Build the instruction context from all discovered files
    const instructionFiles = scanResult.files.filter(f => f.inferredKind && f.content);
    const instructionContext = instructionFiles
      .map(f => `# ${f.inferredKind?.toUpperCase()} (${f.relativePath})\n\n${f.content}`)
      .join('\n\n---\n\n');

    const statusBlock = generateStatusBlock(analysis);
    const fullSystemPrompt = `${statusBlock}\n\n---\n\n${instructionContext}`;

    // Build knowledge base context (both runs get this — it's what the LLM naturally sees)
    const kbContext = scanResult.knowledgeBase
      .filter(f => f.size < 10000) // Only include files under 10K
      .map(f => {
        try {
          const content = readFileSync(f.path, 'utf-8');
          return `# ${f.relativePath}\n\n${content}`;
        } catch { return ''; }
      })
      .filter(Boolean)
      .join('\n\n---\n\n');

    console.log(`  Score: ${analysis.readinessScore}/100 (${analysis.grade})`);
    console.log(`  Instruction files: ${instructionFiles.length}`);
    console.log(`  Knowledge base files: ${scanResult.knowledgeBase.length}`);
    console.log(`  Model: ${opts.model}\n`);

    // Step 2: Get questions
    let questions: string[];
    if (opts.question) {
      questions = [opts.question];
    } else if (opts.questions) {
      const qFile = resolve(process.cwd(), opts.questions);
      questions = readFileSync(qFile, 'utf-8').split('\n').filter(l => l.trim());
    } else {
      questions = DEFAULT_QUESTIONS;
    }

    console.log(`  ${purple}Running ${questions.length} questions × 2 (control vs stAIpler)...${r}\n`);

    // Step 3: Run A/B tests
    const results: EvalResult[] = [];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      console.log(`  ${dim}[${i + 1}/${questions.length}]${r} ${question}`);

      const prompt = kbContext
        ? `Here is context about the project:\n\n${kbContext}\n\n---\n\nQuestion: ${question}`
        : question;

      // Control: knowledge base only, no instruction layers
      console.log(`    ${dim}Running control (no instructions)...${r}`);
      const controlResponse = callClaude(prompt, null, opts.model);

      // stAIpler: knowledge base + full instruction context
      console.log(`    ${dim}Running stAIpler (with instruction stack)...${r}`);
      const staiplerResponse = callClaude(prompt, fullSystemPrompt, opts.model);

      results.push({
        question,
        controlResponse,
        staiplerResponse,
        instructionContext: fullSystemPrompt,
      });

      console.log(`    ${green}✓${r} Done\n`);
    }

    // Step 4: Write results
    const outDir = resolve(projectRoot, opts.out);
    mkdirSync(outDir, { recursive: true });

    // Generate markdown report
    const report = generateMarkdownReport(projectName, analysis, results);
    const reportPath = resolve(outDir, 'eval-report.md');
    writeFileSync(reportPath, report);

    // Write raw JSON
    const dataPath = resolve(outDir, 'eval-results.json');
    writeFileSync(dataPath, JSON.stringify({ projectName, analysis: { score: analysis.readinessScore, grade: analysis.grade }, results }, null, 2));

    // Step 5: Print summary
    console.log(`  ${purple}${bold}Results${r}\n`);
    console.log(`  ${dim}Report:${r}  ${cyan}${reportPath}${r}`);
    console.log(`  ${dim}Data:${r}    ${cyan}${dataPath}${r}`);
    console.log(`\n  Open the report to compare responses side by side.`);
    console.log(`  ${dim}The control had no instruction context — stAIpler had your full stack.${r}\n`);

    // Try to open the report
    try {
      execSync(`open '${reportPath}'`, { stdio: 'ignore' });
    } catch {}
  });

function generateMarkdownReport(
  projectName: string,
  analysis: { readinessScore: number; grade: string },
  results: EvalResult[],
): string {
  const lines: string[] = [];

  lines.push(`# stAIpler A/B Test Report — ${projectName}`);
  lines.push('');
  lines.push(`**Empowerment Score:** ${analysis.readinessScore}/100 (${analysis.grade})`);
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Questions tested:** ${results.length}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`## Question ${i + 1}: ${r.question}`);
    lines.push('');
    lines.push('### Control (no instruction context)');
    lines.push('');
    lines.push(r.controlResponse);
    lines.push('');
    lines.push('### stAIpler (with instruction stack)');
    lines.push('');
    lines.push(r.staiplerResponse);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## How to read this report');
  lines.push('');
  lines.push('The **control** response is what the model produces with only the project\'s knowledge base (README, package.json, etc.) — no instruction layers.');
  lines.push('');
  lines.push('The **stAIpler** response is what the model produces with the full instruction stack injected as a system prompt — identity, constraints, skills, style, and everything else detected by stAIpler.');
  lines.push('');
  lines.push('The difference shows the impact of having a complete instruction context.');
  lines.push('');

  return lines.join('\n');
}
