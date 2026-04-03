/**
 * stAIpler Canonical File Taxonomy
 *
 * Three classes of markdown files:
 *   Class 1: Native first-class stAIpler assets — the core vocabulary
 *   Class 2: Imported adapter assets — external ecosystem files normalized into native model
 *   Class 3: Supporting project docs — not runtime layers, but valuable agent context
 */

import type { LayerType } from '../types.js';

export type FileClass = 'native' | 'imported' | 'supporting';

export type FileCategory =
  | 'runtime-instruction'  // Native: runtime instruction assets (IDENTITY.md, GOALS.md, etc.)
  | 'governance'           // Native: governance and evaluation assets (POLICIES.md, EVALS.md)
  | 'imported-adapter'     // Imported: external ecosystem files (AGENTS.md, CLAUDE.md, etc.)
  | 'project-docs'         // Supporting: project documentation
  | 'discovery'            // Supporting: AI-readability files (llms.txt)
  | 'extension';           // Supporting: prompt templates, agent definitions

export interface FileTypeInfo {
  /** Machine identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Which class this file belongs to */
  fileClass: FileClass;
  /** Category for grouping in UI */
  category: FileCategory;
  /** One-line summary */
  summary: string;
  /** Detailed explanation for education panel */
  description: string;
  /** Which ecosystem/tool uses this */
  ecosystem: string;
  /** What stAIpler layer type this maps to (null = auto-detected from content) */
  defaultKind: LayerType | null;
  /** For imported files: how content sections map to native kinds */
  adapterMapping?: Record<string, LayerType>;
  /** File detection patterns */
  patterns: RegExp[];
  /** Example file paths */
  examples: string[];
}

// =====================================================================
// CLASS 1: NATIVE FIRST-CLASS stAIpler ASSETS
// The core vocabulary — uppercase semantic filenames
// =====================================================================

const NATIVE_RUNTIME: FileTypeInfo[] = [
  {
    id: 'identity-md',
    name: 'IDENTITY.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines who the agent is, its role, and how it frames its purpose.',
    description: 'Defines who the agent is, what role it plays, and how it should frame its purpose. Use this when you want one coherent identity layer. Merge behavior is last-wins so you end up with a single clear persona.',
    ecosystem: 'stAIpler',
    defaultKind: 'identity',
    patterns: [/^IDENTITY\.md$/i, /\/IDENTITY\.md$/i],
    examples: ['library/core/IDENTITY.md', 'IDENTITY.md'],
  },
  {
    id: 'goals-md',
    name: 'GOALS.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines success criteria, priorities, and what matters most.',
    description: 'Defines success criteria, priorities, and what matters most. Use this to keep the model aligned on outcomes rather than only rules. Good goals help the AI prioritize when handling ambiguous requests.',
    ecosystem: 'stAIpler',
    defaultKind: 'goals',
    patterns: [/^GOALS\.md$/i, /\/GOALS\.md$/i],
    examples: ['library/core/GOALS.md'],
  },
  {
    id: 'context-md',
    name: 'CONTEXT.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines domain facts, business rules, terminology, and local knowledge.',
    description: 'Defines domain facts, business rules, terminology, assumptions, and local knowledge. This is usually the highest-value file in practice because it stops the model from free-associating from general internet knowledge.',
    ecosystem: 'stAIpler',
    defaultKind: 'context',
    patterns: [/^CONTEXT\.md$/i, /\/CONTEXT\.md$/i],
    examples: ['library/core/CONTEXT.md', 'library/support/CONTEXT.md'],
  },
  {
    id: 'constraints-md',
    name: 'CONSTRAINTS.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines hard limits and non-negotiables.',
    description: 'Defines hard limits and non-negotiables. Examples: "do not introduce dependencies," "never touch production secrets," "preserve backward compatibility." This is where firm boundaries belong.',
    ecosystem: 'stAIpler',
    defaultKind: 'constraints',
    patterns: [/^CONSTRAINTS\.md$/i, /\/CONSTRAINTS\.md$/i],
    examples: ['library/core/CONSTRAINTS.md'],
  },
  {
    id: 'skills-md',
    name: 'SKILLS.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines procedural know-how, reusable workflows, and capabilities.',
    description: 'Defines procedural know-how at a high level. Use this for reusable workflows and capabilities when you want a native stAIpler skill layer rather than a directory-based imported SKILL.md.',
    ecosystem: 'stAIpler',
    defaultKind: 'skills',
    patterns: [/^SKILLS\.md$/i, /\/SKILLS\.md$/i],
    examples: ['library/support/SKILLS.md'],
  },
  {
    id: 'style-md',
    name: 'STYLE.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines tone, formatting, response shape, and writing conventions.',
    description: 'Defines tone, formatting, response shape, naming preferences, and writing conventions. Merges with last-wins so you end up with one cohesive style.',
    ecosystem: 'stAIpler',
    defaultKind: 'style',
    patterns: [/^STYLE\.md$/i, /\/STYLE\.md$/i],
    examples: ['library/core/STYLE.md'],
  },
  {
    id: 'examples-md',
    name: 'EXAMPLES.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines few-shot examples, templates, or canonical transformations.',
    description: 'Defines few-shot examples, templates, or canonical before/after transformations. Use this when the model benefits from imitation. The most effective way to calibrate output quality.',
    ecosystem: 'stAIpler',
    defaultKind: 'examples',
    patterns: [/^EXAMPLES\.md$/i, /\/EXAMPLES\.md$/i],
    examples: ['library/support/EXAMPLES.md'],
  },
  {
    id: 'tools-md',
    name: 'TOOLS.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines available tools, their purpose, when to use them, and usage rules.',
    description: 'Defines what tools exist, what they are for, when to use them, and any tool usage rules. Especially useful for agentic systems with shell, web, code, or internal tools.',
    ecosystem: 'stAIpler',
    defaultKind: 'tools',
    patterns: [/^TOOLS\.md$/i, /\/TOOLS\.md$/i],
    examples: ['library/core/TOOLS.md'],
  },
  {
    id: 'memory-md',
    name: 'MEMORY.md',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Defines placeholder or default memory — runtime-injectable by default.',
    description: 'Defines placeholder or default memory, not live memory. stAIpler treats this as runtime-injectable by default. The content serves as defaults/placeholders that consumers replace or augment at runtime with actual user/session state.',
    ecosystem: 'stAIpler',
    defaultKind: 'memory',
    patterns: [/^MEMORY\.md$/i, /\/MEMORY\.md$/i, /^\.claude\/memory\.md$/i],
    examples: ['library/core/MEMORY.md', 'MEMORY.md'],
  },
];

