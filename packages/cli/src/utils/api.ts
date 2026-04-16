import type { CliConfig } from './config.js';

export interface PlanFile {
  layer: string;
  filename: string;
  content: string;
  status: 'source-grounded' | 'ai-generated' | 'mixed';
  sourceCount: number;
}

export interface PlanResponse {
  project: {
    id: string;
    name: string;
    readinessScore: number;
    grade: string;
  };
  files: PlanFile[];
  gaps: string[];
  conflicts: any[];
  systemPrompt: string;
  bundleHash: string | null;
  message?: string;
}

export async function fetchPlan(config: CliConfig, projectId: string): Promise<PlanResponse> {
  const url = `${config.apiUrl.replace(/\/$/, '')}/api/cli/plan?projectId=${encodeURIComponent(projectId)}`;
  const res = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${config.token}`,
      'Accept': 'application/json',
    },
  });

  if (res.status === 401) {
    throw new Error('CLI token is invalid or expired. Run `staipler login --token <new-token>` after generating a fresh token at staipler.com.');
  }
  if (res.status === 403) {
    throw new Error('Your token does not grant access to this project. Make sure the project belongs to the same account.');
  }
  if (res.status === 404) {
    throw new Error('Project not found. Double-check the project ID from your dashboard URL.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error ?? ''; } catch {}
    throw new Error(`Plan fetch failed (${res.status}): ${detail || res.statusText}`);
  }

  return await res.json() as PlanResponse;
}
