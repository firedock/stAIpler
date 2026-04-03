// @staipler/core - public API
export { compile as buildStack } from './compiler.js';
export { validateAssets as validateStack } from './validator.js';
export { parseAssetFile as parseAsset } from './parser.js';
export { loadContracts, evaluateContract } from './contracts.js';
export { resolveAssetPath, resolveInheritanceTarget, findProjectRoot } from './resolver.js';
export { mergeAssets } from './merge.js';

// Schemas
export {
  AssetFrontmatterSchema,
  StackDefinitionSchema,
  LAYER_TYPES,
  STATIC_LAYER_TYPES,
  RUNTIME_LAYER_TYPES,
  REQUIRED_LAYER_TYPES,
  DEFAULT_MERGE_STRATEGIES,
  CANONICAL_SECTION_ORDER,
} from './schema.js';

// Adapters
export { nativeAdapter } from './adapters/native.js';
export { skillAdapter } from './adapters/skill.js';
export { copilotAdapter } from './adapters/copilot.js';
export type { Adapter } from './adapters/index.js';

// Types
export type {
  Asset,
  AssetFrontmatter,
  AssetReference,
  BuildConfig,
  CompileTarget,
  CompiledBundle,
  CompiledSection,
  CompileWarning,
  ContractDefinition,
  ContractResult,
  LayerType,
  MergeStrategy,
  ResolvedAssetInfo,
  StackDefinition,
  StaticLayerType,
  RuntimeLayerType,
} from './types.js';

// Eval
export {
  CUSTOMER_SUPPORT_SCENARIOS,
  runEval,
  generateReport,
  SCORING_DIMENSIONS,
} from './eval/index.js';
export type {
  EvalScenario,
  EvalConfig,
  EvalRunResult,
  ScenarioRunResult,
  AggregateResult,
  JudgeResult,
  ScoreResult,
} from './eval/index.js';

// Optimizer
export {
  scan,
  analyze,
  createPlan,
  optimize,
  loadKpiHistory,
  saveKpiSnapshot,
  getLatestSnapshot,
  getScoreTrend,
  generateDemoReport,
  generateDashboard,
  FILE_TYPES,
  CATEGORY_INFO,
  CLASS_INFO,
  getFileTypeInfo,
  getFileTypesByCategory,
  getFileTypesByClass,
} from './optimizer/index.js';
export type {
  ScannedFile,
  ScanResult,
  AnalysisResult,
  LayerAnalysis,
  OptimizationPlan,
  LayerPlan,
  OptimizedAsset,
  OptimizationResult,
  KpiSnapshot,
  KpiHistory,
  DashboardData,
  FileTypeInfo,
  FileCategory,
  FileClass,
} from './optimizer/index.js';

// Errors
export {
  StaiplerError,
  ParseError,
  ResolveError,
  ValidationError,
  CompileError,
} from './errors.js';
