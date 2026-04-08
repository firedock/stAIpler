import { z } from 'zod';
import type { LayerType, MergeStrategy } from './types.js';

// === Constants ===

export const STATIC_LAYER_TYPES = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'policies', 'prompts',
  'skills', 'style', 'tools',
] as const;

export const RUNTIME_LAYER_TYPES = ['memory'] as const;

/** All layer types in alphabetical order */
export const LAYER_TYPES: LayerType[] = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

export const REQUIRED_LAYER_TYPES: LayerType[] = ['identity', 'constraints'];

export const DEFAULT_MERGE_STRATEGIES: Record<LayerType, MergeStrategy> = {
  identity: 'last-wins',
  goals: 'concatenate',
  context: 'concatenate',
  constraints: 'concatenate',
  skills: 'concatenate',
  style: 'last-wins',
  examples: 'concatenate',
  tools: 'concatenate',
  policies: 'concatenate',
  evals: 'concatenate',
  prompts: 'concatenate',
  memory: 'concatenate',
};

// === Canonical section order (alphabetical) ===
export const CANONICAL_SECTION_ORDER: LayerType[] = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

// === Zod Schemas ===

const semverRegex = /^\d+\.\d+\.\d+(?:-[\w.]+)?(?:\+[\w.]+)?$/;

const LayerTypeSchema = z.enum([
  'identity', 'goals', 'context', 'constraints',
  'skills', 'style', 'examples', 'tools',
  'policies', 'evals', 'prompts', 'memory',
]);

const MergeStrategySchema = z.enum(['concatenate', 'last-wins']);

const CompatibilitySchema = z.object({
  models: z.array(z.string()).optional(),
  surfaces: z.array(z.string()).optional(),
}).optional();

const SourceSchema = z.object({
  type: z.string(),
  ref: z.string(),
});

export const AssetFrontmatterSchema = z.object({
  id: z.string().min(1),
  kind: LayerTypeSchema,
  version: z.string().regex(semverRegex, 'Must be valid semver (e.g. 1.0.0)'),
  title: z.string().min(1),
  summary: z.string().optional(),
  tags: z.array(z.string()).optional(),
  compatibility: CompatibilitySchema,
  inputs: z.array(z.string()).optional(),
  outputs: z.array(z.string()).optional(),
  inherits: z.string().optional(),
  priority: z.number().int().min(0).max(100).default(50),
  sources: z.array(SourceSchema).optional(),
});

const AssetReferenceSchema = z.object({
  asset: z.string().min(1),
  priority: z.number().int().min(0).max(100).optional(),
});

const CompileTargetSchema = z.object({
  modelFamily: z.string().optional(),
  surface: z.string().optional(),
  format: z.string().optional(),
});

const BuildConfigSchema = z.object({
  max_tokens: z.number().int().positive().optional(),
  merge: z.record(LayerTypeSchema, MergeStrategySchema).optional(),
  target: CompileTargetSchema.optional(),
});

export const StackDefinitionSchema = z.object({
  name: z.string().min(1),
  version: z.string().regex(semverRegex, 'Must be valid semver'),
  description: z.string().min(1),
  includes: z.array(AssetReferenceSchema).min(1),
  overrides: z.record(z.unknown()).optional(),
  build: BuildConfigSchema.optional(),
});