const NATIVE_GOVERNANCE: FileTypeInfo[] = [
  {
    id: 'policies-md',
    name: 'POLICIES.md',
    fileClass: 'native',
    category: 'governance',
    summary: 'Defines compliance, trust, legal, brand, or safety rules beyond ordinary constraints.',
    description: 'Defines compliance, trust, legal, brand, or safety rules that go beyond ordinary constraints. Keep this distinct from CONSTRAINTS.md when you want organizational policy to remain inspectable as its own layer.',
    ecosystem: 'stAIpler',
    defaultKind: 'policies',
    patterns: [/^POLICIES\.md$/i, /\/POLICIES\.md$/i],
    examples: ['library/core/POLICIES.md'],
  },
  {
    id: 'evals-md',
    name: 'EVALS.md',
    fileClass: 'native',
    category: 'governance',
    summary: 'Defines evaluation intent, test cases, assertions, or acceptance criteria.',
    description: 'Defines evaluation intent, test cases, assertions, or acceptance criteria. Included in the taxonomy now even though enforcement is Phase 3. Having the asset type lets teams start capturing eval intent early.',
    ecosystem: 'stAIpler',
    defaultKind: 'evals',
    patterns: [/^EVALS\.md$/i, /\/EVALS\.md$/i],
    examples: ['library/core/EVALS.md'],
  },
  {
    id: 'prompts-md',
    name: 'PROMPTS.md',
    fileClass: 'native',
    category: 'governance',
    summary: 'Defines reusable prompt fragments, message templates, or tested instruction snippets.',
    description: 'Defines reusable prompt fragments, message templates, or tested instruction snippets. Useful as a working asset, but treated as lower-level and less canonical than CONTEXT.md or SKILLS.md.',
    ecosystem: 'stAIpler',
    defaultKind: 'prompts',
    patterns: [/^PROMPTS\.md$/i, /\/PROMPTS\.md$/i],
    examples: ['library/core/PROMPTS.md'],
  },
];

// =====================================================================
// CLASS 2: IMPORTED ADAPTER ASSETS
// External ecosystem files normalized into the native model
// =====================================================================

