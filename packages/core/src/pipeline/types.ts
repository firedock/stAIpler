/**
 * Evidence Pipeline Types
 *
 * Four-stage model:
 * 1. Ingestion  — fetch and normalize source content into SourceDocument
 * 2. Extraction — identify layer-relevant spans per document → LayerCandidate[]
 * 3. Organization — dedupe, reconcile, cluster across documents → ResolvedLayer[]
 * 4. Compilation — produce final instruction bundle → CompiledInstructionBundle
 */

import type { LayerType } from '../types.js';

// ---- Stage 1: Ingestion ----

export interface SourceDocument {
  /** Unique identifier */
  id: string;
  /** Project this document belongs to */
  projectId: string;
  /** FK to data_sources table (nullable for file uploads without a persistent source) */
  dataSourceId: string | null;
  /** Human-readable name (filename, doc title, page title) */
  title: string;
  /** Original location (Drive URL, GitHub path, Notion page URL, etc.) */
  sourceUrl: string | null;
  /** Full original content */
  rawContent: string;
  /** SHA256 of rawContent for dedup detection */
  contentHash: string;
  /** Content type */
  mimeType: string;
  /** Provider and import metadata */
  metadata: SourceDocumentMetadata;
}

export interface SourceDocumentMetadata {
  /** Connector that produced this document */
  provider: string;
  /** When the document was imported */
  importedAt: string;
  /** When the source was last modified (if known) */
  lastModifiedAt: string | null;
  /** Author of the source document (if known) */
  author: string | null;
  /** Freeform tags from the source system */
  tags: string[];
}

// ---- Stage 2: Extraction ----

export interface LayerCandidate {
  /** Unique identifier */
  id: string;
  /** FK to SourceDocument */
  sourceDocumentId: string;
  /** Project this candidate belongs to */
  projectId: string;
  /** Which of the 12 instruction layers this maps to */
  layer: LayerType;
  /** The extracted span — NOT the whole document */
  content: string;
  /** Classification confidence (0-1) */
  confidence: number;
  /** Why this was classified this way */
  rationale: string;
  /** How this candidate was produced */
  extractionMethod: 'filename' | 'filetype' | 'heuristic' | 'semantic';
  /** Where exactly this came from */
  provenance: CandidateProvenance;
}

export interface CandidateProvenance {
  /** Title of the source document */
  sourceTitle: string;
  /** Original URL (if applicable) */
  sourceUrl: string | null;
  /** Connector that produced the source */
  provider: string;
  /** Character range in the original document (null if whole-file extraction) */
  span: { startChar: number; endChar: number } | null;
  /** When the source was imported */
  importedAt: string;
  /** When extraction ran */
  extractedAt: string;
}

// ---- Stage 3: Organization ----

export interface ResolvedLayer {
  /** Which instruction layer */
  layer: LayerType;
  /** Whether this layer's content comes from user sources, AI generation, or both */
  status: 'source-grounded' | 'ai-generated' | 'mixed';
  /** All candidates for this layer, ranked by confidence then recency */
  candidates: LayerCandidate[];
  /** Contradictions between candidates */
  conflicts: ConflictRecord[];
  /** Best/merged content for this layer */
  primaryContent: string;
  /** All sources that contributed to this layer */
  provenance: CandidateProvenance[];
  /** Quality score (0-100) */
  qualityScore: number;
}

export interface ConflictRecord {
  /** ID of the first conflicting candidate */
  candidateA: string;
  /** ID of the second conflicting candidate */
  candidateB: string;
  /** What conflicts */
  description: string;
  /** How the conflict was resolved (or not) */
  resolution: 'a-wins' | 'b-wins' | 'merged' | 'unresolved';
  /** What determined the resolution */
  resolvedBy: 'recency' | 'confidence' | 'user' | 'unresolved';
}

// ---- Stage 4: Compilation ----

export interface CompiledInstructionBundle {
  /** Final merged instruction text */
  systemPrompt: string;
  /** SHA256 of systemPrompt */
  hash: string;
  /** Sections with provenance and grounding status */
  sections: BundleSection[];
  /** Per-section provenance chain */
  provenance: SectionProvenance[];
  /** Unresolved conflicts surfaced to the user */
  conflicts: ConflictRecord[];
  /** Layers with no content — targets for the optimizer */
  gaps: LayerType[];
  /** Bundle metadata */
  metadata: BundleMetadata;
}

export interface BundleSection {
  /** Which instruction layer */
  layer: LayerType;
  /** Merged content for this layer */
  content: string;
  /** Whether this is source-grounded, AI-generated, or mixed */
  status: 'source-grounded' | 'ai-generated' | 'mixed';
}

export interface SectionProvenance {
  /** Which instruction layer */
  layer: LayerType;
  /** All sources that contributed to this section */
  sources: CandidateProvenance[];
}

export interface BundleMetadata {
  /** Estimated token count */
  tokenEstimate: number;
  /** How many source documents fed this bundle */
  sourceDocumentCount: number;
  /** How many layer candidates were produced */
  layerCandidateCount: number;
  /** When compilation ran */
  compiledAt: string;
}

// ---- Pipeline orchestration ----

/** Structured progress event emitted during pipeline execution */
export interface PipelineEvent {
  /** Which pipeline stage this event belongs to */
  stage: 'ingestion' | 'extraction' | 'organization' | 'compilation';
  /** What happened */
  event: string;
  /** Optional detail — document title, candidate count, etc. */
  detail?: string;
  /** Milliseconds elapsed since pipeline started */
  elapsed: number;
}

/** Visibility artifacts — what the pipeline did that would otherwise be invisible */
export interface TransformationLog {
  /** Documents deduplicated during ingestion (by content hash) */
  deduplicatedDocuments: { title: string; contentHash: string }[];
  /** Candidates merged during organization (by content similarity) */
  mergedCandidates: { layer: string; keptId: string; droppedId: string; reason: string }[];
  /** Candidates filtered by confidence threshold */
  filteredByConfidence: { id: string; layer: string; confidence: number; threshold: number }[];
  /** Conflicts auto-resolved before user review */
  autoResolutions: { layer: string; winnerId: string; loserId: string; resolvedBy: string }[];
  /** Layers that became gaps (no candidates after filtering) */
  gapReasons: { layer: string; reason: string }[];
}

export interface PipelineResult {
  /** Source documents that were ingested */
  sourceDocuments: SourceDocument[];
  /** Layer candidates extracted from those documents */
  candidates: LayerCandidate[];
  /** Resolved layers after organization */
  resolvedLayers: ResolvedLayer[];
  /** Final compiled bundle */
  bundle: CompiledInstructionBundle;
  /** Whether the pipeline has items needing user review before finalization */
  needsReview: boolean;
  /** Structured progress events from the pipeline run */
  events: PipelineEvent[];
  /** What transformations happened invisibly — now visible */
  transformations: TransformationLog;
}
