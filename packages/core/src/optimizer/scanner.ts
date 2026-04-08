import { existsSync, readFileSync, readdirSync, lstatSync } from 'fs';
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

export interface KnowledgeFile {
  /** Absolute path */
  path: string;
  /** Path relative to scan root */
  relativePath: string;
  /** Human-readable description of what this file tells the LLM */
  description: string;
  /** Category: docs, config, schema, or data */
  category: 'docs' | 'config' | 'schema' | 'data';
  /** File size in bytes */
  size: number;
}

export interface MemoryProvider {
  /** Provider name (e.g., "Mem0", "Zep", "LangMem") */
  name: string;
  /** How it was detected */
  detectedVia: 'dependency' | 'mcp-server' | 'env-var' | 'config-file';
  /** The file or key where it was found */
  source: string;
}

export interface Suggestion {
  /** Which layer this suggestion applies to */
  layer: LayerType;
  /** What to suggest */
  name: string;
  /** Short description */
  description: string;
  /** URL for more info */
  url: string;
  /** Why this suggestion was made (project signal that triggered it) */
  reason: string;
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
  /** Knowledge base files the LLM reads for project understanding */
  knowledgeBase: KnowledgeFile[];
  /** Detected runtime memory providers (Mem0, Zep, etc.) */
  memoryProvider: MemoryProvider | null;
  /** Context-aware suggestions for missing layers */
  suggestions: Suggestion[];
}

// ---- Classification by filename only ----

/** Explicit filename → layer type mapping (case-insensitive via lower-case lookup) */
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

/** Known AI tool config files that are always instruction files */
const AI_TOOL_FILES = new Set([
  'claude.md',
  'agents.md',
  'gemini.md',
  'conventions.md',
  '.cursorrules',
  '.windsurfrules',
  '.clinerules',
  'copilot-instructions.md',
]);

function classifySourceType(relativePath: string): string {
  for (const fileType of FILE_TYPES) {
    for (const pattern of fileType.patterns) {
      if (pattern.test(relativePath)) return fileType.id;
    }
  }
  return 'generic-md';
}

/**
 * Classify a file's layer type by filename and source type only.
 * No keyword/content guessing — only explicit matches.
 */
function inferKind(fileName: string, sourceType: string): { kind: LayerType | null; confidence: number } {
  // 1. Direct filename match (e.g., CONSTRAINTS.md → constraints)
  const filenameKind = FILENAME_LAYER_MAP[fileName.toLowerCase()];
  if (filenameKind) {
    return { kind: filenameKind, confidence: 0.9 };
  }

  // 2. Known AI tool source type with a default kind (e.g., CLAUDE.md → context)
  if (sourceType !== 'generic-md') {
    const fileTypeInfo = getFileTypeInfo(sourceType);
    if (fileTypeInfo?.defaultKind) {
      return { kind: fileTypeInfo.defaultKind, confidence: 0.7 };
    }
  }

  // 3. No match — this file is discovered but unclassified
  return { kind: null, confidence: 0 };
}

/**
 * Check if a file should be picked up by the scanner at all.
 * Only includes files that are explicitly named as instruction files
 * or match known AI tool patterns.
 */
function isInstructionFile(fileName: string, relativePath: string): boolean {
  const lower = fileName.toLowerCase();

  // Explicit layer filename
  if (FILENAME_LAYER_MAP[lower]) return true;

  // Known AI tool config file
  if (AI_TOOL_FILES.has(lower)) return true;

  // Pattern-based AI tool files
  if (lower.endsWith('.mdc')) return true;
  if (lower.endsWith('.prompt.md') || lower.endsWith('.agent.md')) return true;
  if (lower.endsWith('.instructions.md')) return true;
  if (lower.startsWith('llms') && lower.endsWith('.txt')) return true;
  if (lower.startsWith('.aider')) return true;

  // stAIpler native files (have frontmatter — will be verified during parse)
  // Only pick up generic .md in staipler-specific directories
  if (lower.endsWith('.md')) {
    const topDir = relativePath.split(/[/\\]/)[0];
    if (['library', 'stacks', 'contracts'].includes(topDir)) return true;
  }

  return false;
}

