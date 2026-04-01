# stAIpler Phase 1 - Test & Validation Plan (TDD)

## Approach

Test-Driven Development throughout. For each implementation step:

1. Write test fixtures (sample assets, stacks, contracts)
2. Write failing tests for the module
3. Implement until tests pass
4. Refactor with confidence

**Tools:** vitest (unit + integration), Node.js child_process (CLI e2e)

---

## Test Fixtures

All fixtures live in `packages/core/tests/fixtures/`. Each fixture is a minimal, self-contained scenario that exercises one compiler behavior.

### Fixture Directory Structure

```
packages/core/tests/fixtures/
├── assets/                          # Standalone asset files for parser/schema tests
│   ├── valid-identity.md            # Well-formed identity asset
│   ├── valid-skills.md              # Well-formed skills asset
│   ├── valid-memory.md              # Memory layer asset
│   ├── invalid-missing-id.md        # Missing required `id` field
│   ├── invalid-bad-semver.md        # Version "1.0" (not valid semver)
│   ├── invalid-bad-kind.md          # kind: "personality" (not a LayerType)
│   ├── invalid-priority-range.md    # priority: 150 (out of 0-100)
│   ├── empty-body.md                # Valid frontmatter, empty markdown body
│   └── malformed-frontmatter.md     # Broken YAML in frontmatter
│
├── basic-stack/                     # Minimal happy path
│   ├── stack.yaml
│   ├── context.md                   # Local override
│   └── library/
│       └── core/
│           └── identity.md
│
├── inherited-stack/                 # Inheritance resolution
│   ├── stack.yaml                   # Includes child asset only
│   └── library/
│       ├── core/
│       │   └── base-identity.md     # Parent asset
│       └── support/
│           └── identity.md          # Child with `inherits: core.base-identity`
│
├── filtered-stack/                  # Target filtering (warning path)
│   ├── stack.yaml                   # target.modelFamily: anthropic
│   └── library/
│       ├── core/
│       │   └── identity.md          # compatibility.models: [anthropic]
│       ├── support/
│       │   └── skills.md            # compatibility.models: [openai] -> filtered out
│       └── fallback/
│           └── constraints.md       # compatibility.models: [anthropic]
│
├── critical-filter-fail/            # Target filtering removes required layer
│   ├── stack.yaml                   # target.modelFamily: google
│   └── library/
│       └── core/
│           └── identity.md          # compatibility.models: [anthropic] -> would remove last identity
│
├── contracted-stack/                # User contract passes
│   ├── stack.yaml
│   ├── contract/
│   │   └── support-agent.contract.yaml
│   └── library/
│       ├── core/
│       │   └── identity.md
│       └── support/
│           ├── skills.md            # tags: [support]
│           ├── context.md           # tags: [support]
│           └── constraints.md       # tags: [support]
│
├── contract-fail/                   # User contract fails (missing required kind)
│   ├── stack.yaml
│   ├── contract/
│   │   └── support-agent.contract.yaml  # requires must_have_kinds: [constraints]
│   └── library/
│       ├── core/
│       │   └── identity.md
│       └── support/
│           ├── skills.md            # tags: [support]
│           └── context.md           # tags: [support] (no constraints asset)
│
├── merge-override/                  # Stack overrides default merge strategy
│   ├── stack.yaml                   # build.merge.skills: last-wins
│   └── library/
│       └── support/
│           ├── identity.md
│           ├── constraints.md
│           ├── skills-base.md       # priority: 30
│           └── skills-advanced.md   # priority: 70 -> this one wins
│
├── missing-ref/                     # Stack references nonexistent asset
│   └── stack.yaml                   # includes: core/nonexistent
│
├── circular-inherit/                # A inherits B inherits A
│   ├── stack.yaml
│   └── library/
│       └── circular/
│           ├── a.md                 # inherits: circular.b
│           └── b.md                 # inherits: circular.a
│
├── deep-inherit/                    # 3-level inheritance (rejected)
│   ├── stack.yaml
│   └── library/
│       └── deep/
│           ├── grandparent.md
│           ├── parent.md            # inherits: deep.grandparent
│           └── child.md             # inherits: deep.parent -> depth 3, rejected
│
└── memory-section/                  # Memory compiles with runtimeInjectable
    ├── stack.yaml
    └── library/
        ├── core/
        │   └── identity.md
        └── memory/
            └── defaults.md          # kind: memory
```

---

## Unit Tests

Tests are written **before** their corresponding implementation module. Each test file maps 1:1 to a source module.

### 1. `schema.test.ts` — Zod Schema Validation

