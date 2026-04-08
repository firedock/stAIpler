import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import type { AnalysisResult, LayerAnalysis } from './analyzer.js';
import type { LayerType } from '../types.js';

export interface OptimizationPlan {
  /** Layers that will be generated from scratch */
  generate: LayerPlan[];
  /** Layers that will be improved */
  improve: LayerPlan[];
  /** Layers that are good as-is */
  keep: LayerPlan[];
  /** Estimated total layers in final stack */
  totalLayers: number;
}

export interface LayerPlan {
  kind: LayerType;
  action: 'generate' | 'improve' | 'keep';
  reason: string;
  /** Existing content to build from (for improve/keep) */
  existingContent?: string;
}

export interface OptimizedAsset {
  kind: LayerType;
  action: 'generated' | 'improved' | 'kept';
  /** Full markdown content with stAIpler frontmatter */
  content: string;
  /** What changed */
  changeSummary: string;
}

export interface OptimizationResult {
  plan: OptimizationPlan;
  assets: OptimizedAsset[];
  /** Before/after readiness score */
  beforeScore: number;
  afterScore: number;
}

function stripCodeFences(content: string): string {
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:markdown|md)?\n?/, '').replace(/\n?```$/, '');
  }
  return cleaned.trim();
}

function callClaude(prompt: string, model: string): string {
  const tmpDir = '/tmp/staipler-optimizer';
  mkdirSync(tmpDir, { recursive: true });
  const ts = Date.now();
  const promptFile = resolve(tmpDir, `prompt-${ts}.txt`);
  writeFileSync(promptFile, prompt);

  try {
    return execSync(`cat '${promptFile}' | claude -p --model ${model}`, {
      encoding: 'utf-8',
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024,
      shell: '/bin/bash',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } finally {
    try { execSync(`rm -f '${promptFile}'`); } catch {}
  }
}

export function createPlan(analysis: AnalysisResult): OptimizationPlan {
  const generate: LayerPlan[] = [];
  const improve: LayerPlan[] = [];
  const keep: LayerPlan[] = [];

  for (const layer of analysis.layers) {
    if (layer.status === 'missing' && layer.importance !== 'optional') {
      generate.push({
        kind: layer.kind,
        action: 'generate',
        reason: layer.diagnosis,
      });
    } else if (layer.status === 'weak') {
      const existing = layer.files.map(f => f.content).join('\n\n---\n\n');
      improve.push({
        kind: layer.kind,
        action: 'improve',
        reason: layer.diagnosis,
        existingContent: existing,
      });
    } else if (layer.status === 'present') {
      const existing = layer.files.map(f => f.content).join('\n\n---\n\n');
      keep.push({
        kind: layer.kind,
        action: 'keep',
        reason: layer.diagnosis,
        existingContent: existing,
      });
    } else {
      // missing + optional — skip unless user requests
      keep.push({
        kind: layer.kind,
        action: 'keep',
        reason: `Optional layer "${layer.kind}" not present. Skipping.`,
      });
    }
  }

  return {
    generate,
    improve,
    keep,
    totalLayers: generate.length + improve.length + keep.filter(k => k.existingContent).length,
  };
}

function buildGeneratePrompt(kind: LayerType, analysis: AnalysisResult): string {
  // Gather all existing content for context
  const existingContent = analysis.scan.files
    .filter(f => f.inferredKind !== kind)
    .slice(0, 5) // limit context
    .map(f => `--- ${f.relativePath} (${f.inferredKind ?? 'unknown'}) ---\n${f.content.slice(0, 500)}`)
    .join('\n\n');

  return `You are an expert at writing AI instruction layers for the stAIpler framework.

Based on the existing instruction files below, generate a high-quality "${kind}" layer.

## What is a "${kind}" layer?
${getLayerGuidance(kind)}

## Existing Instruction Files (for context)
${existingContent || 'No existing files found.'}

## Requirements
- Output ONLY the complete markdown file content (with stAIpler frontmatter)
- Use this exact frontmatter format:
\`\`\`
---
id: optimized.${kind}
kind: ${kind}
version: 1.0.0
title: [Descriptive Title]
tags: [optimized]
priority: 50
---
\`\`\`
- Make the content specific and actionable, not generic
- Draw from best practices for AI instruction design
- If there's existing context about the domain, tailor the layer to it
- Keep it concise but thorough (200-500 words for the body)
- Do NOT wrap your output in code fences — output the raw markdown directly starting with ---

Output the complete markdown file now:`;
}

function buildImprovePrompt(kind: LayerType, existingContent: string, analysis: AnalysisResult): string {
  return `You are an expert at optimizing AI instruction layers for the stAIpler framework.

The following "${kind}" layer exists but needs improvement. Strengthen it while preserving the user's intent.

## Current Content
${existingContent}

## What makes a great "${kind}" layer?
${getLayerGuidance(kind)}

## Requirements
- Output ONLY the complete improved markdown file (with stAIpler frontmatter)
- Use this exact frontmatter format:
\`\`\`
---
id: optimized.${kind}
kind: ${kind}
version: 1.0.0
title: [Descriptive Title]
tags: [optimized]
priority: 50
---
\`\`\`
- Preserve the user's original intent and domain-specific content
- Add structure, specificity, and best practices
- Fill gaps in coverage
- Keep it concise but thorough
- Do NOT remove content the user clearly wanted — enhance it
- Do NOT wrap your output in code fences — output the raw markdown directly starting with ---

Output the complete improved markdown file now:`;
}

