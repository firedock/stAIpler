import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import type { AnalysisResult } from './analyzer.js';
import type { ContinuityConfig } from '../config.js';
import { DEFAULT_CONTINUITY_CONFIG } from '../config.js';
import { renderContinuitySection } from './continuity-status.js';

const START_TAG = '<!-- staipler:status -->';
const END_TAG = '<!-- /staipler:status -->';

/**
 * Generate the status block that gets injected into agent config files.
 * This tells the agent about its own blind spots.
 *
 * The optional continuity config controls how the handoff thread table is
 * rendered (sort, inline cap, stale warning threshold). When omitted, defaults
 * apply — callers in older code paths continue to work unchanged.
 */
export function generateStatusBlock(
  analysis: AnalysisResult,
  continuityConfig: ContinuityConfig = DEFAULT_CONTINUITY_CONFIG,
): string {
  const { readinessScore, grade, layers } = analysis;
  const missing = layers.filter(l => l.status === 'missing');
  const weak = layers.filter(l => l.status === 'weak');
  const present = layers.filter(l => l.status === 'present');

  const lines: string[] = [START_TAG, ''];
  lines.push(`**Empowerment Score: ${readinessScore}/100 (${grade})**`);
  lines.push('');

  if (missing.length > 0) {
    lines.push(`Missing layers: ${missing.map(l => l.kind).join(', ')}`);
    lines.push('');

    // Add specific warnings for critical missing layers
    for (const layer of missing) {
      if (layer.importance === 'critical') {
        lines.push(`> WARNING: No ${layer.kind} layer. ${layer.recommendation}`);
      }
    }
    if (missing.some(l => l.importance === 'critical')) lines.push('');

    // Behavioral guidance based on gaps
    const gapGuidance = generateGapGuidance(missing.map(l => l.kind));
    if (gapGuidance.length > 0) {
      lines.push('When working in this project, be aware of these gaps:');
      for (const g of gapGuidance) {
        lines.push(`- ${g}`);
      }
      lines.push('');
    }
  }

  if (weak.length > 0) {
    lines.push(`Weak layers (need improvement): ${weak.map(l => `${l.kind} (${l.qualityScore}/100)`).join(', ')}`);
    lines.push('');
  }

  // Continuity section — between the layer summary and the coverage tallies.
  const continuityLayer = layers.find(l => l.kind === 'continuity');
  const continuityBlock = renderContinuitySection(continuityLayer?.files ?? [], continuityConfig);
  if (continuityBlock.length > 0) {
    lines.push(continuityBlock);
    lines.push('');
  }

  lines.push(`Coverage: ${present.length} present, ${weak.length} weak, ${missing.length} missing out of ${layers.length} layers`);
  lines.push('');
  lines.push(`_Last updated: ${new Date().toISOString().slice(0, 16)}_`);
  lines.push('');
  lines.push(END_TAG);

  return lines.join('\n');
}

function generateGapGuidance(missingKinds: string[]): string[] {
  const guidance: string[] = [];

  if (missingKinds.includes('identity')) {
    guidance.push('No persona defined — ask the user to clarify your role before making assumptions.');
  }
  if (missingKinds.includes('constraints')) {
    guidance.push('No constraints defined — be conservative and confirm before taking irreversible actions.');
  }
  if (missingKinds.includes('context')) {
    guidance.push('No domain context provided — ask clarifying questions about business rules and terminology.');
  }
  if (missingKinds.includes('policies')) {
    guidance.push('No compliance/policy layer — flag any compliance, legal, or brand-sensitive decisions to the user.');
  }
  if (missingKinds.includes('style')) {
    guidance.push('No style guide — match the existing code/writing style rather than imposing your own.');
  }
  if (missingKinds.includes('goals')) {
    guidance.push('No goals defined — confirm priorities with the user before starting multi-step tasks.');
  }
  if (missingKinds.includes('skills')) {
    guidance.push('No skill definitions — research the codebase before assuming how workflows should operate.');
  }

  return guidance;
}

/**
 * Well-known agent config files to auto-detect for injection.
 */
const AGENT_FILES = [
  'CLAUDE.md',
  'AGENTS.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'copilot-instructions.md',
  '.github/copilot-instructions.md',
  'GEMINI.md',
];

/**
 * Find the best agent file to inject into.
 * Prefers explicit config, falls back to auto-detection.
 */
export function findInjectTarget(projectRoot: string, configInject: string | null): string | null {
  if (configInject) {
    const explicit = resolve(projectRoot, configInject);
    return explicit; // Will be created if it doesn't exist
  }

  // Auto-detect: prefer CLAUDE.md, then others in order
  for (const file of AGENT_FILES) {
    const path = resolve(projectRoot, file);
    if (existsSync(path)) return path;
  }

  return null;
}

/**
 * Inject the status block into an agent config file.
 * If a block already exists, replace it. Otherwise, append it.
 */
export function injectStatus(
  filePath: string,
  analysis: AnalysisResult,
  continuityConfig: ContinuityConfig = DEFAULT_CONTINUITY_CONFIG,
): { created: boolean; updated: boolean } {
  const block = generateStatusBlock(analysis, continuityConfig);
  let created = false;
  let updated = false;

  let content = '';
  if (existsSync(filePath)) {
    content = readFileSync(filePath, 'utf-8');
  } else {
    created = true;
  }

  const startIdx = content.indexOf(START_TAG);
  const endIdx = content.indexOf(END_TAG);

  if (startIdx !== -1 && endIdx !== -1) {
    // Replace existing block
    content = content.slice(0, startIdx) + block + content.slice(endIdx + END_TAG.length);
    updated = true;
  } else {
    // Append
    if (content.length > 0 && !content.endsWith('\n')) content += '\n';
    if (content.length > 0) content += '\n';
    content += block + '\n';
    updated = true;
  }

  writeFileSync(filePath, content);
  return { created, updated };
}
