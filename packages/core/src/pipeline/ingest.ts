/**
 * Stage 1: Ingestion
 *
 * Normalizes raw content from any connector into a common SourceDocument format.
 * Every connector produces SourceDocument[] — the pipeline consumes them uniformly.
 */

import { createHash } from 'crypto';
import { randomUUID } from 'crypto';
import type { SourceDocument, SourceDocumentMetadata } from './types.js';

export interface RawInput {
  /** Human-readable name (filename, doc title, page name) */
  title: string;
  /** Raw content as string */
  content: string;
  /** Original URL or path (Google Drive link, GitHub path, etc.) */
  sourceUrl?: string;
  /** MIME type override (defaults to text/markdown) */
  mimeType?: string;
  /** Author if known */
  author?: string;
  /** Last modified date of the source (ISO string) */
  lastModifiedAt?: string;
  /** Freeform tags from the source system */
  tags?: string[];
}

export interface IngestOptions {
  /** Project ID this document belongs to */
  projectId: string;
  /** Data source ID (FK to data_sources table) */
  dataSourceId?: string;
  /** Which connector is producing this document */
  provider: string;
}

/**
 * Normalize a single raw input into a SourceDocument.
 */
export function normalizeToSourceDocument(
  raw: RawInput,
  options: IngestOptions,
): SourceDocument {
  const now = new Date().toISOString();
  const contentHash = createHash('sha256').update(raw.content).digest('hex');

  const metadata: SourceDocumentMetadata = {
    provider: options.provider,
    importedAt: now,
    lastModifiedAt: raw.lastModifiedAt ?? null,
    author: raw.author ?? null,
    tags: raw.tags ?? [],
  };

  return {
    id: randomUUID(),
    projectId: options.projectId,
    dataSourceId: options.dataSourceId ?? null,
    title: raw.title,
    sourceUrl: raw.sourceUrl ?? null,
    rawContent: raw.content,
    contentHash,
    mimeType: raw.mimeType ?? 'text/markdown',
    metadata,
  };
}

/**
 * Normalize a batch of raw inputs into SourceDocuments.
 * Deduplicates by content hash — if two inputs have identical content,
 * only the first is kept.
 */
export function normalizeToSourceDocuments(
  raws: RawInput[],
  options: IngestOptions,
): SourceDocument[] {
  const seen = new Set<string>();
  const docs: SourceDocument[] = [];

  for (const raw of raws) {
    const doc = normalizeToSourceDocument(raw, options);
    if (!seen.has(doc.contentHash)) {
      seen.add(doc.contentHash);
      docs.push(doc);
    }
  }

  return docs;
}
