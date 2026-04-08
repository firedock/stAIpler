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

_Last updated: 2026-04-08T01:35_

<!-- /staipler:status -->
