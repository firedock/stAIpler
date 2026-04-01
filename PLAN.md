# stAIpler Phase 1 MVP - Implementation Plan (v4 - final)

## Context

stAIpler (stAIpler.com) is an open contract and delivery system for AI instruction layers. It standardizes how markdown-based instruction assets (context, skills, memory, style, policies) are described, composed, versioned, and compiled into runtime packages for apps and agents.

The repo is greenfield. The goal is a working local compiler + CLI that proves the contract model works, not a broad feature surface.

**Positioning:** stAIpler is the contract layer above existing instruction ecosystems (skills.sh, Copilot instructions, Claude skills). Those become inputs. stAIpler defines how they compose.

---

## Decisions

- **Full setup:** Git init + pnpm workspace + @staipler npm org
- **Contracts-first:** Contracts are the organizing principle, not a feature
- **Narrow Phase 1:** Ship `build` + `validate` CLI only. Defer `add`, `list`, `init` to Phase 1.5
- **Adapter abstraction:** External sources go through adapters (stubs in Phase 1)
- **Memory is special:** Compiled as default/placeholder content, flagged for runtime injection
- **No "package" in Phase 1:** Compile assets and stacks only. "Package" deferred until it has a real manifest.

---

## Architecture

**Monorepo with 2 workspace packages:**
- `@staipler/core` - Types, schemas, parser, resolver, compiler, contracts, adapters
- `@staipler/cli` - CLI commands (Phase 1: `build`, `validate`)

Note: "packages/" is the pnpm workspace directory for TypeScript code. Instruction content lives under `library/` (see Project Structure).

**Tech stack:**
- pnpm workspaces, TypeScript (strict), tsup (build), vitest (test)
- Zod (schemas + type inference), gray-matter (frontmatter), yaml (YAML parsing)
- commander.js (CLI), chalk (output)

---

## Core Taxonomy

Each term means exactly one thing. No overloading.

| Concept | Definition | Phase 1? |
|---------|------------|----------|
| **Asset** | One markdown instruction file + its frontmatter metadata. The atomic unit. | Yes |
| **Stack** | A deployment recipe (`stack.yaml`) that references assets by path. Defines what to compile. | Yes |
| **Compiled Bundle** | The resolved runtime artifact: final text + sections + provenance. What gets served. | Yes |
| **Contract** | Optional structural constraint that validates asset sets within a project. | Yes |
| **Package** | A named, versioned, publishable collection of assets with a manifest. | Phase 2 |

**Why defer "package"?** In v2, "package" meant two things (pnpm workspace + instruction collection) and had no manifest. In Phase 1, stacks reference assets directly by path (`library/core/identity.md`). When we add a `package.yaml` manifest with exports, versioning, and dependencies, "package" becomes real. Until then, it's just a folder.

### Layer Types

**Static instruction layers:** identity, goals, context, constraints, skills, style, examples, tools

**Runtime layer - memory:** A `memory.md` can exist as a default/placeholder (e.g., organizational memory, persona defaults), but it is **not live memory**. The compiler includes it in the bundle with `runtimeInjectable: true` to signal consumers: "replace or augment this section at runtime with actual user/session state." stAIpler does not "have memory" - it has a runtime injection hook. Compiled memory sections are defaults/placeholders, not actual session or user state.

### Compatibility Levels

| Level | Description |
|-------|-------------|
| **Native** | Full stAIpler frontmatter and contracts |
| **Imported** | External assets (SKILL.md, Copilot instructions) wrapped via adapter |
| **Compiled target** | Output formatted for specific runtimes (Phase 2) |

---

## Two-Layer Validation Model

### Layer 1: Built-in Schema Validation (always runs)

The Zod schemas for `AssetFrontmatter` and `StackDefinition` are the **platform contract**. Every asset and stack is validated against these schemas automatically. This is not optional. It covers:

- Required fields present and correctly typed
- `kind` is a valid LayerType
- `version` is valid semver
- `id` follows dot-notation
- `priority` is 0-100
- Stack references resolve to existing files
- No circular inheritance, max depth 2

This is implemented in `schema.ts` and `validator.ts`.

### Layer 2: User-Authored Contracts (optional, per-project)

Projects can define additional structural constraints in `.contract.yaml` files. These are **opt-in** and checked during `staipler validate` and as warnings during `staipler build`.

