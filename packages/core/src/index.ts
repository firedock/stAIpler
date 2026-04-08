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
  selectSecondQuestion,
  getConstraintQuestion,
  sanitizeAnswer,
  synthesizeTestPrompt,
  buildDemoSystemPrompt,
  buildDemoPlan,
  extractSynthesisContext,
  buildSynthesisPrompt,
  parseSynthesisResponse,
  getFallbackScenarios,
  buildBenchmarkJudgePrompt,
  parseBenchmarkJudgeResponse,
  runBenchmarkEval,
} from './eval/index.js';
export type {
  EvalScenario,
  EvalConfig,
  EvalRunResult,
  ScenarioRunResult,
  AggregateResult,
  JudgeResult,
  ScoreResult,
  DemoQuestion,
  DemoAnswers,
  DemoPlan,
  SynthesizedScenario,
  SynthesisContext,
  BenchmarkEvalConfig,
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
  generateStatusBlock,
  findInjectTarget,
  injectStatus,
} from './optimizer/index.js';
export type {
  ScannedFile,
  ScanResult,
  KnowledgeFile,
  MemoryProvider,
  Suggestion,
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

// Memory Platform
export {
  buildMemoryGraph,
  addRetrievalEvent,
  attributeRetrieval,
  LAYER_COLORS,
  SOURCE_COLORS,
} from './memory/index.js';
export type {
  MemorySourceType,
  MemoryNode,
  MemoryCluster,
  MemoryLink,
  MemoryGraph,
  MemoryStats,
  ClusterType,
  RetrievalEvent,
  RetrievalReason,
} from './memory/index.js';

// Config
export { loadConfig, DEFAULT_CONFIG } from './config.js';
export type { StaiplerConfig } from './config.js';

// Errors
export {
  StaiplerError,
  ParseError,
  ResolveError,
  ValidationError,
  CompileError,
} from './errors.js';