Written before: `schema.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Valid identity frontmatter parses | `valid-identity.md` frontmatter fields | Parse succeeds, all fields present |
| Valid skills frontmatter with optional fields | Frontmatter with `inputs`, `outputs`, `tags` | Parse succeeds |
| Missing required `id` rejected | `{ kind, version, title }` (no id) | Zod error on `id` |
| Missing required `kind` rejected | `{ id, version, title }` (no kind) | Zod error on `kind` |
| Missing required `version` rejected | `{ id, kind, title }` (no version) | Zod error on `version` |
| Missing required `title` rejected | `{ id, kind, version }` (no title) | Zod error on `title` |
| Invalid `kind` rejected | `kind: "personality"` | Zod error: not a valid LayerType |
| Invalid semver rejected | `version: "1.0"` | Zod error on version format |
| Priority below 0 rejected | `priority: -1` | Zod error on priority range |
| Priority above 100 rejected | `priority: 150` | Zod error on priority range |
| Priority defaults to 50 | No priority field | Parsed priority = 50 |
| Valid id format (dot-notation) | `id: "support.skills.triage"` | Parse succeeds |
| Compatibility fields optional | No `compatibility` field | Parse succeeds |
| Valid stack definition parses | Complete `stack.yaml` fields | Parse succeeds |
| Stack missing `name` rejected | `{ version, description, includes }` | Zod error |
| Stack missing `includes` rejected | `{ name, version, description }` | Zod error |
| Stack `includes` empty array rejected | `includes: []` | Zod error |
| Stack with build config parses | `build.max_tokens`, `build.merge`, `build.target` | Parse succeeds |
| Stack merge override valid types | `merge: { skills: "last-wins" }` | Parse succeeds |
| Stack merge invalid strategy rejected | `merge: { skills: "blend" }` | Zod error |
| CompileTarget partial fields valid | `target: { modelFamily: "anthropic" }` | Parse succeeds |

### 2. `parser.test.ts` — Frontmatter Parser

Written before: `parser.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Parses valid asset file | `valid-identity.md` | Correct frontmatter + body split |
| Body content preserved exactly | Asset with markdown body | `body` matches content after frontmatter |
| Empty body allowed | `empty-body.md` | Parses with `body: ""` |
| Malformed frontmatter throws | `malformed-frontmatter.md` | ParseError with file path in message |
| No frontmatter delimiters throws | Plain markdown file | ParseError |
| Source path preserved on asset | Any valid file | `asset.source` matches input path |
| Whitespace in body trimmed consistently | Body with leading/trailing newlines | Body trimmed |

### 3. `resolver.test.ts` — Asset Resolution

Written before: `resolver.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Library path resolves | `core/identity` | `<root>/library/core/identity.md` |
| Library path with `.md` resolves | `core/identity.md` | `<root>/library/core/identity.md` |
| Local path resolves relative to stack | `./context.md` | `<stackDir>/context.md` |
| Missing library asset throws | `core/nonexistent` | ResolveError with attempted path |
| Missing local asset throws | `./nonexistent.md` | ResolveError with attempted path |
| Inheritance resolves by ID globally | `inherits: core.base-identity` | Finds asset in `library/` by scanning `id` fields |
| Inheritance target not found throws | `inherits: nonexistent.asset` | ResolveError |
| Project root found by config walk | Nested CWD | Finds `staipler.config.yaml` ancestor |
| No project root throws | `/tmp/` | ProjectRootError |
| Priority override from reference applied | `{ asset: "core/identity", priority: 90 }` | Asset priority = 90 |
| Both source ref and resolvedPath set | Any resolved asset | `source` = user ref, `resolvedPath` = abs path |

### 4. `validator.test.ts` — Built-in Validation (Layer 1)

Written before: `validator.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Valid assets pass | Array of well-formed assets | `{ passed: true, issues: [] }` |
| Invalid frontmatter caught | Asset with bad schema | `passed: false`, issues list schema errors |
| Circular inheritance detected | `circular-inherit` fixture | Error: circular inheritance between A and B |
| Deep inheritance rejected (depth 3) | `deep-inherit` fixture | Error: max inheritance depth 2 exceeded |
| Depth 2 inheritance allowed | Parent -> child | Passes |
| Missing inheritance target caught | `inherits: nonexistent` | Error: inheritance target not found |
| Missing stack ref caught | Stack references `core/nonexistent` | Error with path |
| All refs resolved passes | `basic-stack` fixture | `{ passed: true }` |
| Contract result prefixed `builtin:` | Any validation | Result `contract` field starts with `"builtin:"` |

### 5. `contracts.test.ts` — User Contract Validation (Layer 2)

