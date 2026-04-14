/**
 * Evidence Pipeline — Orchestrator
 *
 * Ties together all four stages:
 * 1. Ingestion  → SourceDocument[]
 * 2. Extraction → LayerCandidate[]
 * 3. Organization → ResolvedLayer[]
 * 4. Compilation → CompiledInstructionBundle
 *
 * The caller is responsible for:
 * - Fetching raw content from connectors
 * - Providing an LLM function for deep-path extraction (optional)
 * - Persisting results to the database
 */

// Re-export types
export type {
  SourceDocument,
  SourceDocumentMetadata,
  LayerCandidate,
  CandidateProvenance,
  ResolvedLayer,
  ConflictRecord,
  CompiledInstructionBundle,
  BundleSection,
  SectionProvenance,
  BundleMetadata,
  PipelineResult,
  PipelineEvent,
  TransformationLog,
} from './types.js';

// Re-export stage functions
export {
  normalizeToSourceDocument,
  normalizeToSourceDocuments,
} from './ingest.js';
export type { RawInput, IngestOptions } from './ingest.js';

export {
  extractLayerCandidates,
  extractFastPath,
  buildExtractionPrompt,
  parseExtractionResponse,
} from './extract.js';
export type { ExtractionResponse } from './extract.js';

export {
  organizeCandidates,
  computeReadinessScore,
} from './organize.js';

export {
  compileBundle,
} from './compile.js';

export {
  buildReviewItems,
  applyReviewDecisions,
} from './review.js';
export type {
  ReviewItem,
  ReviewOption,
  ReviewDecision,
} from './review.js';

export {
  createHandoffPacket,
  reinforceHandoff,
  applyDecay,
  getActiveHandoffs,
  calculateDecay,
  formatHandoffsForPrompt,
  findSimilarHandoff,
} from './handoff.js';
export type {
  HandoffPacket,
  HandoffClassification,
  HandoffProvenance,
  EmitHandoffInput,
} from './handoff.js';

// ---- Pipeline orchestrator ----

import type { SourceDocument, LayerCandidate, PipelineResult } from './types.js';
import { extractLayerCandidates, buildExtractionPrompt, parseExtractionResponse } from './extract.js';
import type { ExtractionResponse } from './extract.js';
import { organizeCandidates } from './organize.js';
import { compileBundle } from './compile.js';
import { buildReviewItems } from './review.js';

/**
 * Optional LLM function for deep-path semantic extraction.
 * The caller provides this — keeps the pipeline free of provider dependencies.
 *
 * Takes a prompt string, returns the LLM's text response.
 */
export type LLMFunction = (prompt: string) => Promise<string>;

/**
 * Run the full evidence pipeline on a set of source documents.
 *
 * @param docs - SourceDocuments produced by Stage 1 (ingestion)
 * @param llm - Optional LLM function for deep-path extraction.
 *              If not provided, only fast-path extraction is used.
 * @param onProgress - Optional progress callback
 */
export async function runPipeline(
  docs: SourceDocument[],
  llm?: LLMFunction,
  onProgress?: (message: string) => void,
): Promise<PipelineResult> {
  // Stage 2: Extraction
  onProgress?.(`Extracting layer candidates from ${docs.length} documents...`);
  const allCandidates: LayerCandidate[] = [];
  const needsDeep: SourceDocument[] = [];

  for (const doc of docs) {
    const { candidates, needsDeepExtraction } = extractLayerCandidates(doc);
    allCandidates.push(...candidates);
    if (needsDeepExtraction) {
      needsDeep.push(doc);
    }
  }

  // Deep-path extraction for documents that need it
  if (llm && needsDeep.length > 0) {
    onProgress?.(`Running semantic extraction on ${needsDeep.length} unstructured documents...`);

    for (const doc of needsDeep) {
      try {
        const prompt = buildExtractionPrompt(doc.rawContent);
        const responseText = await llm(prompt);

        // Parse JSON from the LLM response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const response: ExtractionResponse = JSON.parse(jsonMatch[0]);
          const semanticCandidates = parseExtractionResponse(response, doc);
          allCandidates.push(...semanticCandidates);
          onProgress?.(`  Extracted ${semanticCandidates.length} candidates from "${doc.title}"`);
        }
      } catch (err) {
        onProgress?.(`  Failed to extract from "${doc.title}": ${err instanceof Error ? err.message : String(err)}`);
        // Continue with other documents — don't fail the whole pipeline
      }
    }
  } else if (needsDeep.length > 0) {
    onProgress?.(`Skipping ${needsDeep.length} documents that need semantic extraction (no LLM provided)`);
  }

  // Stage 3: Organization
  onProgress?.(`Organizing ${allCandidates.length} candidates across ${docs.length} documents...`);
  const { resolvedLayers, transformations } = organizeCandidates(allCandidates);

  if (transformations.mergedCandidates.length > 0) {
    onProgress?.(`  Deduplicated ${transformations.mergedCandidates.length} duplicate candidates`);
  }
  if (transformations.autoResolutions.length > 0) {
    onProgress?.(`  Auto-resolved ${transformations.autoResolutions.length} conflicts`);
  }

  // Stage 4: Compilation
  onProgress?.('Compiling instruction bundle...');
  const bundle = compileBundle(resolvedLayers, docs.length, allCandidates.length);

  // Check if review is needed
  const reviewItems = buildReviewItems(resolvedLayers, allCandidates);
  const needsReview = reviewItems.length > 0;

  onProgress?.(`Done. ${bundle.sections.length} layers populated, ${bundle.gaps.length} gaps, ${bundle.conflicts.length} conflicts${needsReview ? `, ${reviewItems.length} items need review` : ''}.`);

  return {
    sourceDocuments: docs,
    candidates: allCandidates,
    resolvedLayers,
    bundle,
    needsReview,
    events: [], // TODO: populate from onProgress calls with structured events
    transformations,
  };
}