function walkFiles(dir: string, rootDir: string, results: ScannedFile[]): void {
  if (!existsSync(dir)) return;

  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'coverage', '.output', '.next',
    '__pycache__', 'vendor', 'Pods', 'build', '.build',
    'DerivedData', 'Carthage', '.gradle', 'target',
    'venv', '.venv', 'env', '.env',
    '.turbo', '.vercel', '.netlify', '.elasticbeanstalk',
    'tests', 'test', '__tests__', '__mocks__', 'fixtures',
    'spec', '__fixtures__', 'testdata',
    'logs',
  ]);

  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);

    // Use lstatSync to avoid crashing on broken symlinks
    let stat;
    try {
      stat = lstatSync(fullPath);
    } catch {
      continue;
    }

    // Skip symlinks entirely — they may point to missing targets
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      if (!skipDirs.has(entry)) {
        walkFiles(fullPath, rootDir, results);
      }
      continue;
    }

    const relativePath = relative(rootDir, fullPath);

    if (!isInstructionFile(entry, relativePath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    const sourceType = classifySourceType(relativePath);

    // Try to parse as stAIpler native (has YAML frontmatter)
    let parsedAsset: Asset | null = null;
    if (content.trimStart().startsWith('---')) {
      try {
        parsedAsset = parseAssetFile(fullPath, content);
      } catch {
        // Not valid stAIpler format
      }
    }

    // Classify layer type
    let inferredKind: LayerType | null = null;
    let inferredConfidence = 0;

    if (parsedAsset) {
      inferredKind = parsedAsset.frontmatter.kind;
      inferredConfidence = 1.0;
    } else {
      const inference = inferKind(entry, sourceType);
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

/**
 * MCP config files that define tool access for AI agents.
 * These count toward the "tools" layer.
 */
const MCP_CONFIG_PATHS = [
  '.claude/settings.json',
  '.claude/settings.local.json',
  'claude_desktop_config.json',
  '.cursor/mcp.json',
  '.vscode/mcp.json',
  'mcp.json',
];

function scanMcpConfigs(rootDir: string, results: ScannedFile[]): void {
  for (const configPath of MCP_CONFIG_PATHS) {
    const fullPath = resolve(rootDir, configPath);
    if (!existsSync(fullPath)) continue;

    let content: string;
    try {
      content = readFileSync(fullPath, 'utf-8');
    } catch {
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(content);
    } catch {
      continue;
    }

    const servers = parsed.mcpServers ?? parsed['mcp-servers'] ?? parsed.servers;
    if (!servers || typeof servers !== 'object' || Object.keys(servers).length === 0) {
      continue;
    }

    const serverNames = Object.keys(servers);
    const summary = `MCP servers: ${serverNames.join(', ')} (${serverNames.length} configured)`;

    results.push({
      path: fullPath,
      relativePath: configPath,
      name: basename(fullPath),
      content: summary,
      sourceType: 'mcp-config',
      parsedAsset: null,
      inferredKind: 'tools',
      inferredConfidence: 0.95,
      contentLength: content.length,
    });
  }
}

// ---- Knowledge base scanning ----

/** Files the LLM reads at runtime for project understanding (not instruction layers) */
const KNOWLEDGE_FILES: { pattern: RegExp | string; description: string; category: KnowledgeFile['category'] }[] = [
  // Documentation
  { pattern: 'README.md', description: 'Project overview', category: 'docs' },
  { pattern: 'ARCHITECTURE.md', description: 'System architecture', category: 'docs' },
  { pattern: 'CONTRIBUTING.md', description: 'Contribution guidelines', category: 'docs' },
  { pattern: 'CHANGELOG.md', description: 'Change history', category: 'docs' },
  { pattern: 'SECURITY.md', description: 'Security policy', category: 'docs' },
  { pattern: 'ROADMAP.md', description: 'Project roadmap', category: 'docs' },
  { pattern: 'PLAN.md', description: 'Implementation plan', category: 'docs' },
  { pattern: 'API.md', description: 'API documentation', category: 'docs' },
  { pattern: /^docs\/.*\.md$/i, description: 'Documentation', category: 'docs' },

  // Project config — tells the LLM about dependencies, scripts, structure
  { pattern: 'package.json', description: 'Dependencies and scripts', category: 'config' },
  { pattern: 'tsconfig.json', description: 'TypeScript configuration', category: 'config' },
  { pattern: 'pyproject.toml', description: 'Python project config', category: 'config' },
  { pattern: 'Cargo.toml', description: 'Rust project config', category: 'config' },
  { pattern: 'go.mod', description: 'Go module config', category: 'config' },
  { pattern: 'Gemfile', description: 'Ruby dependencies', category: 'config' },
  { pattern: 'requirements.txt', description: 'Python dependencies', category: 'config' },
  { pattern: 'Makefile', description: 'Build commands', category: 'config' },
  { pattern: 'Dockerfile', description: 'Container definition', category: 'config' },
  { pattern: 'docker-compose.yml', description: 'Container orchestration', category: 'config' },
  { pattern: 'docker-compose.yaml', description: 'Container orchestration', category: 'config' },
  { pattern: '.env.example', description: 'Environment variables template', category: 'config' },
  { pattern: '.env.local.example', description: 'Local env template', category: 'config' },

  // Schema files — tell the LLM about data models
  { pattern: /^.*\.graphql$/i, description: 'GraphQL schema', category: 'schema' },
  { pattern: /^.*\.prisma$/i, description: 'Database schema', category: 'schema' },
  { pattern: /^.*schema\.sql$/i, description: 'Database schema', category: 'schema' },
  { pattern: /^.*\.proto$/i, description: 'Protocol buffer schema', category: 'schema' },
  { pattern: /openapi\.ya?ml$/i, description: 'OpenAPI specification', category: 'schema' },
  { pattern: /swagger\.ya?ml$/i, description: 'API specification', category: 'schema' },
  { pattern: /openapi\.json$/i, description: 'OpenAPI specification', category: 'schema' },
];

function scanKnowledgeBase(rootDir: string): KnowledgeFile[] {
  const results: KnowledgeFile[] = [];

  const seen = new Set<string>();

  for (const entry of KNOWLEDGE_FILES) {
    if (typeof entry.pattern === 'string') {
      // Exact filename — check at root level (try as-is, then case variants)
      const candidates = [entry.pattern, entry.pattern.toLowerCase(), entry.pattern.toUpperCase()];
      let found = false;
      for (const candidate of candidates) {
        if (found) break;
        const fullPath = resolve(rootDir, candidate);
        if (!existsSync(fullPath)) continue;
        if (seen.has(fullPath)) { found = true; break; }

        let stat;
        try { stat = lstatSync(fullPath); } catch { continue; }
        if (!stat.isFile() || stat.isSymbolicLink()) continue;

        seen.add(fullPath);
        results.push({
          path: fullPath,
          relativePath: candidate,
          description: entry.description,
          category: entry.category,
          size: stat.size,
        });
        found = true;
      }
    } else {
      // Regex pattern — walk root to find matches
      walkForKnowledge(rootDir, rootDir, entry.pattern, entry.description, entry.category, results);
    }
  }

  return results;
}

function walkForKnowledge(
  dir: string, rootDir: string,
  pattern: RegExp, description: string, category: KnowledgeFile['category'],
  results: KnowledgeFile[],
  depth: number = 0,
): void {
  if (depth > 3 || !existsSync(dir)) return; // Don't go too deep

  const skipDirs = new Set([
    'node_modules', '.git', 'dist', 'coverage', '.output', '.next',
    '__pycache__', 'vendor', 'Pods', 'build', '.build', 'logs',
  ]);

  let entries;
  try { entries = readdirSync(dir); } catch { return; }

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let stat;
    try { stat = lstatSync(fullPath); } catch { continue; }
    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      if (!skipDirs.has(entry)) {
        walkForKnowledge(fullPath, rootDir, pattern, description, category, results, depth + 1);
      }
      continue;
    }

    const relativePath = relative(rootDir, fullPath);
    if (pattern.test(relativePath)) {
      results.push({
        path: fullPath,
        relativePath,
        description,
        category,
        size: stat.size,
      });
    }
  }
}

// ---- Memory provider detection ----

/** Known runtime memory providers and how to detect them */
const MEMORY_PROVIDERS: {
  name: string;
  packages: string[];        // npm/pip package names
  envPrefixes: string[];     // env var prefixes (checked in .env.example, .env.local.example)
  mcpNames: string[];        // MCP server name patterns
}[] = [
  {
    name: 'Mem0',
    packages: ['mem0ai', 'mem0', '@mem0/client', 'mem0-mcp'],
    envPrefixes: ['MEM0_'],
    mcpNames: ['mem0', 'mem0-memory'],
  },
  {
    name: 'Zep',
    packages: ['@getzep/zep-cloud', '@getzep/zep-js', 'zep-python', 'zep-cloud'],
    envPrefixes: ['ZEP_'],
    mcpNames: ['zep'],
  },
  {
    name: 'LangMem',
    packages: ['langmem', '@langchain/langmem'],
    envPrefixes: ['LANGMEM_'],
    mcpNames: ['langmem'],
  },
  {
    name: 'Motorhead',
    packages: ['motorhead', '@getmetal/motorhead'],
    envPrefixes: ['MOTORHEAD_'],
    mcpNames: ['motorhead'],
  },
];

function detectMemoryProvider(rootDir: string, mcpServerNames: string[]): MemoryProvider | null {
  // 1. Check MCP server configs for memory providers
  for (const provider of MEMORY_PROVIDERS) {
    for (const mcpName of provider.mcpNames) {
      const match = mcpServerNames.find(s => s.toLowerCase().includes(mcpName));
      if (match) {
        return { name: provider.name, detectedVia: 'mcp-server', source: match };
      }
    }
  }

  // 2. Check package.json dependencies
  const pkgJsonPaths = ['package.json', 'packages/package.json'];
  for (const pkgPath of pkgJsonPaths) {
    const fullPath = resolve(rootDir, pkgPath);
    if (!existsSync(fullPath)) continue;
    try {
      const pkg = JSON.parse(readFileSync(fullPath, 'utf-8'));
      const allDeps = {
        ...(pkg.dependencies ?? {}),
        ...(pkg.devDependencies ?? {}),
      };
      for (const provider of MEMORY_PROVIDERS) {
        for (const pkgName of provider.packages) {
          if (allDeps[pkgName]) {
            return { name: provider.name, detectedVia: 'dependency', source: `${pkgPath} → ${pkgName}` };
          }
        }
      }
    } catch { /* skip */ }
  }

  // 3. Check Python dependencies (requirements.txt, pyproject.toml)
  const pyFiles = ['requirements.txt', 'pyproject.toml'];
  for (const pyFile of pyFiles) {
    const fullPath = resolve(rootDir, pyFile);
    if (!existsSync(fullPath)) continue;
    try {
      const content = readFileSync(fullPath, 'utf-8').toLowerCase();
      for (const provider of MEMORY_PROVIDERS) {
        for (const pkgName of provider.packages) {
          if (content.includes(pkgName.toLowerCase())) {
            return { name: provider.name, detectedVia: 'dependency', source: `${pyFile} → ${pkgName}` };
          }
        }
      }
    } catch { /* skip */ }
  }

  // 4. Check env files for provider-specific env vars
  const envFiles = ['.env.example', '.env.local.example', '.env.sample', '.env.template'];
  for (const envFile of envFiles) {
    const fullPath = resolve(rootDir, envFile);
    if (!existsSync(fullPath)) continue;
    try {
      const content = readFileSync(fullPath, 'utf-8');
      for (const provider of MEMORY_PROVIDERS) {
        for (const prefix of provider.envPrefixes) {
          if (content.includes(prefix)) {
            return { name: provider.name, detectedVia: 'env-var', source: `${envFile} → ${prefix}*` };
          }
        }
      }
    } catch { /* skip */ }
  }

  return null;
}

// ---- Context-aware suggestions ----

interface ProjectSignals {
  hasGit: boolean;
  hasGithub: boolean;
  hasDatabase: boolean;
  hasDocker: boolean;
  hasApi: boolean;
  hasPython: boolean;
  hasNode: boolean;
  hasSlack: boolean;
  language: 'typescript' | 'python' | 'go' | 'rust' | 'ruby' | 'java' | 'unknown';
}

function detectProjectSignals(rootDir: string, knowledgeBase: KnowledgeFile[]): ProjectSignals {
  const has = (file: string) => existsSync(resolve(rootDir, file));

  return {
    hasGit: has('.git'),
    hasGithub: has('.github') || has('.github/workflows'),
    hasDatabase: knowledgeBase.some(f => f.category === 'schema') ||
      has('prisma') || has('migrations') || has('drizzle'),
    hasDocker: has('Dockerfile') || has('docker-compose.yml') || has('docker-compose.yaml'),
    hasApi: knowledgeBase.some(f => f.description.includes('API') || f.description.includes('OpenAPI')),
    hasPython: has('requirements.txt') || has('pyproject.toml') || has('setup.py'),
    hasNode: has('package.json'),
    hasSlack: false, // could check for slack tokens in env examples
    language: has('tsconfig.json') ? 'typescript' :
      has('pyproject.toml') || has('requirements.txt') ? 'python' :
      has('go.mod') ? 'go' :
      has('Cargo.toml') ? 'rust' :
      has('Gemfile') ? 'ruby' :
      has('pom.xml') || has('build.gradle') ? 'java' : 'unknown',
  };
}

function generateSuggestions(
  missingKinds: LayerType[],
  signals: ProjectSignals,
  memoryProvider: MemoryProvider | null,
  mcpServerNames: string[],
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const missingSet = new Set(missingKinds);
  const hasMcp = (name: string) => mcpServerNames.some(s => s.toLowerCase().includes(name));

  // ---- Tools layer suggestions (MCP servers) ----
  if (missingSet.has('tools')) {
    if (signals.hasGithub && !hasMcp('github')) {
      suggestions.push({
        layer: 'tools',
        name: 'GitHub MCP',
        description: 'PRs, issues, code search via MCP',
        url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
        reason: '.github/ detected',
      });
    }
    if (signals.hasDatabase && !hasMcp('postgres') && !hasMcp('sqlite') && !hasMcp('supabase')) {
      suggestions.push({
        layer: 'tools',
        name: 'Database MCP',
        description: 'Query your database directly from the agent',
        url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
        reason: 'Database schema detected',
      });
    }
    if (signals.hasNode && !hasMcp('filesystem')) {
      suggestions.push({
        layer: 'tools',
        name: 'Filesystem MCP',
        description: 'Controlled file read/write access for agents',
        url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
        reason: 'Node.js project',
      });
    }
    if (!hasMcp('brave') && !hasMcp('search') && !hasMcp('web')) {
      suggestions.push({
        layer: 'tools',
        name: 'Web Search MCP',
        description: 'Let your agent search the web',
        url: 'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
        reason: 'No search tool configured',
      });
    }
  }

  // ---- Skills layer suggestions ----
  if (missingSet.has('skills')) {
    suggestions.push({
      layer: 'skills',
      name: 'skill.sh',
      description: 'Pre-built skill definitions for common workflows',
      url: 'https://skill.sh',
      reason: 'No skills layer defined',
    });
    if (signals.hasGithub) {
      suggestions.push({
        layer: 'skills',
        name: 'Code Review Skill',
        description: 'Define how your agent reviews PRs, catches bugs, enforces standards',
        url: 'https://docs.staipler.com/layers/skills',
        reason: 'GitHub workflows detected',
      });
    }
  }

  // ---- Memory layer suggestions ----
  if (missingSet.has('memory') && !memoryProvider) {
    suggestions.push({
      layer: 'memory',
      name: 'Mem0',
      description: 'Managed memory layer with MCP support',
      url: 'https://mem0.ai',
      reason: 'No runtime memory provider',
    });
    suggestions.push({
      layer: 'memory',
      name: 'Zep',
      description: 'Long-term memory for AI agents',
      url: 'https://getzep.com',
      reason: 'No runtime memory provider',
    });
  }

  // ---- Evals layer suggestions ----
  if (missingSet.has('evals')) {
    suggestions.push({
      layer: 'evals',
      name: 'staipler eval',
      description: 'A/B test your instruction stack with blind LLM judging',
      url: 'https://docs.staipler.com/commands/eval',
      reason: 'No eval criteria defined',
    });
  }

  // ---- Policies layer suggestions ----
  if (missingSet.has('policies') && (signals.hasApi || signals.hasDatabase)) {
    suggestions.push({
      layer: 'policies',
      name: 'POLICIES.md',
      description: 'Define data handling, auth, and compliance rules',
      url: 'https://docs.staipler.com/layers/policies',
      reason: signals.hasDatabase ? 'Database detected — agent needs data handling policies' : 'API detected — agent needs access policies',
    });
  }

  return suggestions;
}

export function scan(rootDir: string): ScanResult {
  const absRoot = resolve(rootDir);
  const files: ScannedFile[] = [];

  walkFiles(absRoot, absRoot, files);
  scanMcpConfigs(absRoot, files);

  // Scan knowledge base
  const knowledgeBase = scanKnowledgeBase(absRoot);

  // Detect memory provider — collect MCP server names from already-scanned files
  const mcpServerNames = files
    .filter(f => f.sourceType === 'mcp-config')
    .flatMap(f => {
      // Parse server names from the summary content
      const match = f.content.match(/^MCP servers: (.+) \(/);
      return match ? match[1].split(', ') : [];
    });
  const memoryProvider = detectMemoryProvider(absRoot, mcpServerNames);

  // If a memory provider is detected, credit the memory layer
  if (memoryProvider && !files.some(f => f.inferredKind === 'memory')) {
    files.push({
      path: '',
      relativePath: memoryProvider.source,
      name: memoryProvider.name,
      content: `Runtime memory provided by ${memoryProvider.name} (detected via ${memoryProvider.detectedVia}: ${memoryProvider.source})`,
      sourceType: 'memory-provider',
      parsedAsset: null,
      inferredKind: 'memory',
      inferredConfidence: 0.85,
      contentLength: 0,
    });
  }

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

  // Generate context-aware suggestions for missing layers
  const signals = detectProjectSignals(absRoot, knowledgeBase);
  const suggestions = generateSuggestions(missingKinds, signals, memoryProvider, mcpServerNames);

  return {
    scanRoot: absRoot,
    files,
    byKind,
    presentKinds,
    missingKinds,
    totalContentLength,
    knowledgeBase,
    memoryProvider,
    suggestions,
  };
}