**Scope:** User contracts validate **asset sets within a project** - not individual assets (that's Layer 1) and not runtime behavior (that's Phase 3 evals). A contract asks: "across all the assets matching these criteria, are the structural requirements met?"

```yaml
# contracts/support-agent.contract.yaml
name: support-agent
description: Structural requirements for the support agent asset set
scope: asset-set                       # explicit: this validates a collection, not one file

# Which assets does this contract apply to?
applies_to:
  tags: [support]                      # match assets with these tags

# What must be true about the matched set?
requires:
  must_have_kinds: [skills, context, constraints]   # at least one asset of each kind
  all_must_declare:
    compatibility:
      models: [anthropic]              # every matched asset must declare this
```

This is implemented in `contracts.ts`, completely separate from `schema.ts`. The two layers never overlap: Layer 1 validates individual asset structure, Layer 2 validates set-level project requirements.

---

## Merge Semantics

Priority (0-100, higher wins) determines ordering. Each layer type has a **default** merge strategy:

| Layer Type | Default Strategy | Rationale |
|-----------|-----------------|-----------|
| identity | **last-wins** | Only one identity; highest-priority asset defines it |
| goals | **concatenate** | Goals accumulate |
| context | **concatenate** | Domain facts are additive |
| constraints | **concatenate** | Concatenation is the baseline strategy; conflict detection and semantic tightening are out of scope for Phase 1 |
| skills | **concatenate** | Skills accumulate |
| style | **last-wins** | Style should be cohesive, not blended |
| examples | **concatenate** | More examples = better |
| tools | **concatenate** | Tool definitions accumulate |
| memory | **concatenate** | Defaults/placeholders accumulate |

### Stack-Level Merge Overrides

Stacks can override merge behavior **per layer type**:

```yaml
# stack.yaml
build:
  max_tokens: 8000
  merge:
    skills: last-wins      # override default for this stack
    context: last-wins      # override default for this stack
    # all other types use their defaults
```

The type model supports this exactly:

```typescript
interface BuildConfig {
  max_tokens?: number;
  merge?: Partial<Record<LayerType, MergeStrategy>>;
  target?: CompileTarget;
}
```

If a layer type is not in `merge`, the default from the table above applies.

### Compile Target (structured, not a string)

```typescript
interface CompileTarget {
  modelFamily?: string;      // "anthropic" | "openai" | "google"
  surface?: string;          // "api" | "copilot" | "claude-code"
  format?: string;           // "markdown" | "json" | "text"
}
```

### Target Filtering with Critical Layer Protection

When `target.modelFamily` is set, the compiler filters out incompatible assets. But not all layer types can safely disappear:

**Required layer types** (filtering the last asset of this type = build error):
`identity`, `constraints`

**Optional layer types** (filtering = warning only):
`goals`, `context`, `skills`, `style`, `examples`, `tools`, `memory`

If target filtering would remove the last remaining asset of a required layer type, the build fails with an explicit error: `"CRITICAL_LAYER_REMOVED: Target filter 'anthropic' removed all 'identity' assets. The stack cannot compile without an identity layer."`

---

## Inheritance Model

**Shallow by design.** Max depth: 2 (parent -> child). Docs present inheritance as available but secondary - prefer explicit stack composition as the default.

```yaml
# In asset frontmatter
inherits: core.identity  # single parent asset ID
```

