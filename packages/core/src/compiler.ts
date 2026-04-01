import { createHash } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { parse as parseYaml } from 'yaml';
import { StackDefinitionSchema, CANONICAL_SECTION_ORDER, REQUIRED_LAYER_TYPES, DEFAULT_MERGE_STRATEGIES } from './schema.js';
import { parseAssetFile } from './parser.js';
import { resolveAssetPath, resolveInheritanceTarget } from './resolver.js';
import { validateAssets } from './validator.js';
import { loadContracts, evaluateContract } from './contracts.js';
import { mergeAssets } from './merge.js';
import { CompileError } from './errors.js';
import type {
  Asset, CompiledBundle, CompiledSection, CompileWarning,
  ResolvedAssetInfo, ContractResult, StackDefinition, BuildConfig, LayerType,
} from './types.js';

export function compile(stackName: string, stacksDir: string, options?: { libraryDir?: string; contractsDir?: string }): CompiledBundle {
  // 1. Locate and parse stack
  const stackDir = resolve(stacksDir, stackName);
  const stackPath = join(stackDir, 'stack.yaml');
  const stackContent = readFileSync(stackPath, 'utf-8');
  const stackRaw = parseYaml(stackContent);
  const stackResult = StackDefinitionSchema.safeParse(stackRaw);
  if (!stackResult.success) {
    const issues = stackResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
    throw new CompileError(`Invalid stack definition: ${issues.join(', ')}`, 'INVALID_STACK');
  }
  const stackDef = stackResult.data;
  const buildConfig: BuildConfig = stackDef.build ?? {};

  // Determine library directory: explicit option > stack-local library > sibling library dir
  const effectiveLibraryDir = options?.libraryDir
    ?? (existsSync(resolve(stackDir, 'library')) ? resolve(stackDir, 'library') : resolve(stacksDir, 'library'));

  // 2. Resolve asset references
  const resolvedAssets: Asset[] = [];
  for (const ref of stackDef.includes) {
    const assetPath = resolveAssetPath(ref.asset, effectiveLibraryDir, stackDir);
    const content = readFileSync(assetPath, 'utf-8');
    const asset = parseAssetFile(assetPath, content);
    if (ref.priority !== undefined) {
      asset.frontmatter.priority = ref.priority;
    }
    resolvedAssets.push(asset);
  }

  // 3. Built-in validation (Layer 1) — collect all assets including inherited for validation
  const allAssets = [...resolvedAssets];

  // Resolve inheritance
  const inheritedAssets: Asset[] = [];
  for (const asset of resolvedAssets) {
    if (asset.frontmatter.inherits) {
      const parent = resolveInheritanceTarget(asset.frontmatter.inherits, effectiveLibraryDir);
      if (parent) {
        inheritedAssets.push(parent);
        allAssets.push(parent);
      }
    }
  }

  const builtinResult = validateAssets(allAssets);
  if (!builtinResult.passed) {
    throw new CompileError(builtinResult.issues.join('; '), 'VALIDATION_FAILED');
  }

  const contractResults: ContractResult[] = [builtinResult];

  // 4. User contract validation (Layer 2)
  const contractDir = resolve(stackDir, 'contract');
  const projectContractDir = options?.contractsDir ?? resolve(stacksDir, '..', 'contracts');
  const contracts = [
    ...loadContracts(contractDir),
    ...loadContracts(projectContractDir),
  ];
  for (const contract of contracts) {
    contractResults.push(evaluateContract(contract, allAssets));
  }

  // 5. Target filtering
  const warnings: CompileWarning[] = [];
  let filteredAssets = [...resolvedAssets];

  if (buildConfig.target?.modelFamily) {
    const targetModel = buildConfig.target.modelFamily;
    const excluded: Asset[] = [];
    filteredAssets = filteredAssets.filter(asset => {
      const models = asset.frontmatter.compatibility?.models;
      if (models && !models.includes(targetModel)) {
        excluded.push(asset);
        return false;
      }
      return true;
    });

    for (const asset of excluded) {
      warnings.push({
        code: 'FILTERED_ASSET',
        message: `Asset "${asset.frontmatter.id}" filtered: incompatible with target model "${targetModel}"`,
        asset: asset.frontmatter.id,
      });
    }

    // Critical layer protection
    for (const requiredKind of REQUIRED_LAYER_TYPES) {
      const hasKind = filteredAssets.some(a => a.frontmatter.kind === requiredKind);
      if (!hasKind) {
        throw new CompileError(
          `Target filter '${targetModel}' removed all '${requiredKind}' assets. The stack cannot compile without a ${requiredKind} layer.`,
          'CRITICAL_LAYER_REMOVED',
        );
      }
    }
  }

  // 6. Process inheritance
  const flatAssets: Asset[] = [];
  for (const asset of filteredAssets) {
    if (asset.frontmatter.inherits) {
      const parent = inheritedAssets.find(
        p => p.frontmatter.id === asset.frontmatter.inherits,
      );
      if (parent) {
        // Prepend parent body, child metadata wins
        const merged: Asset = {
          ...asset,
          body: `${parent.body}\n\n${asset.body}`,
        };
        flatAssets.push(merged);
      } else {
        flatAssets.push(asset);
      }
    } else {
      flatAssets.push(asset);
    }
  }

  // 7. Group + sort by kind
  const groups = new Map<LayerType, Asset[]>();
  for (const asset of flatAssets) {
    const kind = asset.frontmatter.kind;
    if (!groups.has(kind)) groups.set(kind, []);
    groups.get(kind)!.push(asset);
  }

  // 8. Apply merge per group
  const mergedGroups = new Map<LayerType, Asset[]>();
  for (const [kind, assets] of groups) {
    const strategy = buildConfig.merge?.[kind];
    mergedGroups.set(kind, mergeAssets(assets, strategy, kind));
  }

  // 9. Order sections canonically
  const sections: CompiledSection[] = [];
  const compileOrder: string[] = [];

  // Add inherited parents to compile order first
  for (const parent of inheritedAssets) {
    if (!compileOrder.includes(parent.frontmatter.id)) {
      compileOrder.push(parent.frontmatter.id);
    }
  }

  for (const kind of CANONICAL_SECTION_ORDER) {
    const assets = mergedGroups.get(kind);
    if (!assets) continue;
    for (const asset of assets) {
      sections.push({
        kind,
        id: asset.frontmatter.id,
        title: asset.frontmatter.title,
        priority: asset.frontmatter.priority,
        content: asset.body,
        runtimeInjectable: kind === 'memory',
      });
      if (!compileOrder.includes(asset.frontmatter.id)) {
        compileOrder.push(asset.frontmatter.id);
      }
    }
  }

  // 10. Assemble fullText
  const fullText = sections
    .map(s => `## ${s.title}\n\n${s.content}`)
    .join('\n\n');

  // 11. Compute provenance
  const hash = createHash('sha256').update(fullText).digest('hex');

  const resolvedAssetInfos: ResolvedAssetInfo[] = [
    ...filteredAssets.map(a => ({
      id: a.frontmatter.id,
      version: a.frontmatter.version,
      source: a.source,
      resolvedPath: a.resolvedPath,
      inherited: false,
    })),
    ...inheritedAssets.map(a => ({
      id: a.frontmatter.id,
      version: a.frontmatter.version,
      source: a.source,
      resolvedPath: a.resolvedPath,
      inherited: true,
    })),
  ];

  // 12. Return CompiledBundle
  return {
    stackId: stackDef.name,
    version: stackDef.version,
    compiledAt: new Date().toISOString(),
    hash,
    buildConfig,
    sections,
    fullText,
    resolvedAssets: resolvedAssetInfos,
    compileOrder,
    contractResults,
    warnings,
    metadata: {
      assetCount: sections.length,
      tokenEstimate: Math.ceil(fullText.length / 4),
      sources: resolvedAssetInfos.map(a => a.resolvedPath),
    },
  };
}
