import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'fs';
import { homedir } from 'os';
import { resolve, dirname } from 'path';

/**
 * CLI auth/config stored at ~/.staipler/auth.json
 *
 * Schema:
 *   {
 *     "apiUrl": "https://staipler.com",
 *     "token": "stp_...",
 *     "savedAt": "2026-04-15T..."
 *   }
 *
 * The file is chmod 600 so only the owner can read it.
 */

export interface CliConfig {
  apiUrl: string;
  token: string;
  savedAt: string;
}

const DEFAULT_API_URL = process.env.STAIPLER_API_URL || 'https://staipler.com';
const CONFIG_PATH = resolve(homedir(), '.staipler', 'auth.json');

export function loadConfig(): CliConfig | null {
  // Env-var override always wins (useful for CI)
  const envToken = process.env.STAIPLER_TOKEN;
  if (envToken) {
    return {
      apiUrl: DEFAULT_API_URL,
      token: envToken,
      savedAt: new Date().toISOString(),
    };
  }

  if (!existsSync(CONFIG_PATH)) return null;

  try {
    const raw = readFileSync(CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as CliConfig;
    if (!parsed.token || !parsed.apiUrl) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveConfig(config: { apiUrl?: string; token: string }): void {
  const dir = dirname(CONFIG_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const payload: CliConfig = {
    apiUrl: config.apiUrl || DEFAULT_API_URL,
    token: config.token,
    savedAt: new Date().toISOString(),
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(payload, null, 2));
  // Restrict to owner only — token is a credential
  try { chmodSync(CONFIG_PATH, 0o600); } catch { /* not all platforms support chmod */ }
}

export function configPath(): string {
  return CONFIG_PATH;
}
