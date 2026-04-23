import type { ScanResult, ScannedFile } from './scanner.js';
import { parseHandoffDate } from './scanner.js';
import type { LayerType } from '../types.js';
import { LAYER_TYPES, REQUIRED_LAYER_TYPES } from '../schema.js';

export interface LayerAnalysis {
  kind: LayerType;
  status: 'present' | 'weak' | 'missing';
  /** How important this layer is (critical, recommended, optional) */
  importance: 'critical' | 'recommended' | 'optional';
  files: ScannedFile[];
  /** Human-readable diagnosis */
  diagnosis: string;
  /** What the optimizer should do */
  recommendation: string;
  /** Quality score 0-100 (0 = missing, 1-40 = weak, 41-100 = present) */
  qualityScore: number;
}

export interface AnalysisResult {
  /** Overall readiness score 0-100 */
  readinessScore: number;
  /** Grade letter */
  grade: string;
  /** Layer-by-layer analysis */
  layers: LayerAnalysis[];
  /** Critical issues that must be fixed */
  criticalIssues: string[];
  /** Recommended improvements */
  recommendations: string[];
  /** Summary for display */
  summary: string;
  /** Raw scan data */
  scan: ScanResult;
}

const LAYER_IMPORTANCE: Record<LayerType, 'critical' | 'recommended' | 'optional'> = {
  identity: 'critical',
  constraints: 'critical',
  context: 'recommended',
  skills: 'recommended',
  goals: 'recommended',
  style: 'recommended',
  policies: 'recommended',
  examples: 'optional',
  tools: 'optional',
  evals: 'optional',
  prompts: 'optional',
  memory: 'optional',
  continuity: 'recommended',
};

const LAYER_DESCRIPTIONS: Record<LayerType, { when_missing: string; when_weak: string; recommendation: string }> = {
  identity: {
    when_missing: 'No identity layer found. The model has no defined persona or role.',
    when_weak: 'Identity layer exists but is vague or generic. The model may behave inconsistently.',
    recommendation: 'Define who the AI is, its role, and its core personality.',
  },
  goals: {
    when_missing: 'No goals defined. The model has no clear objectives to optimize for.',
    when_weak: 'Goals exist but are vague or too broad.',
    recommendation: 'Define specific, measurable objectives the AI should pursue.',
  },
  context: {
    when_missing: 'No context provided. The model lacks domain knowledge for your use case.',
    when_weak: 'Context exists but may be incomplete or outdated.',
    recommendation: 'Provide domain-specific knowledge, environment details, and relevant background.',
  },
  constraints: {
    when_missing: 'No constraints defined. The model has no guardrails or safety rules.',
    when_weak: 'Constraints exist but may have gaps in coverage.',
    recommendation: 'Define what the AI must never do, safety policies, and behavioral boundaries.',
  },
  skills: {
    when_missing: 'No skills defined. The model has no task-specific capabilities described.',
    when_weak: 'Skills exist but may lack detail on process or edge cases.',
    recommendation: 'Define specific capabilities, workflows, and decision-making processes.',
  },
  style: {
    when_missing: 'No style guide. Response formatting and tone are undefined.',
    when_weak: 'Style guidance exists but is minimal.',
    recommendation: 'Define communication tone, formatting preferences, and response structure.',
  },
  examples: {
    when_missing: 'No examples provided. The model has no reference for ideal outputs.',
    when_weak: 'Examples exist but may not cover key scenarios.',
    recommendation: 'Add examples of ideal responses for common and edge-case scenarios.',
  },
  tools: {
    when_missing: 'No tool definitions. (This is fine if tools are not needed.)',
    when_weak: 'Tool definitions exist but may be incomplete.',
    recommendation: 'Define available tools, their parameters, and when to use them.',
  },
  policies: {
    when_missing: 'No policies defined. Compliance and organizational rules are not separated from constraints.',
    when_weak: 'Policies exist but may lack coverage of compliance, legal, or brand requirements.',
    recommendation: 'Define compliance, trust, legal, brand, or safety rules distinct from operational constraints.',
  },
  evals: {
    when_missing: 'No evaluation criteria. (This is fine until you need to measure performance.)',
    when_weak: 'Evaluation criteria exist but may not cover key scenarios.',
    recommendation: 'Define test cases, assertions, or acceptance criteria for your agent.',
  },
  prompts: {
    when_missing: 'No reusable prompt templates. (This is fine for simple use cases.)',
    when_weak: 'Prompt templates exist but may be untested or incomplete.',
    recommendation: 'Define reusable prompt fragments and tested instruction snippets.',
  },
  memory: {
    when_missing: 'No memory layer. (This is fine for stateless interactions.)',
    when_weak: 'Memory layer exists but placeholder content may need updating.',
    recommendation: 'Define runtime memory injection points for session/user context.',
  },
  continuity: {
    when_missing: 'No session handoffs recorded. New agent sessions start cold without context from prior work.',
    when_weak: 'Handoffs exist but are stale — the latest is more than 30 days old, so it likely no longer reflects reality.',
    recommendation: 'Run the /handoff skill at the end of each working session to record a handoff under docs/handoffs/ so the next agent can pick up cleanly.',
  },
};

