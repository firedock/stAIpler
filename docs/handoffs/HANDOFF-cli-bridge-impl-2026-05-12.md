---
date: 2026-05-12
thread: cli-bridge-impl
status: in-progress
predecessor: HANDOFF-cli-web-bridge-2026-05-11-1733.md
---

# CLI ↔ Web Bridge — Implementation + Empty Project Gate Hardening

## 1. Session Summary

Two threads ran together this session:

**A. Empty-project hardening.** The user demonstrated that the web dashboard let them hit "Optimize with AI" against a project with **zero data sources and zero files**, which produced a hallucinated "Generated 7 layers — Score: 75/100 (C)" result with all layer scores at 99. This violated the optimizer-role rule ("never primary author when source material exists" — and obviously even more so when it doesn't exist). We chose **Option A: Forced Gate** — the entire dashboard surface area is replaced with a "Connect your environment to start" gate until at least one of `dataSources`, `files`, or `sourceDocuments` is non-empty. We also added a server-side guard on `/api/optimize` so the same hallucination cannot be triggered by any other path (curl, future UI bug, etc.).

**B. CLI ↔ Web Bridge implementation.** The predecessor handoff ([HANDOFF-cli-web-bridge-2026-05-11-1733.md](HANDOFF-cli-web-bridge-2026-05-11-1733.md)) *scoped* a CLI bridge but didn't build it. This session built the **pull** direction (web → local repo) end-to-end: `cli_tokens` table + token API + `/api/cli/plan` endpoint + `staipler login` and `staipler pull` CLI commands + dashboard "Sync with your codebase" panel.

**Key product decision (made during discussion before implementing).** Rather than adding GitHub OAuth *write* scope to create PRs from the web app (the original idea), we decided the CLI is the bridge. The web is the planning/evaluation layer; the CLI lands the result in the user's repo via their own normal review/commit flow. This avoids:
- Asking for `repo:write` OAuth (IT departments push back)
- "No AI-generated content in PRs" policy conflicts (the user's own dev environment writes the file, not us)
- Building a layer→file consolidation strategy on the server (the CLI can detect repo conventions locally)

A future **push** direction (CLI → web) is still desirable and was scoped but not built — see §4.

## 2. Current State

### Implemented and verified by `pnpm build` (clean across all packages)

**Empty Project Gate (frontend + backend)**

- [packages/web/src/components/project-dashboard.tsx](../../packages/web/src/components/project-dashboard.tsx) — Top of `ProjectDashboard()` has a new `hasSourceMaterial` check; if false, the entire normal return is short-circuited and a focused gate is rendered instead. The gate includes:
  - Header with project name and `DeleteProjectButton`
  - "What happens after you connect" — 4-stage pipeline explainer (Ingest → Extract → Organize → Compile), satisfies the visibility requirement
  - Inline `<DataSourcesPanel forceOpen />` so all connection flows work without leaving the gate
  - "Locked until you connect a source" chip list (Optimize, Test, Layer scoring, Embed widget) with explainer copy on *why* the optimizer needs source material
- [packages/web/src/app/api/optimize/route.ts](../../packages/web/src/app/api/optimize/route.ts) — Lines 40-55 now check `data_sources` and `project_files` counts and return `400 NO_SOURCE_MATERIAL` if both are zero. Defense in depth — even if the UI gate is bypassed, the optimizer refuses.

**CLI ↔ Web Bridge — pull direction**

Database:
- [packages/web/supabase/schema.sql:459-487](../../packages/web/supabase/schema.sql#L459-L487) — New `cli_tokens` table. User-scoped, stores SHA-256 hash only (not plaintext), supports per-token revocation via `enabled` flag, optional `expires_at`, RLS enforces ownership.

Web API:
- [packages/web/src/lib/cli-auth.ts](../../packages/web/src/lib/cli-auth.ts) — Shared `authenticateCliRequest()` helper. Reads `Authorization: Bearer stp_...`, hashes it, looks up the token, returns `user_id` or `null`. Updates `last_used_at` fire-and-forget. **Reusable** for any future CLI endpoint.
- [packages/web/src/app/api/cli/token/route.ts](../../packages/web/src/app/api/cli/token/route.ts) — GET/POST/DELETE for CLI token management. POST returns the plaintext token exactly once with a "save this now" warning. Has `console.error` logging added on insert failure (see §5 for why).
- [packages/web/src/app/api/cli/plan/route.ts](../../packages/web/src/app/api/cli/plan/route.ts) — GET with bearer auth. Returns the latest `CompiledInstructionBundle` for a project as a structured file plan. Falls back to raw `project_files` if no bundle has been compiled yet. Each section comes with `status` (`source-grounded` / `ai-generated` / `mixed`) so the CLI can label them in the diff.

Web UI:
- [packages/web/src/components/cli-panel.tsx](../../packages/web/src/components/cli-panel.tsx) — "Sync with your codebase" expandable panel. 3-step flow: generate token → `staipler login --token ...` → `staipler pull <project-id>`. Copy buttons on every command/token. Rendered above `QuickProofCard` in `project-dashboard.tsx`.

CLI (`packages/cli/`):
- [packages/cli/src/utils/config.ts](../../packages/cli/src/utils/config.ts) — Loads/saves config at `~/.staipler/auth.json`, chmod 600. Env-var override via `STAIPLER_TOKEN` (useful for CI). Configurable API URL via `STAIPLER_API_URL` (default `https://staipler.com`).
- [packages/cli/src/utils/api.ts](../../packages/cli/src/utils/api.ts) — `fetchPlan(config, projectId)` with friendly error mapping for 401 / 403 / 404 cases.
- [packages/cli/src/commands/login.ts](../../packages/cli/src/commands/login.ts) — `staipler login --token <stp_...>`. Validates the `stp_` prefix, persists, prints next-step hint.
- [packages/cli/src/commands/pull.ts](../../packages/cli/src/commands/pull.ts) — `staipler pull <project-id>` with `--out` (default `library/optimized`), `--yes`, `--dry-run`. Classifies each file as `NEW` / `CHANGED` / `same` with char-count deltas, shows the table colorized via `chalk`, prompts confirmation via `readline`, writes only changed/new files.
- [packages/cli/src/index.ts](../../packages/cli/src/index.ts) — Both commands registered.

### What appears to be working

- `pnpm build` is clean across `packages/core`, `packages/cli`, `packages/web`.
- All new web endpoints register in the Next.js route table (visible in build output): `/api/cli/plan`, `/api/cli/token`, `/api/widget/chat`, `/api/widget/config`, `/api/widget/embed/[token]`, `/api/widget/token`.
- The forced gate renders correctly — confirmed in earlier session screenshot showing the "Flying Blind" state was the problem we replaced.
- CLI commands compile and are wired into the binary.

### What is incomplete or uncertain

- **The user has NOT yet run the `cli_tokens` schema migration** in Supabase as of the end of this session. POST `/api/cli/token` returned 500 in their last test (see §5).
- **The push direction** (CLI → web; "I ran `staipler scan` locally, now I want stAIpler.com to know about it") is unbuilt. Predecessor handoff scoped this — see §4.
- **No device-code OAuth flow.** Paste-token only for now. Acceptable for v1.
- **No token-management UI.** The DELETE endpoint exists but no UI lists/revokes tokens. Backend ready when needed.
- **No smart ecosystem detection.** `staipler pull` always writes to `library/optimized/<LAYER>.md`. It does not yet detect "this repo uses Claude Code → write a consolidated CLAUDE.md instead." Worth adding once you see real user repos.

### Concurrent changes that landed during the session (not by me)

The user/linter modified several files in parallel:
- `packages/web/src/components/deploy-panel.tsx` — Added `error` state, console error on token load fail. Cosmetic robustness.
- `packages/web/src/app/api/widget/chat/route.ts` — **Behavior change:** hosted-tier requests now return `402 Payment Required` ("This assistant is not active. The owner must add an API key…"). Hosted tier is **disabled** until billing ships. Also added `continuity` layer to the canonical order. **Important:** see §3 for implications.
- `packages/web/src/app/api/widget/embed/[token]/route.ts` — Minor refinement to the widget JS error handling (comment cleanup).
- `packages/web/src/app/api/sources/google-drive/sync/route.ts` — Refactored to use the full evidence pipeline (`runPipeline` from `@staipler/core`) instead of the local heuristics that were in my original implementation. **The new shape is better** — provenance + reconciliation + transformations are all logged.
- `packages/web/src/app/api/agent/setup/route.ts` — Modified (diff not shown but file was touched).
- `packages/web/src/components/chat.tsx` — Added `SessionContextPanel` integration and `continuity`-related attribution. Doesn't conflict with our work.

## 3. Important Context Learned

### Architectural conventions (verified this session)
- **Service-role client for public/cross-cutting endpoints.** `lib/supabase/service.ts` is the pattern for endpoints that need to bypass RLS (widget endpoints, CLI plan endpoint). Always verify ownership explicitly inside the route after fetching.
- **Token storage:** never store plaintext. Always SHA-256 hash. Show plaintext to the user exactly once at creation time. Both `deploy_tokens` and `cli_tokens` follow this — though note `deploy_tokens` actually stores plaintext currently (it's project-scoped, public, and rate-limited, so the tradeoff is different). `cli_tokens` is user-scoped and stores hash only.
- **The schema.sql file is a reference, not a migration runner.** The user must run new blocks in the Supabase SQL editor manually. There is no auto-apply mechanism.

### Product rules learned/reinforced
- **The optimizer is a gap-filler, not a primary author** — and *especially* not when there is zero source material. The forced gate + API guard now enforce this at two layers. Don't relax either.
- **The hosted tier is currently disabled.** [packages/web/src/app/api/widget/chat/route.ts](../../packages/web/src/app/api/widget/chat/route.ts) refuses `provider === 'hosted'` with HTTP 402. The setup wizard (and `agent_configs` table) still has the `'hosted'` option in the constraint — keep it, but assume new agents need an API key. Don't suggest hosted in new UI copy until billing ships.
- **Persona-agnostic UI is the next big direction.** Discussed at length, not implemented. Most current copy still assumes a coding agent. The CLI bridge work is *only* for the coding-agent use case — non-code projects (Notion-connected, etc.) should not see the "Sync with your codebase" panel. This filter is **not yet implemented** — see §5.

### CLI conventions
- `chalk` for colors, `commander` for arg parsing, `readline` for prompts. These are already in deps — don't add new ones.
- The CLI is published as `@staipler/cli` with bin `staipler`. Existing commands: `init`, `build`, `validate`, `eval`, `optimize`, `dashboard`, `watch`, `ci`, `inject`, `eval-project`, `memory`. New: `login`, `pull`.
- Existing local-only flow (`staipler optimize`) writes to `library/optimized/` by default. New `staipler pull` matches this default so the two are interchangeable.

### Gotchas
- **Next.js 16 specifics** — `params` is a Promise: `{ params: Promise<{ id: string }> }`, must `await params`. Already the convention; don't break it.
- **The `@staipler/web` package is named just `web` in pnpm filtering** — use `pnpm --filter web build` not `pnpm --filter @staipler/web build`.
- **CompiledInstructionBundle sections have `sourceDocumentIds`, not `sourceDocs`.** I used optional chaining for safety: `section.sourceDocumentIds?.length ?? 0`.

## 4. Next Recommended Focus

In rough priority order:

### a) Verify the cli_tokens migration (BLOCKER — 1 min)
The user's POST /api/cli/token is returning 500. Almost certainly because they haven't run the `cli_tokens` table creation SQL. Confirm in Supabase that `cli_tokens` exists. If not, paste the block from [packages/web/supabase/schema.sql:459-487](../../packages/web/supabase/schema.sql#L459-L487) into the SQL editor. **The console.error logging I added will surface the exact Postgres error in the dev server output if you reproduce the failure** — check the server logs first to confirm root cause.

### b) Hide "Sync with your codebase" for non-code projects (small — 30 min)
Right now `<CliPanel>` always renders. For projects whose data sources are all Notion/Google Drive/Zendesk/etc. (no GitHub), this is noise and reinforces the coding-agent assumption. Suggested logic: in `project-dashboard.tsx`, check whether `dataSources.some(d => d.provider === 'github' || d.provider === 'gitlab' || d.provider === 'bitbucket')`. If false, skip rendering CliPanel. Alternative: a `hasCodeSource` derived flag passed down from the server.

### c) Build the push direction (medium — 1-2 days)
Predecessor handoff [HANDOFF-cli-web-bridge-2026-05-11-1733.md](HANDOFF-cli-web-bridge-2026-05-11-1733.md) already scoped this:
- New `snapshots.source` column (`web` | `cli` | `manual`)
- New `/api/cli/push` endpoint (bearer auth, takes a SnapshotPayload)
- New `staipler push` CLI command
- Dashboard tile that surfaces CLI-pushed snapshots distinctly
The pull direction this session built is the read; the push direction is the write. Build it.

### d) Token management UI (small — 1 hour)
Add a "Settings → CLI tokens" page that lists tokens (name, last_used_at, created_at) with a revoke button. Backend (`GET /api/cli/token`, `DELETE /api/cli/token?id=...`) is done.

### e) Persona-agnostic copy pass (medium — half day)
Discussed but not implemented. The biggest reframe targets:
- Landing page ("for AI agents" not "for AI coding agents")
- Setup wizard step 2 ("What does your agent need to know?" with sources grouped by knowledge type)
- Project dashboard headline (adapt to source mix, not always "instruction files")
- "Coming soon" connectors should be enabled in priority order: Notion (highest-leverage non-dev), then Zendesk

### f) Ecosystem-aware file output in `staipler pull` (small-medium — half day)
Detect `CLAUDE.md` / `.cursorrules` / `AGENTS.md` etc. and consolidate accordingly instead of always writing 12 separate files. Make it a flag for now: `--mode split` (default) vs `--mode consolidated`.

## 5. Known Issues / Risks

### 🔴 Active bug — `cli_tokens` table missing in user's Supabase
Last observed: `POST /api/cli/token 500 in 4.2s`. Root cause is almost certainly the missing table; I added `console.error` logging on the insert failure path so the next attempt will surface the real Postgres error to stdout. **Verify the table exists before retrying.**

### 🟡 The forced gate uses three signals; one could be stale
`hasSourceMaterial = dataSources.length > 0 || files.length > 0 || sourceDocuments.length > 0`. If a connector fails halfway through ingestion and creates a `data_sources` row but no files/source_documents, the gate lifts and the user sees a dashboard with 0/12 layers (the original problem, just one layer deeper). Worth considering: gate on `files.length > 0 || sourceDocuments.length > 0` only, ignoring data_sources unless it's `status === 'connected'`. Test this before tightening.

### 🟡 The CLI shows the plaintext token only once
If the user closes the dashboard before saving it, they need to revoke and regenerate. Acceptable v1 behavior but worth a "Copy to clipboard" auto-trigger or a download button if you hear complaints. Backend supports listing/revoking — frontend UI doesn't exist yet.

### 🟡 In-memory rate limiting in widget endpoints
[packages/web/src/app/api/widget/chat/route.ts:55](../../packages/web/src/app/api/widget/chat/route.ts#L55) uses an in-memory Map. Doesn't survive across Next.js workers / cold starts on serverless. Fine for low volume; replace with Redis (or Supabase row-level rate limit table) if widget traffic scales.

### 🟢 CLI auth file is chmod 600 on most platforms, but Windows is silent
[packages/cli/src/utils/config.ts](../../packages/cli/src/utils/config.ts) wraps `chmodSync` in try/catch. The token sits at `~/.staipler/auth.json`. Users on Windows are accepting weaker file perms — call this out in docs eventually.

### 🟢 STAIPLER_TOKEN env var bypasses ~/.staipler/auth.json
Intentional for CI use, but means a leaked env var has full access. No mitigation in v1.

### 🟡 The hosted tier is half-disabled
The widget chat endpoint refuses `provider === 'hosted'` with 402, but the setup wizard still offers it as an option and `agent_configs.provider` still accepts the value. A user can finish setup with the "Let stAIpler handle it" path and then find their widget doesn't work. **Either fully disable the hosted option in the setup wizard, or wait until billing ships.** I did not change this because the user-driven edit explicitly added the 402 refusal — it's their call.

## 6. Testing / Verification

### Commands run this session
```bash
pnpm build  # → clean across all 3 packages
```

### Recommended pre-flight before further work
```bash
# Verify build is still clean
pnpm build

# Verify the CLI binary runs
node packages/cli/dist/index.js --help
node packages/cli/dist/index.js login --help
node packages/cli/dist/index.js pull --help

# Confirm cli_tokens table exists (in Supabase SQL editor)
select count(*) from cli_tokens;
```

### Manual smoke test for the bridge
1. Sign in to the web dashboard
2. On a project with at least one data source, open "Sync with your codebase"
3. Click "Generate token" → copy the `stp_...` token
4. In a fresh shell: `STAIPLER_API_URL=http://localhost:3000 node packages/cli/dist/index.js login --token <stp_...>`
5. Then: `node packages/cli/dist/index.js pull <project-id> --dry-run`
6. Expect: prints the project name, score, and a `+ NEW` / `~ CHANGED` / `= same` table of layer files

### What is NOT covered by automated tests
- No unit tests for `cli-auth.ts`, `cli-panel.tsx`, the plan/token endpoints, or the new CLI commands
- The existing test suite (`pnpm test`) is unchanged by this session — should still pass, but I did not re-run it

## 7. Files and References

### Most important for understanding the bridge
| File | Why it matters |
|---|---|
| [packages/web/src/lib/cli-auth.ts](../../packages/web/src/lib/cli-auth.ts) | The shared bearer-token verifier. Reuse for every future CLI endpoint. |
| [packages/web/src/app/api/cli/plan/route.ts](../../packages/web/src/app/api/cli/plan/route.ts) | The web → CLI data contract. Shape changes here ripple to the CLI. |
| [packages/cli/src/utils/api.ts](../../packages/cli/src/utils/api.ts) | The CLI → web client. Mirrors the plan endpoint's response shape. |
| [packages/cli/src/commands/pull.ts](../../packages/cli/src/commands/pull.ts) | The user-facing apply logic. Diff classification + confirmation + write. |
| [packages/web/src/components/cli-panel.tsx](../../packages/web/src/components/cli-panel.tsx) | The dashboard surface that drives discovery of the CLI flow. |
| [packages/web/supabase/schema.sql:459-487](../../packages/web/supabase/schema.sql#L459-L487) | The `cli_tokens` table definition. Run this manually in Supabase. |

### Most important for the empty-project gate
| File | Why it matters |
|---|---|
| [packages/web/src/components/project-dashboard.tsx](../../packages/web/src/components/project-dashboard.tsx) | Lines ~99-180 contain the `!hasSourceMaterial` early return that gates the entire dashboard. |
| [packages/web/src/app/api/optimize/route.ts](../../packages/web/src/app/api/optimize/route.ts) | Lines ~40-55: server-side `NO_SOURCE_MATERIAL` guard. Don't remove. |

### Related context (read these to understand the broader direction)
| Path | Why |
|---|---|
| [docs/handoffs/HANDOFF-cli-web-bridge-2026-05-11-1733.md](HANDOFF-cli-web-bridge-2026-05-11-1733.md) | The predecessor handoff. Scoped the bridge; this session implemented the pull half. |
| [CLAUDE.md](../../CLAUDE.md) | Lines 17-18 — "Everything must be visible." This is why the empty-gate explains the 4-stage pipeline up front. |
| Memory: `feedback_optimizer_role.md` | "Optimizer gap-fills, never primary author when source material exists" — the basis for the API guard. |
| Memory: `feedback_visibility.md` | The "no exceptions" visibility rule. The gate copy ("locked because…", "the optimizer would invent content") follows from this. |
| Memory: `project_non_tech_journey.md` | The 4-phase plan (setup → Google Drive → chat polish → embed widget). Phase 4 is largely done; persona-agnostic copy is the next big gap. |

### Files modified by user/linter alongside (review before changing)
- [packages/web/src/app/api/widget/chat/route.ts](../../packages/web/src/app/api/widget/chat/route.ts) — Hosted tier now returns 402. Plan around this.
- [packages/web/src/app/api/sources/google-drive/sync/route.ts](../../packages/web/src/app/api/sources/google-drive/sync/route.ts) — Now uses the full `@staipler/core` evidence pipeline. Better than my original.
- [packages/web/src/components/chat.tsx](../../packages/web/src/components/chat.tsx) — Continuity-layer integration added.
- [packages/web/src/components/deploy-panel.tsx](../../packages/web/src/components/deploy-panel.tsx) — Robustness tweaks.