Written before: `contracts.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Load valid contract YAML | `support-agent.contract.yaml` | Parsed ContractDefinition |
| Invalid contract schema rejected | Contract missing `name` | Parse error |
| Tag matching finds correct assets | Assets with `tags: [support]` | Only tagged assets matched |
| `must_have_kinds` passes when met | Contract requires `[skills, context, constraints]`, all present | `{ passed: true }` |
| `must_have_kinds` fails when missing | Contract requires `[constraints]`, none present | `{ passed: false }`, issue names missing kind |
| `all_must_declare` passes when met | All matched assets declare `models: [anthropic]` | `{ passed: true }` |
| `all_must_declare` fails when missing | One matched asset lacks `compatibility.models` | `{ passed: false }`, issue names asset |
| No matching assets = contract skipped | Contract `applies_to` matches nothing | `{ passed: true }` (vacuously) |
| Multiple contracts evaluated independently | Two contract files | Two ContractResult entries |
| Contract result prefixed `user:` | Any user contract | Result `contract` field = `"user:<name>"` |

### 6. `merge.test.ts` — Merge Engine

Written before: `merge.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Concatenate: all assets kept in order | 3 skills assets, priority 20/50/80 | All 3 in ascending priority order |
| Concatenate: bodies joined with separator | 2 context assets | Combined content with `\n\n` separation |
| Last-wins: only highest priority kept | 3 identity assets, priority 20/50/80 | Only priority 80 asset |
| Last-wins: tie broken deterministically | 2 assets same priority | Consistent winner (by ID alphabetical) |
| Default strategy for identity | No override | last-wins |
| Default strategy for skills | No override | concatenate |
| Default strategy for goals | No override | concatenate |
| Default strategy for style | No override | last-wins |
| Default strategy for memory | No override | concatenate |
| Stack override respected | `merge: { skills: "last-wins" }` | Only highest-priority skill kept |
| Override only affects specified type | Override skills, leave context | Context still concatenates |

### 7. `compiler.test.ts` — Full Compilation Pipeline

Written before: `compiler.ts`

| Test Case | Fixture | Expected |
|-----------|---------|----------|
| Basic compile succeeds | `basic-stack` | CompiledBundle with sections, fullText, hash |
| Hash is SHA-256 of fullText | `basic-stack` | `hash` matches `crypto.createHash('sha256').update(fullText)` |
| Token estimate calculated | `basic-stack` | `metadata.tokenEstimate` = `fullText.length / 4` |
| Sections in canonical order | `basic-stack` | identity -> goals -> context -> ... -> memory |
| Inherited asset included | `inherited-stack` | Parent in `resolvedAssets` with `inherited: true` |
| Inherited parent in compileOrder | `inherited-stack` | Parent ID in `compileOrder` |
| Parent body prepended | `inherited-stack` | Child section starts with parent content |
| Target filters incompatible asset | `filtered-stack` | Warning with code `FILTERED_ASSET` |
| Filtered asset not in sections | `filtered-stack` | No section from filtered asset |
| Critical filter = build error | `critical-filter-fail` | Error `CRITICAL_LAYER_REMOVED` |
| Contract results in bundle | `contracted-stack` | `contractResults` includes `user:support-agent` passed |
| Contract failure in bundle | `contract-fail` | `contractResults` includes `user:support-agent` failed |
| Merge override applied | `merge-override` | Only highest-priority skills asset in output |
| Memory section runtimeInjectable | `memory-section` | Memory section has `runtimeInjectable: true` |
| Non-memory sections not injectable | `basic-stack` | All sections have `runtimeInjectable: false` |
| buildConfig on bundle top-level | `basic-stack` | `bundle.buildConfig` exists (not nested in metadata) |
| compileOrder matches application | `basic-stack` | Order matches how assets were applied |
| sources lists all file paths | `basic-stack` | `metadata.sources` = resolvedPaths of all assets |
| Missing ref = clear error | `missing-ref` | Error message includes attempted path |
| Circular inherit = clear error | `circular-inherit` | Error message names both assets |
| Deep inherit = clear error | `deep-inherit` | Error message states max depth 2 |
| assetCount correct | `basic-stack` | `metadata.assetCount` matches actual count |

### 8. `adapters.test.ts` — Adapter Chain

Written before: `adapters/skill.ts`, `adapters/copilot.ts`

| Test Case | Input | Expected |
|-----------|-------|----------|
| Native adapter handles stAIpler files | File with stAIpler frontmatter | `canHandle` = true, parsed asset with `format: 'native'` |
| Native adapter rejects non-stAIpler | Plain markdown | `canHandle` = false |
| Skill adapter handles SKILL.md | File matching SKILL.md conventions | `canHandle` = true, `format: 'imported'` |
| Skill adapter maps fields correctly | SKILL.md with known fields | Frontmatter fields mapped to AssetFrontmatter |
| Copilot adapter handles copilot format | Copilot instruction file | `canHandle` = true, `format: 'imported'` |
| Adapter chain tries native first | stAIpler file | Native adapter wins |
| Adapter chain falls through | SKILL.md file | Skill adapter wins after native rejects |
| No adapter matches = error | Binary file | AdapterError |

