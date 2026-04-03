import { execSync } from 'child_process';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { compile } from '../compiler.js';
import type { EvalScenario } from './scenarios.js';
import { buildJudgePrompt, parseJudgeResponse } from './judge.js';
import type { JudgeResult } from './judge.js';

export interface EvalConfig {
  stackName: string;
  stacksDir: string;
  libraryDir: string;
  contractsDir: string;
  outputDir: string;
  model?: string;
  scenarios: EvalScenario[];
}

export interface EvalRunResult {
  config: {
    stackName: string;
    model: string;
    runAt: string;
  };
  scenarios: ScenarioRunResult[];
  aggregate: AggregateResult;
}

export interface ScenarioRunResult {
  scenario: EvalScenario;
  controlResponse: string;
  staiplerResponse: string;
  judge: JudgeResult;
}

export interface AggregateResult {
  controlAvg: Record<string, number>;
  staiplerAvg: Record<string, number>;
  controlOverall: number;
  staiplerOverall: number;
  wins: { control: number; staipler: number; tie: number };
  improvement: number; // percentage improvement
}

function callClaude(prompt: string, systemPrompt: string | null, model: string): string {
  const ts = Date.now();
  const tmpDir = '/tmp/staipler-eval';
  mkdirSync(tmpDir, { recursive: true });

  // Write prompt to file to avoid shell escaping issues
  const promptFile = resolve(tmpDir, `prompt-${ts}.txt`);
  writeFileSync(promptFile, prompt);

  let cmd: string;
  const cleanup: string[] = [promptFile];

  if (systemPrompt) {
    const sysFile = resolve(tmpDir, `sysprompt-${ts}.txt`);
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

function getCompiledSystemPrompt(
  stackName: string,
  stacksDir: string,
  libraryDir: string,
  contractsDir: string,
): string {
  const bundle = compile(stackName, stacksDir, { libraryDir, contractsDir });
  return bundle.fullText;
}

export async function runEval(config: EvalConfig): Promise<EvalRunResult> {
  const model = config.model ?? 'sonnet';
  const runAt = new Date().toISOString();

  // Compile the stack's system prompt
  console.log(`\nCompiling stack: ${config.stackName}...`);
  const systemPrompt = getCompiledSystemPrompt(
    config.stackName,
    config.stacksDir,
    config.libraryDir,
    config.contractsDir,
  );
  console.log(`System prompt compiled (${systemPrompt.length} chars)\n`);

  const scenarioResults: ScenarioRunResult[] = [];

  for (let i = 0; i < config.scenarios.length; i++) {
    const scenario = config.scenarios[i];
    console.log(`[${i + 1}/${config.scenarios.length}] ${scenario.name}`);

    // Run control (no system prompt)
    console.log('  Running control...');
    const controlResponse = callClaude(scenario.userMessage, null, model);

    // Run staipler (with compiled system prompt)
    console.log('  Running staipler...');
    const staiplerResponse = callClaude(scenario.userMessage, systemPrompt, model);

    // Judge (blind, shuffled order)
    console.log('  Judging...');
    const shuffle = Math.random() > 0.5;
    const labelOrder: ['control' | 'staipler', 'control' | 'staipler'] = shuffle
      ? ['staipler', 'control']
      : ['control', 'staipler'];
    const responseA = shuffle ? staiplerResponse : controlResponse;
    const responseB = shuffle ? controlResponse : staiplerResponse;

    const judgePrompt = buildJudgePrompt(
      scenario.name,
      scenario.description,
      scenario.userMessage,
      responseA,
      responseB,
    );

    const judgeRaw = callClaude(judgePrompt, null, model);
    let judgeResult: JudgeResult;
    try {
      judgeResult = parseJudgeResponse(judgeRaw, scenario.id, scenario.name, labelOrder);
    } catch (err) {
      console.error(`  Judge parse error, retrying...`);
      const retryRaw = callClaude(judgePrompt, null, model);
      judgeResult = parseJudgeResponse(retryRaw, scenario.id, scenario.name, labelOrder);
    }

    console.log(`  Winner: ${judgeResult.winner} (control: ${judgeResult.control.overall} | staipler: ${judgeResult.staipler.overall})`);

    scenarioResults.push({
      scenario,
      controlResponse,
      staiplerResponse,
      judge: judgeResult,
    });
  }

  // Compute aggregates
  const aggregate = computeAggregates(scenarioResults);

  return {
    config: { stackName: config.stackName, model, runAt },
    scenarios: scenarioResults,
    aggregate,
  };
}

function computeAggregates(results: ScenarioRunResult[]): AggregateResult {
  const dims = ['tone', 'accuracy', 'structure', 'safety', 'escalation', 'completeness'] as const;
  const controlAvg: Record<string, number> = {};
  const staiplerAvg: Record<string, number> = {};

  for (const dim of dims) {
    const controlScores = results.map(r => r.judge.control.dimensions[dim]);
    const staiplerScores = results.map(r => r.judge.staipler.dimensions[dim]);
    controlAvg[dim] = Math.round((controlScores.reduce((a, b) => a + b, 0) / controlScores.length) * 100) / 100;
    staiplerAvg[dim] = Math.round((staiplerScores.reduce((a, b) => a + b, 0) / staiplerScores.length) * 100) / 100;
  }

  const controlOverall = Math.round((results.reduce((a, r) => a + r.judge.control.overall, 0) / results.length) * 100) / 100;
  const staiplerOverall = Math.round((results.reduce((a, r) => a + r.judge.staipler.overall, 0) / results.length) * 100) / 100;

  const wins = { control: 0, staipler: 0, tie: 0 };
  for (const r of results) {
    wins[r.judge.winner]++;
  }

  const improvement = controlOverall > 0
    ? Math.round(((staiplerOverall - controlOverall) / controlOverall) * 10000) / 100
    : 0;

  return { controlAvg, staiplerAvg, controlOverall, staiplerOverall, wins, improvement };
}
