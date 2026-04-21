import { z } from 'zod';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';
import { parse as parseYaml } from 'yaml';
import type { FailureCategory } from './failure-taxonomy.js';

export const BENCHMARK_CATEGORIES = [
  'architecture-compliance',
  'constraint-obedience',
  'context-retention',
  'project-adaptation',
  'handoff-quality',
] as const;
export type BenchmarkCategory = (typeof BENCHMARK_CATEGORIES)[number];

export type BenchmarkMode = 'baseline' | 'staipler';
export type WorkspaceSource = 'fixture' | 'current_repo_snapshot';
export type NetworkPolicy = 'none' | 'allowlist';

const ScoringTag = z.enum(['deterministic', 'judge_assisted']);

const SeedFileSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const baseRequirement = {
  id: z.string().min(1),
  description: z.string().min(1),
};

export const RequirementSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('text_contains'),
    ...baseRequirement,
    target: z.enum(['stdout', 'stderr', 'transcript']).default('stdout'),
    value: z.string().min(1),
    case_sensitive: z.boolean().default(true),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('text_absent'),
    ...baseRequirement,
    target: z.enum(['stdout', 'stderr', 'transcript']).default('stdout'),
    value: z.string().min(1),
    case_sensitive: z.boolean().default(true),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('text_matches'),
    ...baseRequirement,
    target: z.enum(['stdout', 'stderr', 'transcript']).default('stdout'),
    pattern: z.string().min(1),
    flags: z.string().default(''),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('file_exists'),
    ...baseRequirement,
    path: z.string().min(1),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('file_absent'),
    ...baseRequirement,
    path: z.string().min(1),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('file_contains'),
    ...baseRequirement,
    path: z.string().min(1),
    value: z.string().min(1),
    case_sensitive: z.boolean().default(true),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('no_edit_outside'),
    ...baseRequirement,
    allowed_globs: z.array(z.string().min(1)).min(1),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('allowed_edit_globs'),
    ...baseRequirement,
    globs: z.array(z.string().min(1)).min(1),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('workspace_diff_matches'),
    ...baseRequirement,
    pattern: z.string().min(1),
    flags: z.string().default(''),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('workspace_diff_absent'),
    ...baseRequirement,
    pattern: z.string().min(1),
    flags: z.string().default(''),
    scoring: ScoringTag.default('deterministic'),
  }),
  z.object({
    type: z.literal('llm_judge'),
    ...baseRequirement,
    rubric: z.string().min(1),
    pass_threshold: z.number().min(0).max(1).default(0.7),
    scoring: ScoringTag.default('judge_assisted'),
  }),
]);
export type Requirement = z.infer<typeof RequirementSchema>;

export const BenchmarkTaskSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  category: z.enum(BENCHMARK_CATEGORIES),
  workspace_source: z.enum(['fixture', 'current_repo_snapshot']),
  description: z.string().min(1),
  input: z.object({
    prompt: z.string().min(1),
    files: z.array(SeedFileSchema).default([]),
    setup: z.string().optional(),
  }),
  requirements: z.array(RequirementSchema).min(1),
  timeout_seconds: z.number().int().positive().max(3600).default(180),
  network: z.enum(['none', 'allowlist']).default('none'),
  network_allowlist: z.array(z.string()).default([]),
});
export type BenchmarkTask = z.infer<typeof BenchmarkTaskSchema>;

export interface RequirementResult {
  requirement_id: string;
  requirement_type: Requirement['type'];
  scoring: 'deterministic' | 'judge_assisted';
  passed: boolean;
  detail?: string;
}

export interface TaskArtifactPaths {
  transcript_path: string;
  stdout_path: string;
  stderr_path: string;
  workspace_diff_path: string;
}

export interface TaskRunResult {
  task_id: string;
  category: BenchmarkCategory;
  mode: BenchmarkMode;
  pass: boolean;
  deterministic_pass: boolean;
  judge_assisted_pass: boolean | null;
  elapsed_ms: number;
  exit_code: number | null;
  token_usage: number | null;
  cost_usd: number | null;
  failure_category: FailureCategory | null;
  requirement_results: RequirementResult[];
  artifacts: TaskArtifactPaths;
}

export function loadTask(path: string): BenchmarkTask {
  const raw = readFileSync(path, 'utf-8');
  const parsed = parseYaml(raw);
  return BenchmarkTaskSchema.parse(parsed);
}

export function loadDataset(dir: string): BenchmarkTask[] {
  const tasks: BenchmarkTask[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current).sort()) {
      const full = join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith('.yml') || entry.endsWith('.yaml')) {
        if (entry === 'manifest.yml' || entry === 'manifest.yaml') continue;
        tasks.push(loadTask(full));
      }
    }
  };
  walk(resolve(dir));
  return tasks.sort((a, b) => a.id.localeCompare(b.id));
}
