import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { Asset, ContractDefinition, ContractResult } from './types.js';

export function loadContracts(contractDir: string): ContractDefinition[] {
  if (!existsSync(contractDir)) return [];

  const files = readdirSync(contractDir).filter(f => f.endsWith('.contract.yaml'));
  return files.map(f => {
    const content = readFileSync(join(contractDir, f), 'utf-8');
    return parseYaml(content) as ContractDefinition;
  });
}

export function evaluateContract(
  contract: ContractDefinition,
  assets: Asset[],
): ContractResult {
  const issues: string[] = [];

  // Match assets by tags
  const matched = assets.filter(asset => {
    const tags = asset.frontmatter.tags ?? [];
    const requiredTags = contract.applies_to.tags ?? [];
    return requiredTags.some(t => tags.includes(t));
  });

  // If no assets match, contract passes vacuously
  if (matched.length === 0) {
    return { contract: `user:${contract.name}`, passed: true, issues: [] };
  }

  // Check must_have_kinds
  if (contract.requires.must_have_kinds) {
    const presentKinds = new Set(matched.map(a => a.frontmatter.kind));
    for (const required of contract.requires.must_have_kinds) {
      if (!presentKinds.has(required)) {
        issues.push(`Missing required kind "${required}" in matched asset set`);
      }
    }
  }

  // Check all_must_declare
  if (contract.requires.all_must_declare?.compatibility) {
    const requiredModels = contract.requires.all_must_declare.compatibility.models;
    if (requiredModels) {
      for (const asset of matched) {
        const declared = asset.frontmatter.compatibility?.models ?? [];
        for (const model of requiredModels) {
          if (!declared.includes(model)) {
            issues.push(
              `Asset "${asset.frontmatter.id}" does not declare compatibility with model "${model}"`,
            );
          }
        }
      }
    }

    const requiredSurfaces = contract.requires.all_must_declare.compatibility.surfaces;
    if (requiredSurfaces) {
      for (const asset of matched) {
        const declared = asset.frontmatter.compatibility?.surfaces ?? [];
        for (const surface of requiredSurfaces) {
          if (!declared.includes(surface)) {
            issues.push(
              `Asset "${asset.frontmatter.id}" does not declare compatibility with surface "${surface}"`,
            );
          }
        }
      }
    }
  }

  return {
    contract: `user:${contract.name}`,
    passed: issues.length === 0,
    issues,
  };
}
