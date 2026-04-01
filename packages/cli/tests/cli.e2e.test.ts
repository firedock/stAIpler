import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { resolve, join } from 'path';
import { existsSync, unlinkSync } from 'fs';

const projectRoot = resolve(import.meta.dirname, '../../..');
const cli = resolve(projectRoot, 'packages/cli/dist/index.js');

function run(args: string): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execSync(`node ${cli} ${args}`, {
      cwd: projectRoot,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (err: any) {
    return {
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
      exitCode: err.status ?? 1,
    };
  }
}

describe('CLI build command', () => {
  it('builds with JSON output (default)', () => {
    const { stdout, exitCode } = run('build customer-support');
    expect(exitCode).toBe(0);
    const bundle = JSON.parse(stdout);
    expect(bundle.stackId).toBe('customer-support');
    expect(bundle.hash).toBeTruthy();
    expect(bundle.sections.length).toBeGreaterThan(0);
    expect(bundle.resolvedAssets.length).toBeGreaterThan(0);
    expect(bundle.compileOrder.length).toBeGreaterThan(0);
    expect(bundle.contractResults.length).toBeGreaterThan(0);
  });

  it('builds with text output', () => {
    const { stdout, exitCode } = run('build customer-support --format text');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('## Core Identity');
    expect(stdout).not.toContain('"stackId"');
  });

  it('builds with markdown output', () => {
    const { stdout, exitCode } = run('build customer-support --format markdown');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('## Core Identity');
  });

  it('writes to --out file', () => {
    const outPath = join(projectRoot, '.output', 'test-output.json');
    execSync(`mkdir -p ${resolve(projectRoot, '.output')}`, { cwd: projectRoot });
    const { exitCode } = run(`build customer-support --out ${outPath}`);
    expect(exitCode).toBe(0);
    expect(existsSync(outPath)).toBe(true);
    unlinkSync(outPath);
  });

  it('fails for nonexistent stack', () => {
    const { exitCode, stderr } = run('build nonexistent-stack');
    expect(exitCode).toBe(1);
    expect(stderr).toBeTruthy();
  });

  it('output has provenance', () => {
    const { stdout } = run('build customer-support');
    const bundle = JSON.parse(stdout);
    expect(bundle.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(bundle.resolvedAssets.length).toBeGreaterThan(0);
    expect(bundle.compileOrder.length).toBeGreaterThan(0);
  });

  it('output has contractResults', () => {
    const { stdout } = run('build customer-support');
    const bundle = JSON.parse(stdout);
    expect(Array.isArray(bundle.contractResults)).toBe(true);
    expect(bundle.contractResults.length).toBeGreaterThan(0);
  });

  it('builds code-reviewer stack', () => {
    const { stdout, exitCode } = run('build code-reviewer');
    expect(exitCode).toBe(0);
    const bundle = JSON.parse(stdout);
    expect(bundle.stackId).toBe('code-reviewer');
  });
});

describe('CLI validate command', () => {
  it('validates specific stack', () => {
    const { stdout, exitCode } = run('validate customer-support');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('customer-support');
    expect(stdout).toContain('valid');
  });

  it('validates all stacks', () => {
    const { stdout, exitCode } = run('validate');
    expect(exitCode).toBe(0);
    expect(stdout).toContain('customer-support');
    expect(stdout).toContain('code-reviewer');
  });

  it('distinguishes builtin vs user contracts', () => {
    const { stdout } = run('validate customer-support');
    expect(stdout).toContain('builtin:');
    expect(stdout).toContain('user:');
  });
});