const IMPORTED_ADAPTERS: FileTypeInfo[] = [
  {
    id: 'agents-md',
    name: 'AGENTS.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'A "README for AI" — defines tech stack, build commands, and conventions.',
    description: 'An emerging standard intended as a "README for AI". It defines the project\'s tech stack, build commands, and coding conventions so an agent can onboard itself without human help. OpenAI Codex reads AGENTS.md automatically, making it one of the most important portable instruction filenames.',
    ecosystem: 'OpenAI Codex / Cross-platform',
    defaultKind: null,
    adapterMapping: {
      'project rules and commands': 'context',
      'conventions and guardrails': 'constraints',
      'tool guidance': 'tools',
      'response expectations': 'style',
    },
    patterns: [/^AGENTS\.md$/i, /AGENTS\.md$/i],
    examples: ['AGENTS.md', 'imports/openai/AGENTS.md'],
  },
  {
    id: 'claude-md',
    name: 'CLAUDE.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Project-specific instructions and style guides for Claude Code.',
    description: 'Used by Anthropic\'s Claude Code to store project-specific instructions and style guides. Placed at the project root, it\'s automatically loaded into Claude\'s context. Claude Code\'s docs distinguish instruction context from memory behavior.',
    ecosystem: 'Claude Code',
    defaultKind: null,
    adapterMapping: {
      'project memory/instructions': 'context',
      'behavioral expectations': 'style',
      'safety/process rules': 'policies',
    },
    patterns: [/^CLAUDE\.md$/i, /^\.claude\/.*\.md$/i],
    examples: ['CLAUDE.md', '.claude/settings.md', 'imports/anthropic/CLAUDE.md'],
  },
  {
    id: 'gemini-md',
    name: 'GEMINI.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Project context file for Google\'s Gemini CLI.',
    description: 'Used by Google\'s Gemini CLI as a context file, similar to CLAUDE.md or AGENTS.md. Import similarly into CONTEXT plus optional STYLE and TOOLS based on content analysis.',
    ecosystem: 'Gemini CLI',
    defaultKind: null,
    adapterMapping: {
      'project context': 'context',
      'workflow tips': 'skills',
      'tool usage guidance': 'tools',
    },
    patterns: [/^GEMINI\.md$/i],
    examples: ['GEMINI.md', 'imports/google/GEMINI.md'],
  },
  {
    id: 'skill-md',
    name: 'SKILL.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Self-contained skill package from skills.sh — instructions, resources, and scripts.',
    description: 'A specialized file from the skills.sh ecosystem that defines a "Skill" — a self-contained package of domain expertise. OpenAI defines skills as packaging instructions, resources, and optional scripts, which maps naturally into stAIpler\'s model.',
    ecosystem: 'skills.sh / OpenAI Codex',
    defaultKind: 'skills',
    adapterMapping: {
      'main instructions': 'skills',
      'usage examples': 'examples',
      'helper scripts/resources': 'tools',
    },
    patterns: [/SKILL\.md$/i],
    examples: ['SKILL.md', 'imports/skills/ticket-triage/SKILL.md'],
  },
  {
    id: 'copilot-instructions',
    name: 'copilot-instructions.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Repo-wide custom instructions for GitHub Copilot.',
    description: 'Placed in a .github/ folder, this file provides custom instructions for GitHub Copilot to follow across a workspace. Can specify coding conventions, preferred libraries, and style guidelines.',
    ecosystem: 'GitHub Copilot',
    defaultKind: null,
    adapterMapping: {
      'repo-wide guidance': 'style',
      'guardrails': 'constraints',
    },
    patterns: [/^\.github\/copilot-instructions\.md$/i, /\.github\/copilot/i],
    examples: ['.github/copilot-instructions.md', 'imports/copilot/.github/copilot-instructions.md'],
  },
  {
    id: 'copilot-scoped',
    name: '*.instructions.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Path-scoped GitHub Copilot instructions with applicability boundaries.',
    description: 'Path-specific instruction files for GitHub Copilot that imply applicability boundaries, not just content. These are especially valuable because the scoping metadata is preserved as part of the import. GitHub supports these for narrower targeting within a project.',
    ecosystem: 'GitHub Copilot',
    defaultKind: null,
    adapterMapping: {
      'path-specific guidance': 'style',
      'path-specific constraints': 'constraints',
    },
    patterns: [/\.github\/instructions\/.*\.instructions\.md$/i, /\.instructions\.md$/i],
    examples: ['.github/instructions/backend.instructions.md', '.github/instructions/testing.instructions.md'],
  },
  {
    id: 'cursor-rules',
    name: '.cursorrules / .mdc',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Project-level behavior rules for the Cursor editor.',
    description: 'Files used by the Cursor code editor. Originally a single .cursorrules file, it has evolved into a .cursor/rules/ directory containing .mdc files that can be automatically attached to context based on file patterns.',
    ecosystem: 'Cursor',
    defaultKind: null,
    patterns: [/^\.cursorrules$/i, /\.cursor\/rules\/.*\.mdc$/i, /\.cursor\/rules\/.*\.md$/i],
    examples: ['.cursorrules', '.cursor/rules/react.mdc'],
  },
  {
    id: 'conventions-md',
    name: 'CONVENTIONS.md',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Local coding standards and project rules, commonly used by Aider.',
    description: 'A common naming convention used by tools like Aider to ingest local coding standards and project rules.',
    ecosystem: 'Aider',
    defaultKind: 'constraints',
    patterns: [/^CONVENTIONS\.md$/i],
    examples: ['CONVENTIONS.md'],
  },
  {
    id: 'windsurf-rules',
    name: '.windsurfrules',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Project-level behavior rules for the Windsurf editor.',
    description: 'Configuration files for the Windsurf AI code editor (by Codeium). Similar to .cursorrules, these define project-specific coding conventions and behavioral guidelines.',
    ecosystem: 'Windsurf',
    defaultKind: null,
    patterns: [/^\.windsurfrules$/i, /^\.windsurf\/rules\/.*\.md$/i],
    examples: ['.windsurfrules'],
  },
  {
    id: 'cline-rules',
    name: '.clinerules',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Project-level behavior rules for the Cline AI assistant.',
    description: 'Configuration files for Cline (formerly Claude Dev). These define how Cline should behave within the project.',
    ecosystem: 'Cline',
    defaultKind: null,
    patterns: [/^\.clinerules$/i, /^\.cline\/rules\/.*\.md$/i],
    examples: ['.clinerules'],
  },
  {
    id: 'aider',
    name: 'Aider Config',
    fileClass: 'imported',
    category: 'imported-adapter',
    summary: 'Aider AI coding assistant configuration.',
    description: 'Configuration files for the Aider AI coding assistant. Can include .aider.conf.yml for settings and AIDER.md for project-specific instructions.',
    ecosystem: 'Aider',
    defaultKind: null,
    patterns: [/^\.aider.*$/i, /^AIDER\.md$/i],
    examples: ['.aider.conf.yml', 'AIDER.md'],
  },
];

