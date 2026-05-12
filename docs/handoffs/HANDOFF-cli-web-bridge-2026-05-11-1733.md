---
title: CLI ↔ Web Bridge — Empty-Gate Discoverability + Push Bridge Scope
thread: cli-web-bridge
date: 2026-05-11
status: in-progress
session_type: code-change
continues: null
summary: Reframed the empty-project gate to surface the CLI as a co-equal "Option B" alongside data-source connectors; scoped a `staipler push` bridge (snapshots.source column, /api/cli/push, dashboard tile) but did not implement it. Important caveat: the discoverability edits already exist in HEAD (commit 905b1d1, May 6) — see §5.
---

# CLI ↔ Web Bridge — Handoff

**Thread:** `cli-web-bridge` (first handoff in this thread)
**Status:** in-progress · code-change (with significant scoping/design tail)
**Generated:** 2026-05-11 17:33 local

---

## 1. Session Summary

Robert wants to demo stAIpler against a fresh external project, with results visible in **both** the CLI and the web UI. The session began with a readiness review of what's actually shippable for that demo, and got concrete fast: he ran `staipler init` himself, saw the HTML report load, clicked "Open on staipler.com", logged in, and **expected a notification or claim flow linking his local scan to his account**. There was none. Separately, when creating a new project from the web side, the empty-state page titled *"Connect your environment to start"* didn't visibly offer a CLI option — only data-source connectors.

We identified two distinct gaps:

- **Gap 1 (CLI-first):** `staipler init` uploads an anonymous public report to `/api/r`; the row stores only `created_by_ip` and is never linked to an account. The web dashboard has no claim flow.
- **Gap 2 (Web-first):** the empty-gate already mounts a `CliPanel`, but the panel is collapsed by default with a quiet "Sync with your codebase" disclosure label, and `DataSourcesPanel` visually dominates. Users walk past it.

We chose to fix **Gap 2 immediately** (UX/discoverability change) and **deprecate the claim-flow workaround for Gap 1 in favor of a proper authenticated push bridge** (`staipler push` + `/api/cli/push` + dashboard tile). The push bridge was fully scoped but **not implemented** — Robert wants a handoff before that work begins.

**Major architectural intent that emerged:**
- The CLI and the web should not feel like two separate products. The push bridge is the integration seam that makes them one.
- Snapshot **source provenance** must be visible (the proposed `snapshots.source` column with values `'web' | 'cli'` is the smallest unit of this).
- Anonymous public reports should become a *side* feature (sharing), not the primary onboarding path. Once the CLI is logged in, work goes straight into the user's account.

---

## 2. Current State

### Implemented in this session (with major caveat — see §5)

- [packages/web/src/components/cli-panel.tsx](packages/web/src/components/cli-panel.tsx) — added `defaultExpanded?: boolean` and `triggerLabel?: string` props; removed the root `mt-8` so callers control their own vertical rhythm.
- [packages/web/src/components/project-dashboard.tsx](packages/web/src/components/project-dashboard.tsx) — empty-project gate (lines ~103–200) reframed:
  - Subtitle now reads *"Two ways in: connect a data source below, or sync from a local repo using the CLI."*
  - **Option A — Connect a data source** card wrapping `DataSourcesPanel`.
  - **OR** divider.
  - **Option B — Sync from a local repo** card wrapping `<CliPanel defaultExpanded triggerLabel="Set up the CLI bridge" />`.
  - Populated-dashboard `CliPanel` usage (line ~308) wrapped in `<div className="mt-8">` to preserve prior spacing after the root margin was moved.

### Scoped, not implemented (Push Bridge — Gap 1 deprecation path)

Full design in §3, repeated here as state inventory:

- New Supabase migration adding `snapshots.source` column (`'web' | 'cli'`, default `'web'`).
- New route at `packages/web/src/app/api/cli/push/route.ts` — Bearer-auth, project-ownership verify, INSERT into `snapshots(source='cli', action='scan', ...)`, conditional UPDATE of `projects.readiness_score/grade` only if incoming `scannedAt` is newer than the project's current snapshot.
- New CLI command at `packages/cli/src/commands/push.ts` plus `--push <project-id>` flag wired into `packages/cli/src/commands/init.ts` and `packages/cli/src/commands/watch.ts`.
- Dashboard "Last CLI scan" tile near hero metrics in `project-dashboard.tsx` (read latest `snapshots` row with `source='cli'`).
- Timeline pill in `packages/web/src/components/timeline.tsx` differentiating `source='cli'` rows.

