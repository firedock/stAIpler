import { existsSync, readFileSync } from 'fs';
import { resolve, join, dirname } from 'path';

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
}

const DEFAULT_CONFIG: StaiplerConfig = {
  minScore: 70,
  requiredLayers: ['identity', 'constraints'],
  ignore: [],
  report: 'compact',
  inject: null,
  watchDebounce: 300,
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
    };
    return { config, configPath };
  } catch {
    return { config: { ...DEFAULT_CONFIG }, configPath };
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
