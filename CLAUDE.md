# stAIpler Development

This is a pnpm monorepo with 3 packages:
- `packages/core` — @staipler/core scanner, analyzer, compiler, optimizer
- `packages/cli` — @staipler/cli CLI tool
- `packages/web` — Next.js web dashboard with Supabase auth

## Commands
- `pnpm build` — build all packages
- `pnpm test` — run all tests (vitest)
- `staipler watch` — live empowerment score
- `staipler ci` — CI/CD quality gate
- `staipler inject` — inject status into agent config

## Core Requirement: Visibility

**Everything must be visible.** Architecture, workflows, pipeline stages, contracts, intent, provenance, and conflicts must be visible to the user in real time. The entire stAIpler experience must be intuitive enough for any user to see and understand what is happening. This is a hard requirement — no exceptions — for every feature added to the product.

Connectors are evidence pipelines, not importers. No new connector ships unless it produces layer candidates, provenance, and conflict-aware structured output consumable by core analysis and compilation.

The optimizer is a gap-filler and synthesizer, not the primary author of foundational layers when source material exists.

## Evidence Pipeline

4-stage architecture (all stages must be visible in the UI):
1. **Ingestion** — fetch and normalize source content into SourceDocument
2. **Extraction** — identify layer-relevant spans per document → LayerCandidate[]
3. **Organization** — dedupe, reconcile, cluster across documents → ResolvedLayer[]
4. **Compilation** — produce final instruction bundle → CompiledInstructionBundle

Pipeline code lives in `packages/core/src/pipeline/`. Schema tables: `source_documents`, `layer_candidates`, `compiled_bundles`.

## Key patterns
- 12 instruction layer types (identity, goals, context, policies, constraints, skills, style, examples, tools, prompts, evals, memory)
- Empowerment Score 0-100 with letter grades (A-F)
- TDD with vitest — 121 tests across 11 test files

<!-- staipler:status -->

**Empowerment Score: 60/100 (D)**

Missing layers: evals, examples, memory, policies, prompts, tools

When working in this project, be aware of these gaps:
- No compliance/policy layer — flag any compliance, legal, or brand-sensitive decisions to the user.

Coverage: 6 present, 0 weak, 6 missing out of 12 layers

_Last updated: 2026-04-12T00:25_

<!-- /staipler:status -->
