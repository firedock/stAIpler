import { existsSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';

export type ContinuitySortMode = 'date' | 'status' | 'thread';

export interface ContinuityConfig {
  /** Sort mode for the thread table rendered in the status block */
  sort: ContinuitySortMode;
  /** Max thread rows shown inline before deferring the rest to INDEX.md */
  inlineThreadCap: number;
  /** Days since the most recent handoff before a stale warning appears */
  staleThresholdDays: number;
}

export interface StaiplerConfig {
  /** Minimum readiness score for CI pass (0-100) */
  minScore: number;
  /** Required layers — CI fails if any are missing */
  requiredLayers: string[];
  /** Glob patterns to ignore during scan */
  ignore: string[];
  /** Output format for reports */
  report: 'compact' | 'full' | 'json';
  /** Agent file to inject status into */
  inject: string | null;
  /** Watch mode debounce in ms */
  watchDebounce: number;
  /** Continuity layer (session handoff) configuration */
  continuity: ContinuityConfig;
}

export const DEFAULT_CONTINUITY_CONFIG: ContinuityConfig = {
  sort: 'date',
  inlineThreadCap: 10,
  staleThresholdDays: 30,
};

const DEFAULT_CONFIG: StaiplerConfig = {
  minScore: 70,
  requiredLayers: ['identity', 'constraints'],
  ignore: [],
  report: 'compact',
  inject: null,
  watchDebounce: 300,
  continuity: { ...DEFAULT_CONTINUITY_CONFIG },
};

const CONFIG_FILE_NAMES = ['.staipler.json', 'staipler.json'];

/**
 * Find and load .staipler.json, merging with defaults.
 * Walks up from startDir to find the config file.
 */
export function loadConfig(startDir?: string): { config: StaiplerConfig; configPath: string | null } {
  const dir = resolve(startDir ?? process.cwd());
  const configPath = findConfigFile(dir);

  if (!configPath) {
    return { config: { ...DEFAULT_CONFIG }, configPath: null };
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8'));
    const config: StaiplerConfig = {
      ...DEFAULT_CONFIG,
      ...raw,
      continuity: {
        ...DEFAULT_CONTINUITY_CONFIG,
        ...(raw.continuity ?? {}),
      },
    };
    return { config, configPath };
  } catch {
    return { config: { ...DEFAULT_CONFIG, continuity: { ...DEFAULT_CONTINUITY_CONFIG } }, configPath };
  }
}

function findConfigFile(startDir: string): string | null {
  let dir = resolve(startDir);
  while (true) {
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export { DEFAULT_CONFIG };