**Behavior:**
- Parent body prepended, child metadata wins
- Inherited assets are resolved globally from `library/` by ID (not required to be in the stack's `includes`)
- Inherited parents **always appear** in `resolvedAssets` and `compileOrder`, even if not directly included by the stack - this ensures provenance is complete
- For anything more complex than one level of inheritance, use stack composition instead

---

## Project Structure

```
staipler/
├── packages/                      # pnpm workspace (TypeScript code)
│   ├── core/                      # @staipler/core
│   │   ├── src/
│   │   │   ├── index.ts           # Public SDK API
│   │   │   ├── types.ts           # All TypeScript interfaces
│   │   │   ├── schema.ts          # Zod schemas (built-in validation)
│   │   │   ├── parser.ts          # Markdown frontmatter parser
│   │   │   ├── resolver.ts        # Asset resolution by path
│   │   │   ├── validator.ts       # Schema + reference validation
│   │   │   ├── contracts.ts       # User-authored contract loading + checking
│   │   │   ├── compiler.ts        # Deterministic baseline compiler
│   │   │   ├── merge.ts           # Per-layer-type merge strategies
│   │   │   ├── adapters/
│   │   │   │   ├── index.ts       # Adapter interface
│   │   │   │   ├── native.ts      # stAIpler-native .md files
│   │   │   │   ├── skill.ts       # SKILL.md format - stub
│   │   │   │   └── copilot.ts     # Copilot instructions - stub
│   │   │   └── errors.ts
│   │   ├── tests/
│   │   │   ├── schema.test.ts
│   │   │   ├── parser.test.ts
│   │   │   ├── resolver.test.ts
│   │   │   ├── contracts.test.ts
│   │   │   ├── merge.test.ts
│   │   │   ├── compiler.test.ts
│   │   │   └── fixtures/          # Sample + deliberately broken assets/stacks
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── cli/                       # @staipler/cli
│       ├── src/
│       │   ├── index.ts           # Entry point + bin
│       │   └── commands/
│       │       ├── build.ts
│       │       └── validate.ts
│       ├── package.json
│       └── tsconfig.json
├── library/                       # Instruction content (NOT pnpm packages)
│   ├── core/                      # Shared base assets
│   │   ├── identity.md
│   │   ├── reasoning.md
│   │   └── safety.md
│   └── support/                   # Domain-specific assets
│       ├── context.md
│       ├── skills.md
│       └── style.md
├── stacks/                        # Stack definitions
│   ├── customer-support/
│   │   ├── stack.yaml
│   │   ├── context.md             # Local overrides
│   │   └── skills.md
│   └── code-reviewer/
│       ├── stack.yaml
│       └── skills.md
├── contracts/                     # User-authored contract files
│   └── support-agent.contract.yaml
├── diagrams/                      # Mermaid architecture diagrams
│   ├── architecture.mmd           # Full system pipeline
│   ├── resolution.mmd             # Asset reference resolution
│   ├── validation.mmd             # Two-layer validation model
│   └── bundle.mmd                 # Compiled bundle structure
├── schemas/                       # Generated JSON schemas
├── package.json                   # Root workspace config
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vitest.config.ts
├── staipler.config.yaml           # Project root marker + settings
├── .gitignore
├── LICENSE
└── README.md
```

### Directory disambiguation
- `packages/` = pnpm workspace (TypeScript source code for @staipler/core and @staipler/cli)
- `library/` = instruction content (reusable .md assets organized by domain)
- `stacks/` = deployment recipes (stack.yaml + local asset overrides)
- `contracts/` = optional user-authored structural constraints
- `diagrams/` = Mermaid architecture diagrams (4 files)

---

## Key Data Models

```typescript
// === LAYER TYPES ===
type StaticLayerType = 'identity' | 'goals' | 'context' | 'constraints' |
                       'skills' | 'style' | 'examples' | 'tools';
type RuntimeLayerType = 'memory';
type LayerType = StaticLayerType | RuntimeLayerType;

// Required layer types that cannot be fully filtered out by target
const REQUIRED_LAYER_TYPES: LayerType[] = ['identity', 'constraints'];

type MergeStrategy = 'concatenate' | 'last-wins';

// === ASSET (atomic unit) ===
interface AssetFrontmatter {
  id: string;                          // dot-notation: "support.skills.triage"
  kind: LayerType;
  version: string;                     // semver
  title: string;
  summary?: string;
  tags?: string[];
  compatibility?: {
    models?: string[];                 // ["openai", "anthropic", "google"]
    surfaces?: string[];               // ["api", "copilot", "claude-code"]
  };
  inputs?: string[];                   // skills-specific
  outputs?: string[];                  // skills-specific
  inherits?: string;                   // single parent asset ID (shallow, max depth 2)
  priority?: number;                   // 0-100, default 50
  sources?: { type: string; ref: string }[];
}

interface Asset {
  frontmatter: AssetFrontmatter;
  body: string;                        // markdown content
  source: string;                      // file path for error reporting
  resolvedPath: string;                // filesystem-resolved absolute path
  format: 'native' | 'imported';
}

// === STACK (deployment recipe) ===
interface AssetReference {
  asset: string;                       // "core/identity" or "./context.md"
  priority?: number;                   // override asset's default priority
}

interface CompileTarget {
  modelFamily?: string;
  surface?: string;
  format?: string;
}

interface BuildConfig {
  max_tokens?: number;
  merge?: Partial<Record<LayerType, MergeStrategy>>;
  target?: CompileTarget;
}

interface StackDefinition {
  name: string;
  version: string;
  description: string;
  includes: AssetReference[];
  overrides?: Record<string, unknown>;
  build?: BuildConfig;
}

// === COMPILED BUNDLE (runtime artifact) ===
interface CompiledBundle {
  stackId: string;
  version: string;
  compiledAt: string;
  hash: string;                        // SHA-256 of fullText
  buildConfig: BuildConfig;            // top-level: the recipe that produced this bundle

  sections: CompiledSection[];
  fullText: string;

  // Provenance
  resolvedAssets: ResolvedAssetInfo[];
  compileOrder: string[];              // asset IDs in application order
  contractResults: ContractResult[];
  warnings: CompileWarning[];
  metadata: {
    assetCount: number;
    tokenEstimate: number;
    sources: string[];                 // file paths
  };
}

interface ResolvedAssetInfo {
  id: string;
  version: string;
  source: string;                      // user-facing reference ("core/identity")
  resolvedPath: string;                // filesystem path ("/abs/path/library/core/identity.md")
  inherited: boolean;                  // true if pulled in via inherits, not includes
}

interface CompiledSection {
  kind: LayerType;
  id: string;
  title: string;
  priority: number;
  content: string;
  runtimeInjectable: boolean;          // true for memory layers
}

interface ContractResult {
  contract: string;                    // "builtin:schema" or "user:support-agent"
  passed: boolean;
  issues: string[];
}

interface CompileWarning {
  code: string;                        // e.g. "FILTERED_ASSET", "MISSING_COMPAT"
  message: string;
  asset?: string;
}

// === USER CONTRACT (optional .contract.yaml) ===
interface ContractDefinition {
  name: string;
  description: string;
  scope: 'asset-set';                  // Phase 1: always asset-set
  applies_to: {
    tags?: string[];
    kinds?: LayerType[];
  };
  requires: {
    must_have_kinds?: LayerType[];     // at least one asset of each listed kind
    all_must_declare?: {
      compatibility?: {
        models?: string[];
        surfaces?: string[];
      };
    };
  };
}
```

---

## CLI Argument Semantics

`<stack>` is always a **directory name** under `stacks/`. It is not a file path or logical ID. Consistent across all commands.

```bash
staipler build customer-support          # looks for stacks/customer-support/stack.yaml
staipler validate customer-support       # validates that stack
staipler validate                        # validates all stacks + all library assets
```

The resolver finds the project root by walking up from CWD looking for `staipler.config.yaml`.

---

## Asset Reference Resolution

Stack `includes` entries are resolved as follows:

```yaml
# stack.yaml
includes:
  - asset: core/identity          # -> <projectRoot>/library/core/identity.md
  - asset: core/safety            # -> <projectRoot>/library/core/safety.md
  - asset: ./context.md           # -> <stackDir>/context.md (local override)
  - asset: ./skills.md            # -> <stackDir>/skills.md (local override)
```

**Rules:**
- Paths starting with `./` are relative to the stack directory
- All other paths are relative to `library/`
- The `.md` extension is optional in references (auto-appended if missing)
- Resolution fails with a clear error if the file doesn't exist
- Both the user-facing reference (`core/identity`) and the resolved filesystem path are preserved on the `Asset` object for error reporting and provenance

**Inheritance resolution:**
- `inherits` references are resolved globally by scanning `library/` for an asset whose `id` matches
- Inherited assets do NOT need to appear in `includes` - they are pulled in automatically
- They are always recorded in `resolvedAssets` with `inherited: true`

---

## Compilation Algorithm (Deterministic Baseline)

```
COMPILE(stackName, projectRoot):

  1. LOCATE stack: <projectRoot>/stacks/<stackName>/stack.yaml
     Validate against StackDefinition Zod schema
     -> stackDef

  2. RESOLVE asset references:
     For each entry in stackDef.includes:
       if starts with "./": resolve relative to stack directory
       else: resolve relative to <projectRoot>/library/
       Parse file through adapter chain (try native first)
       Apply priority override from reference if specified
       Store both user reference and resolvedPath on Asset
     -> resolvedAssets[]

  3. BUILT-IN VALIDATION (Layer 1):
     Validate every asset's frontmatter against AssetFrontmatter schema
     Check: no circular inheritance, all inherits targets exist, max depth 2
     -> contractResults[] (prefixed "builtin:")

  4. USER CONTRACT VALIDATION (Layer 2):
     Load *.contract.yaml from <projectRoot>/contracts/
     For each contract, find matching asset set (by tags/kinds)
     Check set-level structural requirements (must_have_kinds, all_must_declare)
     -> contractResults[] (prefixed "user:")

  5. FILTER by target (with critical layer protection):
     If stackDef.build.target.modelFamily is set:
       For each asset:
         if asset.compatibility.models exists AND doesn't include modelFamily:
           mark for exclusion
       Check: would exclusion remove all assets of a REQUIRED layer type?
         YES -> build error (CRITICAL_LAYER_REMOVED)
         NO  -> exclude with warning
     -> filteredAssets[]

  6. PROCESS inheritance (max depth 2):
     For each asset with inherits:
       Resolve parent by ID from library/ (global scan)
       Cycle detection (already validated in step 3)
       Prepend parent body, child metadata wins
       Add parent to resolvedAssets with inherited: true
     -> flatAssets[]

  7. GROUP + SORT:
     Group by kind (layer type)
     Within each group, sort ascending by priority (lower = base)

  8. APPLY MERGE per group:
     For each layer type:
       strategy = stackDef.build.merge[kind] ?? DEFAULT_MERGE[kind]
       concatenate: keep all assets in priority order
       last-wins: keep only highest-priority asset

  9. ORDER sections canonically:
     identity -> goals -> context -> constraints -> skills ->
     style -> examples -> tools -> memory

  10. ASSEMBLE fullText:
      For each section: "## {title}\n\n{content}\n\n"
      Mark memory sections: runtimeInjectable = true

  11. COMPUTE provenance:
      hash = SHA-256(fullText)
      tokenEstimate = fullText.length / 4
      compileOrder = asset IDs in the order they were applied
      sources = resolvedPath of all contributing assets

  12. RETURN CompiledBundle
```

---

## Adapter Abstraction

All files pass through an adapter to produce an `Asset`. This keeps the door open for non-native formats.

```typescript
interface Adapter {
  name: string;
  canHandle(filePath: string, content: string): boolean;
  parse(filePath: string, content: string): Asset;
}
```

**Phase 1 adapters:**
- `native` - Full stAIpler frontmatter. Fully implemented.
- `skill` - SKILL.md format (skills.sh). Stub: maps known fields to AssetFrontmatter, sets `format: 'imported'`.
- `copilot` - Copilot instruction files. Stub: similar mapping.

Adapter chain: try `native` first, then `skill`, then `copilot`. First `canHandle` match wins.

---

## CLI Commands

### Phase 1 (this release)

| Command | Description |
|---------|-------------|
| `staipler build <stack>` | Compile stack to bundle. `--out <path>`, `--format json\|text\|markdown` |
| `staipler validate [stack]` | Validate all or one stack. Schema, refs, contracts, cycles |

### Phase 1.5 (fast follow)

| Command | Description |
|---------|-------------|
| `staipler init [dir]` | Scaffold new project |
| `staipler list` | List stacks and library assets |
| `staipler add <url>` | Import assets via adapter from GitHub/URLs |
| `staipler visualize <stack>` | Generate composition diagram. `--view source\|bundle`, `--format mermaid\|markdown` |

### Visualize command (Phase 1.5)

Generates Mermaid diagrams from the same compiler data (`resolvedAssets`, `compileOrder`, inheritance, merge decisions, filtered assets). Two views:

- `--view source` - Input graph: which assets are included, inherited, filtered, and from where
- `--view bundle` - Output structure: final compiled sections in canonical order with merge labels

Visual markers: dashed edges for inheritance, gray/red for filtered assets, badges for last-wins vs concatenate, icon for `runtimeInjectable` memory. This turns diagrams into a debugging tool, not just documentation.

---

## Diagrams

Four Mermaid diagrams ship in `diagrams/` at the project root:

| File | Shows |
|------|-------|
| `architecture.mmd` | Full system pipeline: authoring -> adapters -> compiler -> bundle -> consumers |
| `resolution.mmd` | Asset reference resolution: `./` local vs `library/` paths |
| `validation.mmd` | Two-layer validation: built-in schema vs user contracts |
| `bundle.mmd` | Compiled bundle structure: sections, provenance, metadata, output formats |

These are static documentation diagrams. The `visualize` command (Phase 1.5) generates dynamic diagrams from actual compile results.

---

## Implementation Order

1. **Project scaffolding** - git init, pnpm workspace, tsconfigs, package.jsons, vitest, .gitignore, staipler.config.yaml
2. **Types + schemas** - `types.ts` (all interfaces), `schema.ts` (Zod for AssetFrontmatter + StackDefinition), `errors.ts`
3. **Parser + native adapter** - `parser.ts`, `adapters/index.ts`, `adapters/native.ts` + tests
4. **Resolver** - `resolver.ts` - path resolution (library/ vs ./ local), inheritance resolution by ID, file existence checks + tests
5. **Validator** - `validator.ts` - built-in schema validation, inheritance depth/cycle checks, ref integrity + tests
6. **User contracts** - `contracts.ts` - load .contract.yaml, match asset sets, check structural reqs + tests
7. **Merge engine** - `merge.ts` - default strategies per layer type, stack overrides via `Partial<Record>` + tests
8. **Compiler** - `compiler.ts` - full algorithm, provenance, hash, target filtering with critical layer protection + tests
9. **SDK API** - `index.ts` - wire `buildStack`, `validateStack`, `parseAsset`
10. **Sample content** - library/ assets, 2 stacks, 1 contract
11. **CLI** - `build` and `validate` commands
12. **Adapter stubs** - `skill.ts`, `copilot.ts`
13. **Diagrams** - 4 Mermaid files in `diagrams/`
14. **JSON schema generation** - zod-to-json-schema for `schemas/`
15. **README** - Vision, quick start, sample output, contract model, link to diagrams

---

## Required Test Fixtures

Each fixture represents a distinct compiler behavior. These are the product in miniature.

| Fixture | Tests |
|---------|-------|
| `basic-stack` | 1 library asset + 1 local override -> compiles correctly |
| `inherited-stack` | Asset with `inherits` -> parent prepended, parent in resolvedAssets with `inherited: true` |
| `filtered-stack` | Target `modelFamily: anthropic` -> incompatible asset excluded with warning |
| `critical-filter-fail` | Target filter removes last `identity` asset -> build error CRITICAL_LAYER_REMOVED |
| `contracted-stack` | User contract applies -> passes validation |
| `contract-fail` | User contract requires `must_have_kinds: [constraints]` but none present -> fails |
| `merge-override` | Stack overrides `skills: last-wins` -> only highest-priority skill survives |
| `missing-ref` | Stack references nonexistent asset -> clear error with path shown |
| `circular-inherit` | A inherits B inherits A -> caught, clear error |
| `deep-inherit` | 3-level inheritance -> rejected, max depth 2 |
| `memory-section` | Memory asset compiles with `runtimeInjectable: true` |

---

## Verification

- `pnpm test` - all unit + integration tests pass (including all fixtures above)
- `staipler build customer-support` - compiles, output has provenance + hash + contractResults
- `staipler build customer-support --format text` - clean prompt text output
- `staipler validate` - catches errors in broken test fixtures
- `staipler validate customer-support` - passes on valid stack
- Contract results distinguish `"builtin:schema"` from `"user:support-agent"`
- Target filtering: `modelFamily: anthropic` excludes incompatible assets with warning
- Target filtering: removing last identity asset = build error
- Merge: identity uses last-wins, skills uses concatenate (default). Stack override works.
- Memory sections have `runtimeInjectable: true`
- Asset references: `core/identity` resolves to `library/core/identity.md`
- Asset references: `./context.md` resolves to stack-local file
- Inherited assets appear in `resolvedAssets` with `inherited: true` and in `compileOrder`
- `resolvedPath` on assets preserves the filesystem path alongside the user-facing reference
- `buildConfig` is top-level on CompiledBundle, not nested in metadata
- SDK: `import { buildStack } from '@staipler/core'` works

---

## What Phase 1 explicitly defers

- "Package" as a first-class concept with manifest (Phase 2)
- `staipler add <url>` / external import (Phase 1.5)
- `staipler init` / `staipler list` (Phase 1.5)
- `staipler visualize` / dynamic diagram generation (Phase 1.5)
- Compiled target format rendering (Phase 2 - Phase 1 only filters)
- Evaluation contracts / eval runner (Phase 3)
- Content-level assertions / conflict detection (Phase 3)
- Hosted API / registry (Phase 2)
- A/B testing, optimization, analytics (Phase 3)
- npm package publishing (after Phase 1 is stable)