// =====================================================================
// CLASS 3: SUPPORTING PROJECT DOCS
// Not runtime layers by default, but agents benefit from them
// =====================================================================

const SUPPORTING_DOCS: FileTypeInfo[] = [
  {
    id: 'readme',
    name: 'README.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Top-level orientation — how to run the project and where to start.',
    description: 'Top-level orientation, how to run the project, and where to start. Not an instruction layer by default, but often the best source of project context when no dedicated CONTEXT.md exists.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^README\.md$/i],
    examples: ['README.md'],
  },
  {
    id: 'architecture-md',
    name: 'ARCHITECTURE.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'System structure, subsystem boundaries, and major design choices.',
    description: 'System structure, subsystem boundaries, and major design choices. Invaluable for agents working across subsystems.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^ARCHITECTURE\.md$/i, /\/ARCHITECTURE\.md$/i],
    examples: ['ARCHITECTURE.md'],
  },
  {
    id: 'plan-md',
    name: 'PLAN.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Implementation plan — translates intent into steps.',
    description: 'Implementation plan or execution plan. Often one of the most useful files for coding agents because it translates intent into steps.',
    ecosystem: 'Universal',
    defaultKind: 'goals',
    patterns: [/^PLAN\.md$/i, /^TASK[_-]?PLAN\.md$/i, /^ACTION[_-]?PLAN\.md$/i],
    examples: ['PLAN.md', 'TASK_PLAN.md'],
  },
  {
    id: 'api-md',
    name: 'API.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Endpoints, interfaces, schemas, and contracts.',
    description: 'Endpoints, interfaces, schemas, and contracts. Critical for agents working with APIs.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^API\.md$/i, /\/API\.md$/i],
    examples: ['API.md', 'docs/API.md'],
  },
  {
    id: 'security-md',
    name: 'SECURITY.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Secrets handling, risky areas, and security expectations.',
    description: 'Secrets handling, risky areas, abuse cases, and security expectations. Agents should be aware of these before making changes.',
    ecosystem: 'Universal',
    defaultKind: 'constraints',
    patterns: [/^SECURITY\.md$/i],
    examples: ['SECURITY.md'],
  },
  {
    id: 'testing-md',
    name: 'TESTING.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Test strategy, commands, and verification standards.',
    description: 'Test strategy, commands, and verification standards.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^TESTING\.md$/i, /^TEST_PLAN\.md$/i],
    examples: ['TESTING.md'],
  },
  {
    id: 'deployment-md',
    name: 'DEPLOYMENT.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Release and operational instructions.',
    description: 'Release and operational instructions.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^DEPLOYMENT\.md$/i],
    examples: ['DEPLOYMENT.md'],
  },
  {
    id: 'contributing-md',
    name: 'CONTRIBUTING.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Workflow conventions, PR expectations, and contribution process.',
    description: 'Workflow conventions, PR expectations, and contribution process.',
    ecosystem: 'Universal',
    defaultKind: 'constraints',
    patterns: [/^CONTRIBUTING\.md$/i],
    examples: ['CONTRIBUTING.md'],
  },
  {
    id: 'changelog-md',
    name: 'CHANGELOG.md',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Recent changes and release history.',
    description: 'Recent changes and release history.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^CHANGELOG\.md$/i],
    examples: ['CHANGELOG.md'],
  },
  {
    id: 'decisions-md',
    name: 'DECISIONS.md / ADRs',
    fileClass: 'supporting',
    category: 'project-docs',
    summary: 'Architecture decision records and tradeoff history.',
    description: 'Architecture decision records and tradeoff history. Helps agents understand why things are the way they are.',
    ecosystem: 'Universal',
    defaultKind: 'context',
    patterns: [/^DECISIONS\.md$/i, /docs\/adr\/.*\.md$/i],
    examples: ['DECISIONS.md', 'docs/adr/001-use-postgres.md'],
  },
  // Discovery files
  {
    id: 'llms-txt',
    name: 'llms.txt',
    fileClass: 'supporting',
    category: 'discovery',
    summary: 'A curated site summary for LLM indexers — like robots.txt for AI.',
    description: 'A proposed standard (similar to robots.txt) located at the root of a website. It provides a curated, Markdown-based "cheat sheet" of site content for LLM indexers.',
    ecosystem: 'Web / LLM Indexing',
    defaultKind: 'context',
    patterns: [/^llms\.txt$/i],
    examples: ['llms.txt'],
  },
  {
    id: 'llms-full-txt',
    name: 'llms-full.txt',
    fileClass: 'supporting',
    category: 'discovery',
    summary: 'Comprehensive version of llms.txt — all docs in one file for single-pass ingestion.',
    description: 'A comprehensive version of llms.txt that aggregates all documentation into one long Markdown file for easy ingestion by an LLM in a single pass.',
    ecosystem: 'Web / LLM Indexing',
    defaultKind: 'context',
    patterns: [/^llms-full\.txt$/i],
    examples: ['llms-full.txt'],
  },
  // Extension files
  {
    id: 'prompt-md',
    name: '*.prompt.md',
    fileClass: 'supporting',
    category: 'extension',
    summary: 'Reusable prompt templates that can reference other files for prompt chains.',
    description: 'Reusable prompt templates that can reference other files, often used in VS Code to build complex "prompt chains".',
    ecosystem: 'VS Code / Generic',
    defaultKind: 'prompts',
    patterns: [/\.prompt\.md$/i],
    examples: ['review.prompt.md', 'refactor.prompt.md'],
  },
  {
    id: 'agent-md',
    name: '*.agent.md',
    fileClass: 'supporting',
    category: 'extension',
    summary: 'Defines the persona and core behavior of a specific custom agent.',
    description: 'Defines the persona and core behavior of a specific "Custom Agent". Each .agent.md file is a complete agent definition.',
    ecosystem: 'VS Code / Generic',
    defaultKind: 'identity',
    patterns: [/\.agent\.md$/i],
    examples: ['reviewer.agent.md', 'support.agent.md'],
  },
  {
    id: 'system-prompt',
    name: 'System Prompt',
    fileClass: 'supporting',
    category: 'extension',
    summary: 'Direct system prompt files for AI model configuration.',
    description: 'Files containing system prompts — the foundational instructions given to an AI model before any user interaction.',
    ecosystem: 'Cross-platform',
    defaultKind: null,
    patterns: [/system[_-]?prompt/i, /^PROMPT\.md$/i],
    examples: ['system-prompt.md', 'PROMPT.md'],
  },
  // stAIpler native (catch-all for files with frontmatter)
  {
    id: 'staipler-native',
    name: 'stAIpler Asset',
    fileClass: 'native',
    category: 'runtime-instruction',
    summary: 'Native stAIpler instruction asset with typed frontmatter.',
    description: 'A native stAIpler instruction asset — a markdown file with structured YAML frontmatter that defines its layer type, version, priority, and compatibility. The gold standard: fully typed, composable, and ready for compilation.',
    ecosystem: 'stAIpler',
    defaultKind: null,
    patterns: [],
    examples: ['library/core/IDENTITY.md', 'library/support/SKILLS.md'],
  },
];