### Working

- Type-check on `packages/web` is clean for my touched files. Three pre-existing errors in [packages/web/tests/knowledge/trust-boundary.test.ts](packages/web/tests/knowledge/trust-boundary.test.ts) about the regex `s` flag (es2018 target mismatch) are unrelated.
- `git status` is clean; tree matches `HEAD`.

### Incomplete / Uncertain

- **No browser verification this session.** The empty-gate redesign was *not* visually tested. We did not start the dev server, did not create a fresh project in the web UI, did not click through the Option A / Option B layout. Visual confidence is inference-from-code only.
- **Gap 1 has no in-flight fix.** We chose to skip the claim-flow workaround and let the push bridge replace it. Until push lands, the `staipler init` → log in → no breadcrumb experience Robert hit *is still broken*.
- **The commit-state oddity (see §5).** I'm not certain my edits this session caused the working state — the same diff appears to already exist in commit `905b1d1`.

---

## 3. Important Context Learned

### Product / architectural

- **Total Visibility is non-negotiable.** Every pipeline stage, every score change, every source of evidence must be inspectable by the user. This is *the* reason snapshots should carry `source` provenance rather than reusing `action='cli_push'` as an opaque marker. See [CLAUDE.md](CLAUDE.md).
- **The optimizer is a gap-filler, not a primary author.** It runs after evidence has been gathered, never instead of. Any feature that bypasses real source material is out of bounds.
- **Connectors are evidence pipelines, not importers.** The CLI is one such evidence source — `staipler push` should write to `snapshots` with provenance, not to a separate "CLI scans" table that floats outside the pipeline contract.
- **`/api/r` (public reports) is anonymous on purpose** but was never intended as the onboarding path. Once auth-via-CLI exists, the natural flow becomes: `staipler login` first, then `init --push <project-id>` creates the project under the user's account in one shot. Public-report-share remains as a *separate* "share this report publicly" feature.

### Schema / API conventions to mirror

- CLI tokens are SHA-256 hashed; plaintext is only shown once at generation and stored in the `cli_tokens` table. Auth helper at [packages/web/src/lib/cli-auth.ts](packages/web/src/lib/cli-auth.ts) verifies Bearer tokens and updates `last_used_at` fire-and-forget.
- CLI config lives at `~/.staipler/auth.json` (chmod 600); env var `STAIPLER_TOKEN` overrides for CI.
- Existing API routes under `/api/cli/*` have **no CSRF protection** (token-based, not session cookies) and **no rate limiting** (the widget chat endpoint has one — copy the pattern if needed for `push`).
- Next.js gotcha: [packages/web/AGENTS.md](packages/web/AGENTS.md) is one line, and it matters — *"This is NOT the Next.js you know. APIs, conventions, and file structure may differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code."* I did not touch Next.js APIs this session so this didn't bite, but anyone writing the new route handler must check the local docs first.

### Collaboration / process

- **Robert wants pushback, not agreement.** When I recommended skipping the claim-flow workaround in favor of the push bridge, he accepted without pushback — that's a validated judgment call worth preserving (`[[feedback_pushback]]` in memory). Don't propose the claim flow again unless the push bridge becomes infeasible.
- **Robert wants honest "I didn't verify this" rather than fabricated confidence.** When I shipped the empty-gate redesign, I told him plainly I hadn't browser-tested it. He didn't ask me to test — but a future agent should treat "ran the type-checker" as a much weaker signal than "saw it in the browser" for UI work.
- **Explore subagent surveys are unreliable for current-state claims.** The session-opening survey reported *"CliPanel is collapsed by default ... initial `useState(false)`"* — but commit 905b1d1 (already in HEAD at session start) had `defaultExpanded` and `useState(defaultExpanded)`. Spot-check actual file contents before trusting a subagent's "this is what the code does today."
- **Filename conventions for handoffs:** existing files use `YYYY-MM-DD-<slug>.md`; Robert explicitly asked this time for `HANDOFF-<title>-<date-time>.md`. The new file in this handoff uses his pattern. INDEX.md should still index it (frontmatter is compatible).

