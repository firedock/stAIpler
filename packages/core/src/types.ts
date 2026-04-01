// === LAYER TYPES ===
export type StaticLayerType = 'identity' | 'goals' | 'context' | 'constraints' |
                              'skills' | 'style' | 'examples' | 'tools';
export type RuntimeLayerType = 'memory';
export type LayerType = StaticLayerType | RuntimeLayerType;

export type MergeStrategy = 'concatenate' | 'last-wins';

// === ASSET (atomic unit) ===
export interface AssetFrontmatter {
  id: string;
  kind: LayerType;
  version: string;
  title: string;
  summary?: string;
  tags?: string[];
  compatibility?: {
    models?: string[];
    surfaces?: string[];
  };
  inputs?: string[];
  outputs?: string[];
  inherits?: string;
  priority: number;
  sources?: { type: string; ref: string }[];
}

export interface Asset {
  frontmatter: AssetFrontmatter;
  body: string;
  source: string;
  resolvedPath: string;
  format: 'native' | 'imported';
}

// === STACK (deployment recipe) ===
export interface AssetReference {
  asset: string;
  priority?: number;
}

export interface CompileTarget {
  modelFamily?: string;
  surface?: string;
  format?: string;
}

export interface BuildConfig {
  max_tokens?: number;
  merge?: Partial<Record<LayerType, MergeStrategy>>;
  target?: CompileTarget;
}

export interface StackDefinition {
  name: string;
  version: string;
  description: string;
  includes: AssetReference[];
  overrides?: Record<string, unknown>;
  build?: BuildConfig;
}

// === COMPILED BUNDLE (runtime artifact) ===
export interface CompiledBundle {
  stackId: string;
  version: string;
  compiledAt: string;
  hash: string;
  buildConfig: BuildConfig;

  sections: CompiledSection[];
  fullText: string;

  resolvedAssets: ResolvedAssetInfo[];
  compileOrder: string[];
  contractResults: ContractResult[];
  warnings: CompileWarning[];
  metadata: {
    assetCount: number;
    tokenEstimate: number;
    sources: string[];
  };
}

export interface ResolvedAssetInfo {
  id: string;
  version: string;
  source: string;
  resolvedPath: string;
  inherited: boolean;
}

export interface CompiledSection {
  kind: LayerType;
  id: string;
  title: string;
  priority: number;
  content: string;
  runtimeInjectable: boolean;
}

export interface ContractResult {
  contract: string;
  passed: boolean;
  issues: string[];
}

export interface CompileWarning {
  code: string;
  message: string;
  asset?: string;
}

// === USER CONTRACT (optional .contract.yaml) ===
export interface ContractDefinition {
  name: string;
  description: string;
  scope: 'asset-set';
  applies_to: {
    tags?: string[];
    kinds?: LayerType[];
  };
  requires: {
    must_have_kinds?: LayerType[];
    all_must_declare?: {
      compatibility?: {
        models?: string[];
        surfaces?: string[];
      };
    };
  };
}