/** All file types combined */
export const FILE_TYPES: FileTypeInfo[] = [
  ...NATIVE_RUNTIME,
  ...NATIVE_GOVERNANCE,
  ...IMPORTED_ADAPTERS,
  ...SUPPORTING_DOCS,
];

/** Category descriptions for UI grouping */
export const CATEGORY_INFO: Record<FileCategory, { name: string; description: string; icon: string }> = {
  'runtime-instruction': {
    name: 'Native Runtime Instruction Assets',
    description: 'The core stAIpler vocabulary. These are the files stAIpler compiles directly as part of its contract model. Uppercase semantic filenames: IDENTITY.md, GOALS.md, CONTEXT.md, etc.',
    icon: '&#9733;',
  },
  'governance': {
    name: 'Native Governance & Evaluation Assets',
    description: 'Compliance, policy, evaluation, and prompt management layers. These give your stack accountability and testability.',
    icon: '&#9878;',
  },
  'imported-adapter': {
    name: 'Imported Adapter Assets',
    description: 'External ecosystem files that stAIpler normalizes into native assets. AGENTS.md (OpenAI Codex), CLAUDE.md (Claude Code), GEMINI.md (Gemini CLI), SKILL.md (skills.sh), and GitHub Copilot instruction files.',
    icon: '&#8644;',
  },
  'project-docs': {
    name: 'Supporting Project Documentation',
    description: 'Not always runtime prompt layers, but agents benefit from them. README, ARCHITECTURE, PLAN, API, SECURITY, and more. stAIpler can optionally compile these into context bundles.',
    icon: '&#128196;',
  },
  'discovery': {
    name: 'Discovery & Indexing',
    description: 'Files that make content AI-readable — like robots.txt but for LLMs.',
    icon: '&#128269;',
  },
  'extension': {
    name: 'Prompt Templates & Agent Definitions',
    description: 'Specialized files for reusable prompts, agent personas, and system prompt templates.',
    icon: '&#129513;',
  },
};