---

## E2E / Integration Tests

These test the CLI binary end-to-end using `child_process.execSync`. Written after unit tests pass but before final verification.

Test file: `packages/cli/tests/cli.e2e.test.ts`

### Build Command

| Test Case | Command | Expected |
|-----------|---------|----------|
| Build succeeds with JSON output | `staipler build customer-support --format json` | Exit 0, valid JSON with all CompiledBundle fields |
| Build succeeds with text output | `staipler build customer-support --format text` | Exit 0, clean prompt text (no JSON/metadata) |
| Build succeeds with markdown output | `staipler build customer-support --format markdown` | Exit 0, markdown with `##` section headers |
| Build default format is JSON | `staipler build customer-support` | Exit 0, valid JSON |
| Build writes to --out file | `staipler build customer-support --out /tmp/test.json` | File created with valid content |
| Build with missing stack fails | `staipler build nonexistent` | Exit 1, error message names the stack |
| Build output has provenance | `staipler build customer-support` | Output includes `hash`, `resolvedAssets`, `compileOrder` |
| Build output has contractResults | `staipler build customer-support` | Output includes `contractResults` array |

### Validate Command

| Test Case | Command | Expected |
|-----------|---------|----------|
| Validate specific stack passes | `staipler validate customer-support` | Exit 0, success message |
| Validate all stacks | `staipler validate` | Exit 0, reports on all stacks |
| Validate catches schema errors | `staipler validate` (with broken fixture) | Exit 1, lists schema issues |
| Validate catches missing refs | `staipler validate` (with bad ref) | Exit 1, lists missing paths |
| Validate reports contract failures | `staipler validate` (with failing contract) | Exit 1, lists contract issues |
| Validate distinguishes builtin vs user | `staipler validate customer-support` | Output shows `builtin:` and `user:` prefixes |

### SDK API

Test file: `packages/core/tests/sdk.integration.test.ts`

| Test Case | API Call | Expected |
|-----------|----------|----------|
| `buildStack` returns CompiledBundle | `buildStack('customer-support', root)` | Full bundle with all fields |
| `validateStack` returns results | `validateStack('customer-support', root)` | Array of ContractResult |
| `parseAsset` returns Asset | `parseAsset('/path/to/identity.md')` | Parsed Asset object |
| Import from package works | `import { buildStack } from '@staipler/core'` | No import errors |

---

## TDD Implementation Sequence

Each step follows: **write fixtures -> write failing tests -> implement -> refactor**

| Step | Implementation | Tests First | Depends On |
|------|---------------|-------------|------------|
| 1 | Project scaffolding | (vitest config only) | - |
| 2 | `types.ts`, `errors.ts` | Type compilation tests | Step 1 |
| 3 | `schema.ts` | `schema.test.ts` | Step 2 |
| 4 | `parser.ts`, `adapters/native.ts` | `parser.test.ts` | Step 3 |
| 5 | `resolver.ts` | `resolver.test.ts` | Step 4 |
| 6 | `validator.ts` | `validator.test.ts` | Step 5 |
| 7 | `contracts.ts` | `contracts.test.ts` | Step 5 |
| 8 | `merge.ts` | `merge.test.ts` | Step 2 |
| 9 | `compiler.ts` | `compiler.test.ts` | Steps 4-8 |
| 10 | `index.ts` (SDK API) | `sdk.integration.test.ts` | Step 9 |
| 11 | Sample content | (used by integration tests) | Step 9 |
| 12 | CLI commands | `cli.e2e.test.ts` | Steps 10-11 |
| 13 | Adapter stubs | `adapters.test.ts` | Step 4 |

Steps 7 and 8 can run in parallel with step 6 since they share no dependencies beyond types.

---

## Coverage Targets

| Metric | Target |
|--------|--------|
| Line coverage | > 90% |
| Branch coverage | > 85% |
| All 11 required fixtures | Pass |
| All E2E commands | Pass |
| Zero uncaught error paths | Every throw has a test |

---

## Running Tests

```bash
# All tests
pnpm test

# Unit tests only
pnpm --filter @staipler/core test

# E2E tests only
pnpm --filter @staipler/cli test

# With coverage
pnpm test -- --coverage

# Watch mode during TDD
pnpm test -- --watch
```
