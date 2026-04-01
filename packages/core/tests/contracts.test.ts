import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import { readFileSync } from 'fs';
import { parseAssetFile } from '../src/parser.js';
import { loadContracts, evaluateContract } from '../src/contracts.js';

const fixturesDir = resolve(import.meta.dirname, 'fixtures');

function loadAsset(fixturePath: string) {
  const content = readFileSync(fixturePath, 'utf-8');
  return parseAssetFile(fixturePath, content);
}

describe('loadContracts', () => {
  it('loads valid contract YAML', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    expect(contracts).toHaveLength(1);
    expect(contracts[0].name).toBe('support-agent');
    expect(contracts[0].scope).toBe('asset-set');
  });

  it('returns empty array for missing directory', () => {
    const contracts = loadContracts('/nonexistent/path');
    expect(contracts).toEqual([]);
  });
});

describe('evaluateContract', () => {
  it('passes when must_have_kinds are met', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    const assets = [
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/skills.md')),
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/context.md')),
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/constraints.md')),
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/core/identity.md')),
    ];

    const result = evaluateContract(contracts[0], assets);
    expect(result.passed).toBe(true);
    expect(result.contract).toBe('user:support-agent');
  });

  it('fails when must_have_kinds are missing', () => {
    const contractDir = resolve(fixturesDir, 'contract-fail/contract');
    const contracts = loadContracts(contractDir);
    const assets = [
      loadAsset(resolve(fixturesDir, 'contract-fail/library/support/skills.md')),
      loadAsset(resolve(fixturesDir, 'contract-fail/library/support/context.md')),
    ];

    const result = evaluateContract(contracts[0], assets);
    expect(result.passed).toBe(false);
    expect(result.issues.some(i => /constraints/i.test(i))).toBe(true);
  });

  it('passes all_must_declare when all matched assets comply', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    const assets = [
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/skills.md')),
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/context.md')),
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/support/constraints.md')),
    ];

    const result = evaluateContract(contracts[0], assets);
    expect(result.passed).toBe(true);
  });

  it('fails all_must_declare when asset lacks compatibility', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    // Use assets from contract-fail which don't declare compatibility
    const assets = [
      loadAsset(resolve(fixturesDir, 'contract-fail/library/support/skills.md')),
      loadAsset(resolve(fixturesDir, 'contract-fail/library/support/context.md')),
    ];

    const result = evaluateContract(contracts[0], assets);
    expect(result.passed).toBe(false);
  });

  it('passes vacuously when no assets match', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    // identity asset has tag [core], not [support]
    const assets = [
      loadAsset(resolve(fixturesDir, 'contracted-stack/library/core/identity.md')),
    ];

    const result = evaluateContract(contracts[0], assets);
    expect(result.passed).toBe(true);
  });

  it('prefixes result with user:', () => {
    const contractDir = resolve(fixturesDir, 'contracted-stack/contract');
    const contracts = loadContracts(contractDir);
    const result = evaluateContract(contracts[0], []);
    expect(result.contract).toMatch(/^user:/);
  });
});