/** Class descriptions for top-level UI grouping */
export const CLASS_INFO: Record<FileClass, { name: string; description: string }> = {
  native: {
    name: 'Class 1: Native stAIpler Assets',
    description: 'The files stAIpler understands directly and compiles as part of its contract model. Use uppercase semantic filenames: IDENTITY.md, GOALS.md, CONTEXT.md, CONSTRAINTS.md, SKILLS.md, STYLE.md, EXAMPLES.md, TOOLS.md, MEMORY.md, POLICIES.md, EVALS.md.',
  },
  imported: {
    name: 'Class 2: Imported Adapter Assets',
    description: 'External ecosystem files that stAIpler normalizes into the native asset model. The boundary is clean: if the file exists because another ecosystem expects that filename, it\'s an import.',
  },
  supporting: {
    name: 'Class 3: Supporting Project Docs',
    description: 'Not always runtime prompt layers, but agents benefit from them so much that stAIpler knows how to reference them, surface them, or optionally compile them into context bundles.',
  },
};

/** Look up FileTypeInfo by source type ID */
export function getFileTypeInfo(sourceType: string): FileTypeInfo | undefined {
  return FILE_TYPES.find(ft => ft.id === sourceType);
}

/** Get all file types in a category */
export function getFileTypesByCategory(category: FileCategory): FileTypeInfo[] {
  return FILE_TYPES.filter(ft => ft.category === category);
}

/** Get all file types in a class */
export function getFileTypesByClass(fileClass: FileClass): FileTypeInfo[] {
  return FILE_TYPES.filter(ft => ft.fileClass === fileClass);
}
