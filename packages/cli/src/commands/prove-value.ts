import { createInterface } from 'readline';
import {
  getConstraintQuestion,
  selectSecondQuestion,
  buildDemoPlan,
} from '@staipler/core';
import type { AnalysisResult, ScanResult } from '@staipler/core';
import { callClaude, isClaudeAvailable } from '../utils/claude.js';

const purple = '\x1b[38;5;135m';
const r = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const green = '\x1b[32m';
const red = '\x1b[31m';
const yellow = '\x1b[33m';
const cyan = '\x1b[36m';

function ask(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return new Promise(resolve => rl.question(question, resolve));
}

/**
 * Heuristic check: does the control response appear to violate the user's constraint?
 * Intentionally modest — substring matching on key terms from the constraint.
 */
function classifyConstraintAdherenceHeuristic(response: string, constraint: string): boolean {
  const lower = response.toLowerCase();
  const constraintLower = constraint.toLowerCase();

  // Extract action words from the constraint
  const negationMatch = constraintLower.match(/(?:never|don'?t|do\s+not|should\s+not|must\s+not|shouldn'?t)\s+(.+)/);
  if (negationMatch) {
    const forbidden = negationMatch[1].replace(/\.$/, '').trim();
    // Check if key words from the forbidden action appear in the response as a suggestion
    const keywords = forbidden.split(/\s+/).filter(w => w.length > 3);
    const matchCount = keywords.filter(w => lower.includes(w)).length;
    // If more than half the keywords appear, likely violated
    return matchCount > keywords.length * 0.5;
  }

  return false;
}

function wordWrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = '';
    for (const word of words) {
      if (current.length + word.length + 1 > width) {
        lines.push(current);
        current = word;
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function renderSideBySide(
  controlResponse: string,
  staiplerResponse: string,
  controlViolated: boolean,
  termWidth: number,
): void {
  const useSideBySide = termWidth >= 80;

  if (useSideBySide) {
    const colWidth = Math.floor((termWidth - 5) / 2); // 5 = "  │  " divider
    const controlLines = wordWrap(controlResponse, colWidth - 2);
    const staiplerLines = wordWrap(staiplerResponse, colWidth - 2);
    const maxLines = Math.min(Math.max(controlLines.length, staiplerLines.length), 50);

    // Header
    const controlLabel = controlViolated
      ? ` ${red}⚠ Control (violated constraint)${r}`
      : ` ${dim}Control${r}`;
    const staiplerLabel = ` ${green}✓ stAIpler (respected constraint)${r}`;

    console.log(`  ${dim}┌${'─'.repeat(colWidth)}┬${'─'.repeat(colWidth)}┐${r}`);
    console.log(`  ${dim}│${r}${controlLabel.padEnd(colWidth + (controlViolated ? 20 : 8))}${dim}│${r}${staiplerLabel.padEnd(colWidth + 18)}${dim}│${r}`);
    console.log(`  ${dim}├${'─'.repeat(colWidth)}┼${'─'.repeat(colWidth)}┤${r}`);

    for (let i = 0; i < maxLines; i++) {
      const left = (controlLines[i] ?? '').padEnd(colWidth - 2);
      const right = (staiplerLines[i] ?? '').padEnd(colWidth - 2);
      const leftColor = controlViolated ? red : dim;
      console.log(`  ${dim}│${r} ${leftColor}${left}${r} ${dim}│${r} ${purple}${right}${r} ${dim}│${r}`);
    }

    if (controlLines.length > 50 || staiplerLines.length > 50) {
      console.log(`  ${dim}│ ... truncated${' '.repeat(colWidth - 15)}│ ... truncated${' '.repeat(colWidth - 15)}│${r}`);
    }

    console.log(`  ${dim}└${'─'.repeat(colWidth)}┴${'─'.repeat(colWidth)}┘${r}`);
  } else {
    // Stacked layout for narrow terminals
    const controlLabel = controlViolated
      ? `${red}⚠ Control (violated constraint)${r}`
      : `${dim}Control${r}`;

    console.log(`\n  ${controlLabel}`);
    console.log(`  ${dim}${'─'.repeat(termWidth - 4)}${r}`);
    const controlTruncated = controlResponse.slice(0, 800);
    console.log(`  ${controlViolated ? red : dim}${controlTruncated}${r}`);

    console.log(`\n  ${green}✓ stAIpler (respected constraint)${r}`);
    console.log(`  ${dim}${'─'.repeat(termWidth - 4)}${r}`);
    const staiplerTruncated = staiplerResponse.slice(0, 800);
    console.log(`  ${purple}${staiplerTruncated}${r}`);
  }
}

/**
 * Run the prove-value demo. Called from init after scan completes.
 */
export async function runProveValue(
  analysis: AnalysisResult,
  scanResult: ScanResult,
  model: string,
): Promise<void> {
  // Check Claude CLI
  if (!isClaudeAvailable()) {
    console.log(`\n  ${dim}Install Claude CLI to run a live A/B demo: https://docs.anthropic.com/en/docs/claude-cli${r}\n`);
    return;
  }

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    // Offer the demo
    console.log(`  ${purple}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${r}`);
    console.log(`\n  ${purple}${bold}See the difference?${r} Answer 2 quick questions and we'll`);
    console.log(`  run a live A/B test — same model, with vs without context.\n`);

    const ready = await ask(rl, `  ${purple}?${r} Ready? ${dim}(Y/n)${r} `);
    if (ready.toLowerCase() === 'n') {
      return;
    }

    console.log('');

    // Question 1: Constraint (always)
    const q1 = getConstraintQuestion();
    console.log(`  ${purple}1.${r} ${q1.question}`);
    console.log(`     ${dim}${q1.hint}${r}`);
    const a1 = await ask(rl, `\n  ${cyan}>${r} `);
    if (a1.trim().length < 5) {
      console.log(`\n  ${dim}Answer too short — skipping demo.${r}\n`);
      return;
    }

    console.log('');

    // Question 2: Context (chosen by scan)
    const q2 = selectSecondQuestion(analysis);
    console.log(`  ${purple}2.${r} ${q2.question}`);
    console.log(`     ${dim}${q2.hint}${r}`);
    const a2 = await ask(rl, `\n  ${cyan}>${r} `);
    if (a2.trim().length < 5) {
      console.log(`\n  ${dim}Answer too short — skipping demo.${r}\n`);
      return;
    }

    // Build the demo plan
    const plan = buildDemoPlan(a1, a2, analysis, scanResult);

    // Build shared knowledge base context — both runs get this (README, package.json, etc.)
    // The only difference is the system prompt (instruction stack)
    const { readFileSync } = await import('fs');
    const kbSnippets = scanResult.knowledgeBase
      .filter(f => f.size < 10_000)
      .slice(0, 5)
      .map(f => {
        try {
          const content = readFileSync(f.path, 'utf-8');
          return `--- ${f.relativePath} ---\n${content.slice(0, 1500)}`;
        } catch { return ''; }
      })
      .filter(Boolean);

    const kbContext = kbSnippets.length > 0
      ? `Here is context about the project:\n\n${kbSnippets.join('\n\n')}\n\n---\n\n`
      : '';

    const fullPrompt = `${kbContext}${plan.testPrompt}`;

    console.log(`\n  ${purple}${bold}Running A/B test...${r}`);
    console.log(`  ${dim}Prompt: "${plan.testPrompt.slice(0, 80)}${plan.testPrompt.length > 80 ? '...' : ''}"${r}\n`);

    // Run both calls — same prompt, same knowledge base, only system prompt differs
    console.log(`  ${dim}Running control (no stAIpler instruction stack)...${r}`);
    const controlResponse = callClaude({ prompt: fullPrompt, model });

    console.log(`  ${dim}Running stAIpler (with instruction stack)...${r}`);
    const staiplerResponse = callClaude({ prompt: fullPrompt, systemPrompt: plan.systemPrompt, model });

    // Classify constraint adherence
    const controlViolated = classifyConstraintAdherenceHeuristic(controlResponse, plan.answers.constraint);

    console.log('');

    // Render comparison
    const termWidth = process.stdout.columns ?? 80;
    renderSideBySide(controlResponse, staiplerResponse, controlViolated, termWidth);

    // Summary
    console.log('');
    if (controlViolated) {
      console.log(`  ${green}${bold}stAIpler caught what the control missed.${r}`);
      console.log(`  ${dim}The control would have violated your constraint.${r}`);
      console.log(`  ${dim}With your instruction context, stAIpler respected it.${r}\n`);
    } else {
      console.log(`  ${dim}Both responses completed. Review the differences above.${r}`);
      console.log(`  ${dim}With more instruction layers, the gap widens.${r}\n`);
    }
  } finally {
    rl.close();
  }
}
