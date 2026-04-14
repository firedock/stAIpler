/**
 * Stage 2: Extraction
 *
 * For each SourceDocument, identify layer-relevant spans and produce LayerCandidate[].
 *
 * Two-tier approach:
 * 1. Fast path — filename and pattern matching (no LLM call)
 * 2. Deep path — semantic extraction via LLM for unstructured business docs
 */

import { randomUUID } from 'crypto';
import { LAYER_TYPES } from '../schema.js';
import type { LayerType } from '../types.js';
import type { SourceDocument, LayerCandidate, CandidateProvenance } from './types.js';

// ---- Centralized classification patterns ----
// Consolidated from scanner.ts FILENAME_LAYER_MAP and web route KIND_SIGNALS

/** Explicit filename → layer mapping (case-insensitive) */
const FILENAME_LAYER_MAP: Record<string, LayerType> = {
  'identity.md': 'identity',
  'goals.md': 'goals',
  'context.md': 'context',
  'constraints.md': 'constraints',
  'skills.md': 'skills',
  'skill.md': 'skills',
  'style.md': 'style',
  'examples.md': 'examples',
  'tools.md': 'tools',
  'policies.md': 'policies',
  'evals.md': 'evals',
  'prompts.md': 'prompts',
  'memory.md': 'memory',
};

/** Known AI tool files with default layer assignments */
const AI_TOOL_DEFAULTS: Record<string, LayerType> = {
  'claude.md': 'context',
  'agents.md': 'context',
  'gemini.md': 'context',
  'conventions.md': 'constraints',
  '.cursorrules': 'context',
  '.windsurfrules': 'context',
  '.clinerules': 'context',
  'copilot-instructions.md': 'context',
  'readme.md': 'context',
};

/** Content pattern signals for heuristic classification */
const KIND_SIGNALS: Record<LayerType, RegExp[]> = {
  identity: [/you are\b/i, /your role/i, /act as/i, /persona/i],
  goals: [/\bgoals?\b/i, /\bobjective/i, /\bpurpose\b/i, /\bsuccess criteria/i],
  context: [/\bcontext\b/i, /\bdomain\b/i, /\bbackground\b/i, /tech stack/i],
  constraints: [/\bnever\b/i, /\bdo not\b/i, /\bmust not\b/i, /\bavoid\b/i, /\brule/i],
  skills: [/\bskill/i, /\bcapabilit/i, /\bworkflow/i, /\bstep\s*\d/i],
  style: [/\bstyle\b/i, /\btone\b/i, /\bformat/i, /\bvoice\b/i],
  examples: [/\bexample/i, /\bsample/i, /\bfor instance/i],
  tools: [/\btool/i, /\bfunction call/i, /\bapi\b/i, /\bcommand\b/i],
  policies: [/\bpolic/i, /\bcompliance/i, /\blegal\b/i, /\bbrand\b/i],
  memory: [/\bmemory\b/i, /\bremember\b/i, /\bsession/i],
  evals: [/\beval/i, /\btest case/i, /\bassert/i, /\baccept.*criteria/i],
  prompts: [/\bprompt/i, /\btemplate/i, /\bsnippet/i],
};

/** Layer descriptions used for semantic extraction prompts */
const LAYER_DESCRIPTIONS: Record<LayerType, string> = {
  identity: 'WHO the AI is — role, persona, name, core character',
  goals: 'WHAT the AI is trying to achieve — objectives, success criteria, priorities',
  context: 'Domain knowledge, background, terminology, organizational context, tech stack',
  constraints: 'What the AI must NEVER do — safety rules, policies, boundaries, limits',
  skills: 'HOW the AI handles specific tasks — workflows, decision trees, procedures',
  style: 'Communication style — tone, formatting, voice, interaction dynamics',
  examples: 'Concrete examples of ideal responses, templates, canonical transformations',
  tools: 'Available tools, function signatures, when to use them, error handling',
  policies: 'Compliance, legal, brand, or safety rules distinct from constraints',
  memory: 'What to remember across interactions — user preferences, session state',
  evals: 'Test cases, assertions, acceptance criteria, evaluation intent',
  prompts: 'Reusable prompt fragments, message templates, tested instruction snippets',
};

// ---- Fast path extraction ----

function extractFilename(title: string): string {
  // Handle paths like "google-drive/My Doc.md" or "src/docs/IDENTITY.md"
  const parts = title.split(/[/\\]/);
  return parts[parts.length - 1];
}

/**
 * Fast-path extraction: classify by filename and content patterns only.
 * Returns candidates without an LLM call. Works well for files already
 * structured for AI agents (CLAUDE.md, IDENTITY.md, etc.)
 */
