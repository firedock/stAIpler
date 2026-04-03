import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join, relative, basename } from 'path';
import { parseAssetFile } from '../parser.js';
import { FILE_TYPES, getFileTypeInfo } from './file-types.js';
import type { Asset, LayerType } from '../types.js';
import { LAYER_TYPES } from '../schema.js';

export interface ScannedFile {
  /** Absolute path */
  path: string;
  /** Path relative to scan root */
  relativePath: string;
  /** File name */
  name: string;
  /** Raw content */
  content: string;
  /** Detected source type ID (matches FileTypeInfo.id) */
  sourceType: string;
  /** Parsed asset if valid stAIpler format, null otherwise */
  parsedAsset: Asset | null;
  /** Inferred layer type (even for non-native files) */
  inferredKind: LayerType | null;
  /** Confidence of the inference (0-1) */
  inferredConfidence: number;
  /** Content length in chars */
  contentLength: number;
}

export interface ScanResult {
  /** Root directory scanned */
  scanRoot: string;
  /** All discovered instruction files */
  files: ScannedFile[];
  /** Files grouped by inferred layer type */
  byKind: Partial<Record<LayerType, ScannedFile[]>>;
  /** Layer types with at least one file */
  presentKinds: LayerType[];
  /** Layer types with no files found */
  missingKinds: LayerType[];
  /** Total instruction content size */
  totalContentLength: number;
}

/** Keyword patterns for inferring layer types from content */
const KIND_SIGNALS: { kind: LayerType; patterns: RegExp[] }[] = [
  { kind: 'identity', patterns: [/you are\b/i, /your role/i, /act as/i, /persona/i, /your name is/i] },
  { kind: 'goals', patterns: [/\bgoals?\b/i, /\bobjective/i, /\bpurpose\b/i, /your mission/i] },
  { kind: 'context', patterns: [/\bcontext\b/i, /\bdomain\b/i, /\bbackground\b/i, /environment/i, /tech stack/i] },
  { kind: 'constraints', patterns: [/\bnever\b/i, /\bdo not\b/i, /\bmust not\b/i, /\bavoid\b/i, /\bprohibit/i, /\brule/i, /\bconstraint/i] },
  { kind: 'skills', patterns: [/\bskill/i, /\bcapabilit/i, /\bcan do\b/i, /\bable to\b/i, /\bwhen.*asked/i, /\bstep\s*\d/i] },
  { kind: 'style', patterns: [/\bstyle\b/i, /\btone\b/i, /\bformat/i, /\bvoice\b/i, /\brespond.*with/i, /\bwriting style/i] },
  { kind: 'examples', patterns: [/\bexample/i, /\bsample/i, /\bfor instance/i, /\bsuch as\b/i, /\blike this/i] },
  { kind: 'tools', patterns: [/\btool/i, /\bfunction call/i, /\bapi\b/i, /\bendpoint/i, /\bcommand\b/i] },
  { kind: 'memory', patterns: [/\bmemory\b/i, /\bremember\b/i, /\bconversation history/i, /\bsession/i, /\buser preference/i] },
];

function classifySourceType(relativePath: string): string {
  for (const fileType of FILE_TYPES) {
    for (const pattern of fileType.patterns) {
      if (pattern.test(relativePath)) return fileType.id;
    }
  }
  return 'generic-md';
}

function inferKind(content: string, sourceType: string): { kind: LayerType | null; confidence: number } {
  const fileTypeInfo = getFileTypeInfo(sourceType);
  const knownDefault = fileTypeInfo?.defaultKind ?? null;

  // Score each kind by keyword matches
  const scores: { kind: LayerType; score: number }[] = KIND_SIGNALS.map(({ kind, patterns }) => {
    const score = patterns.reduce((acc, p) => acc + (p.test(content) ? 1 : 0), 0);
    return { kind, score };
  });

  scores.sort((a, b) => b.score - a.score);
  const topScore = scores[0];

  if (topScore.score === 0) {
    return { kind: knownDefault ?? null, confidence: knownDefault ? 0.4 : 0 };
  }

  const maxPossible = KIND_SIGNALS.find(s => s.kind === topScore.kind)!.patterns.length;
  const confidence = Math.min(0.95, 0.3 + (topScore.score / maxPossible) * 0.65);

  return { kind: topScore.kind, confidence };
}

function walkFiles(dir: string, rootDir: string, results: ScannedFile[]): void {
  if (!existsSync(dir)) return;

  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'coverage', '.output', '.next',
    '__pycache__', 'vendor', 'Pods', 'build', '.build',
    'DerivedData', 'Carthage', '.gradle', 'target',
    'venv', '.venv', 'env', '.env',
    '.turbo', '.vercel', '.netlify',
  ]);

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      if (!skipDirs.has(entry)) {
        walkFiles(fullPath, rootDir, results);
      }
      continue;
    }

    // Scan markdown files and known AI instruction file formats
    const lower = entry.toLowerCase();
    const isInstructionFile =
      lower.endsWith('.md') ||
      lower.endsWith('.mdc') ||
      lower.endsWith('.txt') && (lower.startsWith('llms') || lower.includes('prompt')) ||
      lower.endsWith('.cursorrules') ||
      lower.endsWith('.windsurfrules') ||
      lower.endsWith('.clinerules') ||
      lower.startsWith('.aider') ||
      lower.endsWith('.prompt.md') ||
      lower.endsWith('.agent.md');
    if (!isInstructionFile) continue;

    const relativePath = relative(rootDir, fullPath);
    const content = readFileSync(fullPath, 'utf-8');
    const sourceType = classifySourceType(relativePath);

    // Try to parse as stAIpler native
    let parsedAsset: Asset | null = null;
    if (content.trimStart().startsWith('---')) {
      try {
        parsedAsset = parseAssetFile(fullPath, content);
      } catch {
        // Not valid stAIpler format
      }
    }

    // Infer kind
    let inferredKind: LayerType | null = null;
    let inferredConfidence = 0;

    if (parsedAsset) {
      inferredKind = parsedAsset.frontmatter.kind;
      inferredConfidence = 1.0;
    } else {
      const inference = inferKind(content, sourceType);
      inferredKind = inference.kind;
      inferredConfidence = inference.confidence;
    }

    results.push({
      path: fullPath,
      relativePath,
      name: basename(fullPath),
      content,
      sourceType,
      parsedAsset,
      inferredKind,
      inferredConfidence,
      contentLength: content.length,
    });
  }
}

export function scan(rootDir: string): ScanResult {
  const absRoot = resolve(rootDir);
  const files: ScannedFile[] = [];

  walkFiles(absRoot, absRoot, files);

  // Group by kind
  const byKind: Partial<Record<LayerType, ScannedFile[]>> = {};
  for (const file of files) {
    if (file.inferredKind) {
      if (!byKind[file.inferredKind]) byKind[file.inferredKind] = [];
      byKind[file.inferredKind]!.push(file);
    }
  }

  const presentKinds = LAYER_TYPES.filter(k => byKind[k]?.length);
  const missingKinds = LAYER_TYPES.filter(k => !byKind[k]?.length);
  const totalContentLength = files.reduce((sum, f) => sum + f.contentLength, 0);

  return {
    scanRoot: absRoot,
    files,
    byKind,
    presentKinds,
    missingKinds,
    totalContentLength,
  };
}
