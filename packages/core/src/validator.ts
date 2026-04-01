import type { Asset, ContractResult } from './types.js';

export function validateAssets(assets: Asset[]): ContractResult {
  const issues: string[] = [];
  const assetMap = new Map(assets.map(a => [a.frontmatter.id, a]));

  for (const asset of assets) {
    const { inherits, id } = asset.frontmatter;
    if (!inherits) continue;

    // Check target exists
    if (!assetMap.has(inherits)) {
      issues.push(`Asset "${id}" inherits from "${inherits}" which was not found in the asset set`);
      continue;
    }

    // Check for circular inheritance
    const visited = new Set<string>([id]);
    let current = inherits;
    let depth = 1;
    while (current) {
      if (visited.has(current)) {
        issues.push(`Circular inheritance detected: ${[...visited, current].join(' -> ')}`);
        break;
      }
      visited.add(current);
      depth++;

      if (depth > 2) {
        issues.push(`Max inheritance depth of 2 exceeded for "${id}" (depth: ${depth})`);
        break;
      }

      const parent = assetMap.get(current);
      current = parent?.frontmatter.inherits ?? '';
      if (!current) break;
    }
  }

  return {
    contract: 'builtin:schema',
    passed: issues.length === 0,
    issues,
  };
}