export function extractFastPath(doc: SourceDocument): LayerCandidate[] {
  const filename = extractFilename(doc.title);
  const lower = filename.toLowerCase();
  const now = new Date().toISOString();

  const provenance: CandidateProvenance = {
    sourceTitle: doc.title,
    sourceUrl: doc.sourceUrl,
    provider: doc.metadata.provider,
    span: null, // whole-file extraction
    importedAt: doc.metadata.importedAt,
    extractedAt: now,
  };

  // 1. Direct filename match — high confidence, whole file is the layer
  const filenameKind = FILENAME_LAYER_MAP[lower];
  if (filenameKind) {
    return [{
      id: randomUUID(),
      sourceDocumentId: doc.id,
      projectId: doc.projectId,
      layer: filenameKind,
      content: doc.rawContent,
      confidence: 0.9,
      rationale: `Filename "${filename}" directly maps to ${filenameKind} layer`,
      extractionMethod: 'filename',
      provenance,
    }];
  }

  // 2. Known AI tool file — moderate confidence
  const toolDefault = AI_TOOL_DEFAULTS[lower];
  if (toolDefault) {
    return [{
      id: randomUUID(),
      sourceDocumentId: doc.id,
      projectId: doc.projectId,
      layer: toolDefault,
      content: doc.rawContent,
      confidence: 0.7,
      rationale: `"${filename}" is a known AI tool config file, default layer: ${toolDefault}`,
      extractionMethod: 'filetype',
      provenance,
    }];
  }

  // 3. Content-based heuristic scoring
  let bestKind: LayerType | null = null;
  let bestScore = 0;

  for (const kind of LAYER_TYPES) {
    const patterns = KIND_SIGNALS[kind];
    const score = patterns.filter(p => p.test(doc.rawContent)).length;
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
    }
  }

  if (bestKind && bestScore > 0) {
    const maxPatterns = KIND_SIGNALS[bestKind].length;
    const confidence = Math.min(0.6, 0.2 + (bestScore / maxPatterns) * 0.4);

    return [{
      id: randomUUID(),
      sourceDocumentId: doc.id,
      projectId: doc.projectId,
      layer: bestKind,
      content: doc.rawContent,
      confidence,
      rationale: `Content matched ${bestScore}/${maxPatterns} patterns for ${bestKind}`,
      extractionMethod: 'heuristic',
      provenance,
    }];
  }

  // No match — return empty, this document needs deep-path extraction
  return [];
}

// ---- Deep path extraction (semantic / LLM) ----

/**
 * Build the prompt for semantic layer extraction.
 * The LLM reads the document and identifies which sections map to which layers,
 * extracting the relevant spans rather than classifying the whole document.
 */
export function buildExtractionPrompt(content: string): string {
  const layerList = LAYER_TYPES.map(l =>
    `- **${l}**: ${LAYER_DESCRIPTIONS[l]}`
  ).join('\n');

  return `You are an extraction engine for an AI agent instruction system called stAIpler.

stAIpler organizes AI agent instructions into 12 typed layers:

${layerList}

## Your task

Read the following document and extract any content that is relevant to one or more of these instruction layers. A single document may contain content relevant to multiple layers.

## Rules

1. Extract the SPECIFIC SPANS of text that are relevant, not the whole document.
2. A span can be a paragraph, a section, a bullet list, or any contiguous block.
3. Skip content that is purely procedural, administrative, or irrelevant to AI agent instructions.
4. For each extraction, provide the layer type, the extracted text, and a brief rationale.
5. Set confidence between 0.0 and 1.0 based on how clearly the content maps to that layer.
6. If no content maps to any layer, return an empty extractions array.

## Output format

Respond with a JSON object (no markdown fences):

{
  "extractions": [
    {
      "layer": "constraints",
      "content": "The extracted text span...",
      "confidence": 0.85,
      "rationale": "Why this maps to the constraints layer"
    }
  ]
}

## Document to analyze

${content}`;
}

/** Shape of the LLM extraction response */
export interface ExtractionResponse {
  extractions: {
    layer: string;
    content: string;
    confidence: number;
    rationale: string;
  }[];
}

/**
 * Parse the LLM response into LayerCandidates.
 * Validates layer types and applies reasonable defaults.
 */
export function parseExtractionResponse(
  response: ExtractionResponse,
  doc: SourceDocument,
): LayerCandidate[] {
  const now = new Date().toISOString();
  const validLayers = new Set<string>(LAYER_TYPES);

  return response.extractions
    .filter(e => validLayers.has(e.layer))
    .map(e => {
      // Find approximate span location in the original content
      const startChar = doc.rawContent.indexOf(e.content.substring(0, 50));
      const span = startChar >= 0
        ? { startChar, endChar: startChar + e.content.length }
        : null;

      return {
        id: randomUUID(),
        sourceDocumentId: doc.id,
        projectId: doc.projectId,
        layer: e.layer as LayerType,
        content: e.content,
        confidence: Math.max(0, Math.min(1, e.confidence)),
        rationale: e.rationale,
        extractionMethod: 'semantic' as const,
        provenance: {
          sourceTitle: doc.title,
          sourceUrl: doc.sourceUrl,
          provider: doc.metadata.provider,
          span,
          importedAt: doc.metadata.importedAt,
          extractedAt: now,
        },
      };
    });
}

// ---- Combined extraction ----

/** Threshold below which fast-path results are too weak to trust */
const FAST_PATH_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Extract layer candidates from a single source document.
 *
 * Uses fast-path first. If fast-path produces no results or low-confidence
 * results, returns a flag indicating deep-path (LLM) extraction is needed.
 *
 * The actual LLM call is NOT made here — the caller is responsible for
 * calling the LLM with buildExtractionPrompt() and feeding the response
 * through parseExtractionResponse(). This keeps the core package free of
 * LLM provider dependencies.
 */
export function extractLayerCandidates(doc: SourceDocument): {
  candidates: LayerCandidate[];
  needsDeepExtraction: boolean;
} {
  const fastResults = extractFastPath(doc);

  // Fast path produced high-confidence results — use them
  if (fastResults.length > 0 && fastResults[0].confidence >= FAST_PATH_CONFIDENCE_THRESHOLD) {
    return { candidates: fastResults, needsDeepExtraction: false };
  }

  // Fast path produced weak results — include them but flag for deep extraction
  if (fastResults.length > 0) {
    return { candidates: fastResults, needsDeepExtraction: true };
  }

  // No fast-path results at all — deep extraction required
  return { candidates: [], needsDeepExtraction: true };
}
