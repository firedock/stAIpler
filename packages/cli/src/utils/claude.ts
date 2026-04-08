import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export interface ClaudeCallOptions {
  prompt: string;
  systemPrompt?: string | null;
  model?: string;
}

/**
 * Call Claude via CLI with fixed settings for fair, repeatable comparisons.
 * Stays in CLI-only — provider execution does not belong in core.
 */
export function callClaude(opts: ClaudeCallOptions): string {
  const { prompt, systemPrompt = null, model = 'sonnet' } = opts;
  const ts = Date.now();
  const tmpDir = '/tmp/staipler-eval';
  mkdirSync(tmpDir, { recursive: true });

  const promptFile = resolve(tmpDir, `prompt-${ts}-${Math.random().toString(36).slice(2, 6)}.txt`);
  writeFileSync(promptFile, prompt);
  const cleanup: string[] = [promptFile];

  let cmd: string;
  if (systemPrompt) {
    const sysFile = resolve(tmpDir, `sys-${ts}-${Math.random().toString(36).slice(2, 6)}.txt`);
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

/**
 * Check if Claude CLI is available in PATH.
 */
export function isClaudeAvailable(): boolean {
  try {
    execSync('which claude', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
