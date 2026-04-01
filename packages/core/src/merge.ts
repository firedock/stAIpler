import type { Asset, LayerType, MergeStrategy } from './types.js';
import { DEFAULT_MERGE_STRATEGIES } from './schema.js';

export function mergeAssets(
  assets: Asset[],
  strategy?: MergeStrategy,
  kind?: LayerType,
): Asset[] {
  const effectiveStrategy = strategy ?? (kind ? DEFAULT_MERGE_STRATEGIES[kind] : 'concatenate');

  // Sort by priority ascending (lower = base, higher = override)
  const sorted = [...assets].sort((a, b) => {
    const pDiff = a.frontmatter.priority - b.frontmatter.priority;
    if (pDiff !== 0) return pDiff;
    // Tie-break by ID alphabetically (last wins)
    return a.frontmatter.id.localeCompare(b.frontmatter.id);
  });

  if (effectiveStrategy === 'last-wins') {
    return [sorted[sorted.length - 1]];
  }

  return sorted;
}