function getLayerGuidance(kind: LayerType): string {
  const guidance: Record<LayerType, string> = {
    identity: 'Defines WHO the AI is — its role, persona, and core character. Should establish the AI\'s name (if applicable), primary function, and personality traits. A strong identity layer makes responses consistent and recognizable.',
    goals: 'Defines WHAT the AI is trying to achieve — its objectives and success criteria. Should be specific and measurable. Good goals help the AI prioritize when handling ambiguous requests.',
    context: 'Provides domain knowledge and environmental details — WHERE the AI operates. Should include relevant background, terminology, systems, and organizational context. This grounds the AI in reality.',
    constraints: 'Defines what the AI must NEVER do — safety rules, policies, and boundaries. Should cover security (no PII leaks), ethics (no harmful content), and operational limits (escalation triggers). Critical for production safety.',
    skills: 'Defines HOW the AI handles specific tasks — workflows, decision trees, and procedures. Should be step-by-step and cover common scenarios and edge cases. Good skills make the AI reliable and predictable.',
    style: 'Defines the AI\'s communication style — tone, formatting, voice, AND communication dynamics. Should specify: formality level, response structure, how to match the user\'s emotional state. ALSO must include communication dynamics: should the AI push back when it disagrees? Should it ask clarifying questions vs make assumptions? Should it lead with answers or explanations? These interaction patterns are the most impactful and least obvious style choices — most users never think to define them.',
    examples: 'Provides concrete examples of ideal responses — showing rather than telling. The most effective way to calibrate output quality. Should cover happy paths and edge cases.',
    tools: 'Defines available tools and when to use them — function signatures, parameters, and invocation criteria. Should include error handling guidance.',
    policies: 'Defines compliance, trust, legal, brand, or safety rules that go beyond ordinary constraints. Keep distinct from constraints when organizational policy needs to remain inspectable as its own layer.',
    evals: 'Defines evaluation intent, test cases, assertions, or acceptance criteria. Even if enforcement is not yet automated, capturing eval intent early lets teams measure progress.',
    prompts: 'Defines reusable prompt fragments, message templates, or tested instruction snippets. Useful as a working asset for composing complex multi-step interactions.',
    memory: 'Defines what to remember across interactions — user preferences, session state, and conversation context. Usually a placeholder for runtime injection.',
  };
  return guidance[kind];
}

export async function optimize(
  analysis: AnalysisResult,
  model: string = 'sonnet',
  onProgress?: (message: string) => void,
): Promise<OptimizationResult> {
  const plan = createPlan(analysis);
  const assets: OptimizedAsset[] = [];
  const log = onProgress ?? console.log;

  // Generate missing layers
  for (const layerPlan of plan.generate) {
    log(`Generating ${layerPlan.kind} layer...`);
    const prompt = buildGeneratePrompt(layerPlan.kind, analysis);
    const content = stripCodeFences(callClaude(prompt, model));
    assets.push({
      kind: layerPlan.kind,
      action: 'generated',
      content,
      changeSummary: `Generated new ${layerPlan.kind} layer from scratch.`,
    });
  }

  // Improve weak layers
  for (const layerPlan of plan.improve) {
    log(`Improving ${layerPlan.kind} layer...`);
    const prompt = buildImprovePrompt(layerPlan.kind, layerPlan.existingContent!, analysis);
    const content = stripCodeFences(callClaude(prompt, model));
    assets.push({
      kind: layerPlan.kind,
      action: 'improved',
      content,
      changeSummary: `Improved existing ${layerPlan.kind} layer with better structure and coverage.`,
    });
  }

  // Keep existing good layers (convert to stAIpler format if needed)
  for (const layerPlan of plan.keep) {
    if (layerPlan.existingContent) {
      // Check if it's already stAIpler format
      if (layerPlan.existingContent.trimStart().startsWith('---')) {
        assets.push({
          kind: layerPlan.kind,
          action: 'kept',
          content: layerPlan.existingContent,
          changeSummary: `Kept existing ${layerPlan.kind} layer as-is.`,
        });
      } else {
        // Wrap in stAIpler format
        const wrapped = `---
id: optimized.${layerPlan.kind}
kind: ${layerPlan.kind}
version: 1.0.0
title: ${layerPlan.kind.charAt(0).toUpperCase() + layerPlan.kind.slice(1)}
tags: [optimized]
priority: 50
---

${layerPlan.existingContent}`;
        assets.push({
          kind: layerPlan.kind,
          action: 'kept',
          content: wrapped,
          changeSummary: `Wrapped existing ${layerPlan.kind} content in stAIpler format.`,
        });
      }
    }
  }

  // Estimate after score
  const coveredKinds = new Set(assets.map(a => a.kind));
  const afterScore = Math.min(95, analysis.readinessScore + (coveredKinds.size * 8));

  return {
    plan,
    assets,
    beforeScore: analysis.readinessScore,
    afterScore,
  };
}
