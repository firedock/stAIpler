import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

export interface KpiSnapshot {
  timestamp: string;
  readinessScore: number;
  grade: string;
  layerScores: Record<string, number>;
  evalScore?: number;
  evalImprovement?: number;
  action: 'scan' | 'optimize' | 'eval';
  notes?: string;
}

export interface KpiHistory {
  projectName: string;
  snapshots: KpiSnapshot[];
}

const KPI_FILE = '.staipler/kpi.json';

export function getKpiPath(projectRoot: string): string {
  return resolve(projectRoot, KPI_FILE);
}

export function loadKpiHistory(projectRoot: string): KpiHistory {
  const path = getKpiPath(projectRoot);
  if (!existsSync(path)) {
    return { projectName: '', snapshots: [] };
  }
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function saveKpiSnapshot(
  projectRoot: string,
  snapshot: KpiSnapshot,
  projectName?: string,
): void {
  const dir = resolve(projectRoot, '.staipler');
  mkdirSync(dir, { recursive: true });

  const history = loadKpiHistory(projectRoot);
  if (projectName) history.projectName = projectName;
  history.snapshots.push(snapshot);
  writeFileSync(getKpiPath(projectRoot), JSON.stringify(history, null, 2));
}

export function getLatestSnapshot(projectRoot: string): KpiSnapshot | null {
  const history = loadKpiHistory(projectRoot);
  if (history.snapshots.length === 0) return null;
  return history.snapshots[history.snapshots.length - 1];
}

export function getScoreTrend(projectRoot: string, count: number = 10): { timestamps: string[]; scores: number[] } {
  const history = loadKpiHistory(projectRoot);
  const recent = history.snapshots.slice(-count);
  return {
    timestamps: recent.map(s => s.timestamp),
    scores: recent.map(s => s.readinessScore),
  };
}