---

## 4. Next Recommended Focus

In order:

1. **Verify the empty-gate redesign actually works in the browser.** This is the cheapest, most important check. Boot `pnpm --filter @staipler/web dev`, log in via Supabase, create a new project, confirm: (a) Option A and Option B render as co-equal cards with the OR divider, (b) `CliPanel` is open by default inside Option B and shows the "Set up the CLI bridge" trigger label, (c) the "Generate token" button works and reveals a `stp_...` token, (d) `staipler login` and `staipler pull <id>` commands in the panel are copyable.
2. **Investigate the commit-state oddity (§5).** Before building anything new, the next agent should understand why this session's edits appear in the working tree and in HEAD but produced no `git diff HEAD` and no new commit. If a hook is silently amending into the latest commit, that needs to be either documented or disabled — otherwise PR boundaries and authorship become unreliable.
3. **Implement the push bridge** (full scope in §3 and below). Suggested order:
   1. Supabase migration: `alter table snapshots add column source text default 'web' check (source in ('web', 'cli'));` — regenerate TS types.
   2. `POST /api/cli/push` route — auth via `cli-auth.ts`, ownership check, insert snapshot, conditional project update (only if `scannedAt > latest snapshot.created_at`), 1 MB payload limit.
   3. `staipler push <project-id>` command — post the scan-summary payload (NOT file contents — `readinessScore`, `grade`, `layerScores`, `presentKinds`, `missingKinds`, `fileCount`, `totalContentLength`, `repoPath`, `gitSha?`, `scannedAt`, `notes?`). Stash `projectId` in `.staipler/config.json` after success so the arg becomes optional next time.
   4. `--push <project-id>` flag on `init` and `watch`. For `watch`, debounce client-side at 3 s; server-side, skip if the most recent CLI snapshot for the project matches `(readinessScore, layerScores, gitSha)` within 60 s.
   5. Dashboard "Last CLI scan" tile near hero metrics in `project-dashboard.tsx`; Timeline source pill in `timeline.tsx`.
   6. End-to-end demo on a real repo — Robert's NoteDrawer-Mobile is the canonical target.
4. **Decide what to do with Gap 1 / `/api/r` after push lands.** Options: (a) keep public-reports as a "share this report" feature, repositioning it away from the onboarding flow; (b) delete it. Robert leaned toward (a) but didn't decide explicitly.
5. **Update [packages/web/src/components/cli-panel.tsx](packages/web/src/components/cli-panel.tsx) when push exists** — the panel currently shows three steps (token → login → pull). After push, a fresh project starting from the empty-gate makes more sense as: token → login → `staipler init --push <project-id>` (one command). Pull becomes a less central path.

---

## 5. Known Issues / Risks

### Commit-state oddity — *highest-priority unknown*

`git diff HEAD` is empty at session end. No new commit was created. **But the file contents in the working tree (`cli-panel.tsx`, `project-dashboard.tsx`) contain the exact edits described in §2.** Inspection shows commit **`905b1d1`** (subject: *"feat(vscode-extension): add initial implementation..."*, dated **2026-05-06**, 5 days before this session) **already includes the full diff for both files** — `defaultExpanded`, `triggerLabel`, Option A / OR / Option B, "Two ways in" subtitle, the `<div className="mt-8">` wrapper, all of it.

Possible explanations:
- **(a)** A silent post-Edit hook amends edits into the most recent commit while preserving its author/date/message. This would explain the clean tree, the unchanged HEAD hash across the session, and how `905b1d1` came to contain edits Robert and I were discussing today.
- **(b)** The session-opening Explore agent hallucinated stale file state. The file already had `defaultExpanded` etc., my Edit calls were no-ops, and I was unknowingly editing already-correct content. But this doesn't fit — my `old_string` values (`interface CliPanelProps { projectId: string; }` etc.) would not match a file that already had `defaultExpanded?: boolean;` two lines later, so Edit should have erred. It didn't.
- **(c)** A different agent in a prior session 5 days ago made these exact edits and they landed in `905b1d1` under a different commit subject, and what happened today is unclear.