/**
 * Continuity is scored by presence + freshness of the most recent handoff
 * + chain length (sustained discipline), not by content richness.
 *
 * The filename carries a YYYY-MM-DD date prefix; we derive age from that rather
 * than file mtime so handoffs copied between machines still score correctly.
 */
function scoreContinuityLayer(files: ScannedFile[], now: Date = new Date()): number {
  if (files.length === 0) return 0;

  const datedFiles = files
    .map(f => ({ file: f, date: parseHandoffDate(f.name) }))
    .filter((x): x is { file: ScannedFile; date: Date } => x.date !== null);

  if (datedFiles.length === 0) {
    // Handoffs exist but none has a parseable date prefix — treat as weak presence.
    return 30;
  }

  const mostRecent = datedFiles.reduce((a, b) => (a.date > b.date ? a : b));
  const ageDays = Math.max(0, Math.floor((now.getTime() - mostRecent.date.getTime()) / 86_400_000));

  let score = 40; // Base for at least one dated handoff

  // Freshness of most recent handoff
  if (ageDays <= 7) score += 30;
  else if (ageDays <= 14) score += 20;
  else if (ageDays <= 30) score += 10;
  // >30 days → no freshness bonus

  // Chain length — sustained discipline across sessions
  if (datedFiles.length >= 2) score += 15;
  if (datedFiles.length >= 5) score += 10;

  return Math.min(100, score);
}

function scoreLayer(kind: LayerType, files: ScannedFile[]): number {
  if (kind === 'continuity') return scoreContinuityLayer(files);

  if (files.length === 0) return 0;

  let score = 30; // Base score for having any content

  // Content richness (more content = better, up to a point)
  const totalChars = files.reduce((s, f) => s + f.contentLength, 0);
  if (totalChars > 200) score += 15;
  if (totalChars > 500) score += 10;
  if (totalChars > 1000) score += 10;

  // Native stAIpler format bonus
  const hasNative = files.some(f => f.parsedAsset !== null);
  if (hasNative) score += 15;

  // High confidence inference
  const avgConfidence = files.reduce((s, f) => s + f.inferredConfidence, 0) / files.length;
  score += Math.round(avgConfidence * 20);

  return Math.min(100, score);
}

function getGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export function analyze(scanResult: ScanResult): AnalysisResult {
  const layers: LayerAnalysis[] = [];
  const criticalIssues: string[] = [];
  const recommendations: string[] = [];

  for (const kind of LAYER_TYPES) {
    const files = scanResult.byKind[kind] ?? [];
    const qualityScore = scoreLayer(kind, files);
    const importance = LAYER_IMPORTANCE[kind];
    const desc = LAYER_DESCRIPTIONS[kind];

    let status: 'present' | 'weak' | 'missing';
    let diagnosis: string;
    let recommendation: string;

    if (files.length === 0) {
      status = 'missing';
      diagnosis = desc.when_missing;
      recommendation = desc.recommendation;

      if (importance === 'critical') {
        criticalIssues.push(`Missing critical layer: ${kind} — ${desc.when_missing}`);
      } else if (importance === 'recommended') {
        recommendations.push(`Add ${kind} layer — ${desc.recommendation}`);
      }
    } else if (qualityScore < 40) {
      status = 'weak';
      diagnosis = desc.when_weak;
      recommendation = `Strengthen ${kind} layer. ${desc.recommendation}`;
      recommendations.push(`Improve ${kind} layer (score: ${qualityScore}/100) — ${desc.recommendation}`);
    } else {
      status = 'present';
      diagnosis = `${kind} layer is present with ${files.length} file(s) (${qualityScore}/100).`;
      recommendation = qualityScore < 70 ? `Could be improved. ${desc.recommendation}` : 'Good coverage.';
    }

    layers.push({
      kind,
      status,
      importance,
      files,
      diagnosis,
      recommendation,
      qualityScore,
    });
  }

  // Calculate readiness score (weighted by importance)
  const weights: Record<string, number> = { critical: 3, recommended: 2, optional: 1 };
  let totalWeight = 0;
  let weightedScore = 0;
  for (const layer of layers) {
    const w = weights[layer.importance];
    totalWeight += w;
    weightedScore += layer.qualityScore * w;
  }
  const readinessScore = Math.round(weightedScore / totalWeight);
  const grade = getGrade(readinessScore);

  // Summary
  const presentCount = layers.filter(l => l.status === 'present').length;
  const weakCount = layers.filter(l => l.status === 'weak').length;
  const missingCount = layers.filter(l => l.status === 'missing').length;

  const summary = `Found ${scanResult.files.length} instruction file(s). ` +
    `Layer coverage: ${presentCount} present, ${weakCount} weak, ${missingCount} missing. ` +
    `Readiness: ${readinessScore}/100 (${grade}).`;

  return {
    readinessScore,
    grade,
    layers,
    criticalIssues,
    recommendations,
    summary,
    scan: scanResult,
  };
}