I am genuinely unsure which is correct. The next agent should:
- Inspect `.claude/settings.json` and `.claude/settings.local.json` for post-tool-use hooks (especially anything invoking `git commit --amend`).
- Run `git reflog` to see whether HEAD ever moved during this session.
- Decide whether to disable any silent-amend behavior — if PRs are to be authored cleanly, this needs to be reliable.

### UI / UX

- **No browser verification this session.** The Option A / B layout is plausible but unproven visually. CliPanel's chevron rotation when `defaultExpanded={true}` should be correct (existing CSS rotates 90° based on the `expanded` state), but I didn't see it render.
- The **"Locked until you connect a source"** footer in the empty-gate still uses the word *source*. After the Option A / B framing, *source* might read narrowly as "data source." Minor copy issue — consider *"source or CLI sync."*
- **CliPanel's chevron is still clickable** when `defaultExpanded`, which means the user can collapse it inside the Option B card. That's probably fine, but it visually contradicts "this is one of two co-equal entry points." A `forceOpen` prop (matching `DataSourcesPanel`'s existing prop) would be cleaner.

### Gap 1 (CLI-first) — still broken in production

- `staipler init` → public report → log in → dashboard shows nothing. No claim flow exists. Until push ships, the experience Robert hit at the top of this session **is still the production behavior**.

### Process

- **Explore subagent reliability.** As above — its current-state claims about `cli-panel.tsx` were wrong. Treat subagent-reported "this is what the code does now" claims with skepticism on UI work; prefer reading files directly when accuracy matters.
- **Pre-existing test errors** in [packages/web/tests/knowledge/trust-boundary.test.ts](packages/web/tests/knowledge/trust-boundary.test.ts) (lines 47–49) — regex `s` flag requires es2018+ target. Not in scope for this thread but visible in any future `tsc --noEmit`.

---

## 6. Testing / Verification

### Commands run this session

```bash
git status                                                 # clean
git log --oneline -10                                      # HEAD = 905b1d1
git diff --stat                                            # empty
git diff HEAD -- packages/web/src/components/cli-panel.tsx \
                  packages/web/src/components/project-dashboard.tsx   # empty
grep "defaultExpanded\|triggerLabel" packages/web/src/components/cli-panel.tsx
grep "Option A\|Option B\|Two ways in" packages/web/src/components/project-dashboard.tsx
git show 905b1d1 -- packages/web/src/components/cli-panel.tsx
git show 905b1d1 -- packages/web/src/components/project-dashboard.tsx
pnpm exec tsc --noEmit       # in packages/web — 3 pre-existing errors, unrelated
```

### Test status

- **`pnpm test` was NOT run this session.** Last known green: `260/260` per prior handoff [2026-04-22-staipler-continuity-status-injection.md](2026-04-22-staipler-continuity-status-injection.md). Not verified today.
- **`pnpm build` was NOT run this session.**
- **No browser smoke-test.**

### Recommended before next changes

```bash
# Confirm tree state and understand commit-state oddity first
git status
git reflog | head -20
git log --oneline -5

# Baseline checks
pnpm test                                        # expect ≥260/260
pnpm build                                       # all three packages
pnpm exec tsc --noEmit -p packages/web           # expect only the 3 pre-existing regex-flag errors

# Browser verification of this session's UX claim
pnpm --filter @staipler/web dev                  # localhost:3000
# Manually: log in, create new project, confirm Option A/B layout + default-expanded CliPanel

# Before adding /api/cli/push — re-read the Next.js quirks
ls packages/web/node_modules/next/dist/docs/     # see what's actually available locally
```

---

## 7. Files and References

### Touched this session (per file content, regardless of git state)

- [packages/web/src/components/cli-panel.tsx](packages/web/src/components/cli-panel.tsx) — `defaultExpanded` + `triggerLabel` props; root `mt-8` removed. Drives both the empty-gate Option B card and the populated-dashboard "Sync with your codebase" disclosure.
- [packages/web/src/components/project-dashboard.tsx](packages/web/src/components/project-dashboard.tsx) — empty-gate restructure (lines ~103–200); populated-dashboard CliPanel wrapper (line ~308).

### Critical reading for the push-bridge work (mirror their patterns)

- [packages/web/src/lib/cli-auth.ts](packages/web/src/lib/cli-auth.ts) — Bearer-token verification; the new `/api/cli/push` route must use this helper.
- [packages/web/src/app/api/cli/token/route.ts](packages/web/src/app/api/cli/token/route.ts) — token issuance pattern; SHA-256 hash, `cli_tokens` table.
- [packages/web/src/app/api/cli/plan/route.ts](packages/web/src/app/api/cli/plan/route.ts) — the closest sibling to the new push endpoint; copy its auth + ownership-check structure.
- [packages/web/AGENTS.md](packages/web/AGENTS.md) — *"This is NOT the Next.js you know"*; read it before writing route handlers.
- [packages/web/supabase/schema.sql](packages/web/supabase/schema.sql) — `projects` and `snapshots` schemas; the latter is where push writes.
- [packages/web/supabase/migrations/](packages/web/supabase/migrations/) — where the `source` column migration belongs.

### CLI side

- [packages/cli/src/commands/login.ts](packages/cli/src/commands/login.ts) — token persistence to `~/.staipler/auth.json` (chmod 600).
- [packages/cli/src/commands/pull.ts](packages/cli/src/commands/pull.ts) — closest sibling for the new `push` command; copy auth + base-URL + error-handling pattern.
- [packages/cli/src/utils/api.ts](packages/cli/src/utils/api.ts) — Bearer-header fetch helper.
- [packages/cli/src/utils/config.ts](packages/cli/src/utils/config.ts) — config path, `STAIPLER_TOKEN` env override, base URL default.
- [packages/cli/src/commands/init.ts](packages/cli/src/commands/init.ts) — already produces a `KpiSnapshot` matching the `snapshots` row shape; this is the data the push payload should derive from.
- [packages/cli/src/commands/watch.ts](packages/cli/src/commands/watch.ts) — needs `--push` debounce wiring.
- [packages/core/src/optimizer/scanner.ts](packages/core/src/optimizer/scanner.ts) — `ScanResult` shape (`presentKinds`, `missingKinds`, `totalContentLength`, etc.).
- [packages/core/src/optimizer/analyzer.ts](packages/core/src/optimizer/analyzer.ts) — `AnalysisResult` shape (`readinessScore`, `grade`, `layers`).

### Dashboard-side targets for push tile

- [packages/web/src/components/project-dashboard.tsx](packages/web/src/components/project-dashboard.tsx) (populated branch ~line 190+) — "Last CLI scan" tile goes near hero metrics around line 301.
- [packages/web/src/components/timeline.tsx](packages/web/src/components/timeline.tsx) — already renders snapshots; add a `source='cli'` pill so CLI pushes are distinguishable from web-side scans.
- [packages/web/src/components/data-sources-panel.tsx](packages/web/src/components/data-sources-panel.tsx) — Option A's panel (web connectors). Has a `forceOpen` prop that may be worth mirroring on `CliPanel`.

### Gap 1 (left in current broken state)

- [packages/web/src/app/api/r/route.ts](packages/web/src/app/api/r/route.ts) — anonymous public-report ingest; row stores `created_by_ip` only, no user association.
- [packages/web/supabase/migrations/001_public_reports.sql](packages/web/supabase/migrations/001_public_reports.sql) — schema for the above.
- [packages/web/src/app/dashboard/page.tsx](packages/web/src/app/dashboard/page.tsx) — currently has no claim-flow logic.
- [packages/cli/src/utils/upload-report.ts](packages/cli/src/utils/upload-report.ts) — the CLI side of `staipler init`'s share feature.

### Handoff system

- [docs/handoffs/INDEX.md](docs/handoffs/INDEX.md) — navigation surface; updated this session to include this file.
- [docs/handoffs/2026-04-22-staipler-continuity-status-injection.md](docs/handoffs/2026-04-22-staipler-continuity-status-injection.md) — prior thread (continuity layer). Flagged *"Web dashboard API routes still have stale hardcoded layer arrays"* as follow-up; possibly intersects with push-bridge work if those routes are reused.

### Project-level

- [CLAUDE.md](CLAUDE.md) — Total Visibility requirement and Evidence Pipeline contract; both shape the push-bridge design.
