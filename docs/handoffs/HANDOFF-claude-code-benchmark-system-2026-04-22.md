# Handoff — Claude Code benchmark system

**Date**: 2026-04-22
**Thread**: claude-code-benchmark-system
**Status**: implemented, plumbing validated with real Claude (n=3); full 20-task run not yet executed
**Author handing off**: Claude Opus 4.7 (1M context)

---

## 1. Session summary

We built a paired-run benchmark system that measures Claude Code with and without stAIpler-compiled artifacts (`CLAUDE.md` + `.claude/skills/*/SKILL.md`) materialized into each task workspace. The user's framing: the benchmark is the credibility instrument for stAIpler, so the design must withstand a skeptical reader.

### What we worked on
1. **End-to-end benchmark system** per a detailed user spec — new compiler target, paired runner, dataset, reports, docs.
2. **Mid-session visibility refactor**: the user pushed back that the #1 rule of this codebase (total visibility, see [CLAUDE.md](../../CLAUDE.md) and `feedback_visibility.md`) was only partially honored. We added a typed event bus, JSONL persistence, dashboard pages with SSE, and surfaced provenance/conflicts/skills in reports.
3. **First real Claude run** — kicked off `staipler benchmark run --limit 3`. Found and fixed two real bugs during the runs. Produced a real paired delta on release `ce0f6c3b0f8a`.

### Major decisions (also captured as memory files)
- **Deterministic scoring over LLM-judge.** Reports surface `deterministic_pass_rate` and `judge_assisted_pass_rate` as separate numbers. Never combined. 17 of 20 tasks are pure deterministic, 1 mixed, 2 pure judge. See `feedback_benchmark_credibility.md`.
- **Adapter/core contract boundary.** Compiler-target adapters consume only the `BenchmarkReadyBundle` contract from `@staipler/core`. They must not import `AnalysisResult`, pipeline internals, or analyzer internals. See `feedback_adapter_contracts.md`.
- **`workspace_source` is first-class on every task.** Either `fixture` (synthetic seed repo) or `current_repo_snapshot` (`git worktree --detach` at the release commit). Never blur the two.
- **Adapter version + `core_contract_version` participate in `release_id` and `determinism_hash`.** A renderer change must produce a new release_id even when bundle + git commit are unchanged.
- **Edit-scope checks read the real `git diff`, never transcript text.** Each workspace is initialized as a git repo so the pre/post diff is the source of truth.
- **For third-party credibility, Terminal-Bench 2.0 is the right next external benchmark.** Not built yet. SWE-bench is a fallback. Our internal 20-task dataset is directional only — never publish on the basis of those numbers alone.

---

## 2. Current state

### Commits landing in this session
| SHA | Message |
|---|---|
| `4763b88` | `feat(benchmark)`: Claude Code compiler target + paired-run harness + dashboard |
| `9d19fbb` | `fix(cli)`: resolve repoRoot by walking up to pnpm-workspace.yaml |
| `2479470` | `fix(benchmark)`: spawn claude with `bypassPermissions` so tasks can edit files |
| `7e109c1` | `fix(dashboard,cli)`: robust repoRoot detection via pnpm-workspace.yaml + benchmark/harbor pair |

There are subsequent commits on `main` not from this thread (continuity layer Phase 2, deploy fixes, vscode-extension) — they were not audited for intersection with the benchmark code. See **Known issues**.

### Implemented and working
- **`@staipler/adapter-claude-code` package** at [packages/adapters/claude-code/](../../packages/adapters/claude-code/) — pure `compileClaudeCode(BenchmarkReadyBundle, opts) → ClaudeCodeArtifacts`. Determinism-tested (same input → byte-identical artifacts; same input across different `built_at` → equal `determinism_hash`). Adapter-version change forces new `release_id`.
- **Core eval surfaces** at [packages/core/src/eval/](../../packages/core/src/eval/):
  - `benchmark-ready-bundle.ts` — versioned contract + normalization helper
  - `benchmark-spec.ts` — task schema (zod), requirement discriminated union (10 types incl. `text_absent`, `workspace_diff_absent`), `loadDataset`
  - `requirement-evaluator.ts` — pure evaluator with `FileSystemProbe` callback
  - `benchmark-report.ts` — `generateRunJson`, `generateSummaryMd`, `generateDiffMd`, `pairResults`
  - `failure-taxonomy.ts` — 10-category classifier
  - `load-active-bundle.ts` — scan → analyze → bundle, populates provenance from real file paths
- **Typed event bus** at [packages/core/src/events/](../../packages/core/src/events/):
  - 10 event variants (scan/analyze/bundle/render/materialize/release/task/requirement/run/warning)
  - `consoleSink`, `jsonlFileSink`, `memorySink`
  - **Note**: `bus.ts` uses a `DistributiveOmit` helper so `bus.emit()` accepts a single variant of the union cleanly (this was a follow-up tweak — keep it).
- **Benchmark runner** at [benchmark/harbor/](../../benchmark/harbor/):
  - `scripts/run-matrix.ts` — paired orchestrator; spawns `claude -p --permission-mode bypassPermissions --model <model>`; emits events for every stage; persists `events.jsonl`
  - `scripts/summarize-results.ts`, `scripts/diff-runs.ts` — thin glue
  - `fixtures/base-repo/` — seed for fixture tasks
  - `fixtures/mock-claude/claude` — deterministic stand-in for e2e tests (uses `process.exit(0)` callback after stdout.write — keep it)
  - **Dataset** at [datasets/staipler-core/](../../benchmark/harbor/datasets/staipler-core/) — 20 tasks: 5 constraint-obedience, 5 project-adaptation, 4 context-retention, 4 architecture-compliance, 2 handoff-quality
- **CLI commands** at [packages/cli/src/commands/](../../packages/cli/src/commands/):
  - `staipler benchmark run|summarize|diff` (`benchmark.ts`)
  - `staipler compile --target=claude-code` (`compile.ts`)
- **Web dashboard** at [packages/web/src/app/dashboard/benchmark/](../../packages/web/src/app/dashboard/benchmark/):
  - Release list → release detail (provenance, conflicts, gaps, skills, coverage, live SSE event stream) → per-mode run → per-task drill-down (stdout/stderr/workspace.diff/requirements)
  - SSE endpoint at `[releaseId]/events/route.ts`
- **Workspace plumbing**:
  - `pnpm-workspace.yaml` adds `packages/adapters/*`
  - `vitest.config.ts` aliases `@staipler/core` → source for cross-package tests
  - Root `package.json` adds `tsx` devDep
  - `packages/cli/package.json` adds `@staipler/adapter-claude-code` workspace dep
  - `.gitignore` excludes `benchmark/runs/` and `.staipler/releases/`

### What ran successfully
- `pnpm test` — all tests green (final count after this session's additions was 177+; subsequent unrelated work may have changed the number)
- `pnpm build` — all packages build clean
- `staipler compile --target=claude-code` against the real repo — produced deterministic manifest, 8 skills extracted
- E2E test with mock-claude binary — green
- **Real benchmark run** (release `ce0f6c3b0f8a`, 3 tasks × 2 modes, ~9 min wall clock):
  - Baseline: 2/3 pass (66.67%) — adp-002 failed because Claude omitted the `.js` ESM import extension
  - stAIpler: 3/3 pass (100%) — adp-002 used `.js` once CLAUDE.md was in the workspace
  - **+33.33 percentage points, +1 flipped task, 0 regressions**

### Incomplete or uncertain
- **Full 20-task run not yet executed.** Only 3 of 20 tasks have real-claude data, all from the project-adaptation category.
- **`token_usage` and `cost_usd` are null** in every `run.json`. `claude -p --output-format=json` would expose them; not wired yet.
- **No UI trigger to start a run.** Dashboard is read-only. `staipler benchmark run` must be invoked from a terminal.
- **`reports[mode]` typing in run-matrix.ts** — currently uses `Record<BenchmarkMode, ReturnType<typeof generateRunJson> | null>`. Works but a little loose. Could be tightened.
- **Subsequent commits on main not audited.** `a658ddc feat(core,cli): Phase 2 — continuity status injection into CLAUDE.md` could overlap with the adapter's CLAUDE.md generation. Worth checking the order in which CLAUDE.md is composed.

---

## 3. Important context

### The #1 rule
**Total visibility.** From [CLAUDE.md](../../CLAUDE.md): "Architecture, workflows, pipeline stages, contracts, intent, provenance, and conflicts must be visible to the user in real time. ... no exceptions." Stored as memory at `feedback_visibility.md`. The first pass of the benchmark system did file-based output but no real-time stream — the user rightly pushed back. The current implementation streams every pipeline stage and surfaces release provenance/conflicts in both reports and the dashboard.

### Claude CLI gotchas
- **`claude -p` requires `--permission-mode bypassPermissions`** for non-interactive edits. Without it, the spawn exits clean with zero edits — every task fails vacuously. Fixed in `2479470` but worth re-checking if you change the spawn args.
- **The first 50–185s per spawn is normal.** Claude is doing real agentic work (Read, Glob, Grep, Edit, Bash). Don't shorten timeouts under 120s.
- **Use `--output-format json`** if you want structured token usage — currently we just pipe stdout/stderr.

### Repo-root detection
The naive "walk up looking for `pnpm-workspace.yaml`" fails because `packages/web/pnpm-workspace.yaml` exists (it overrides `ignoredBuiltDependencies` for Next.js builds). The current detector keys on the **pair** `pnpm-workspace.yaml + benchmark/harbor/`, which uniquely identifies the monorepo root. See `findRepoRoot()` in `packages/cli/src/commands/benchmark.ts` and `repoRoot()` in `packages/web/src/lib/benchmark/repo.ts`. **If you add a new package containing a `pnpm-workspace.yaml`, this still works.** If you remove `benchmark/harbor/`, it breaks — pick a new sentinel.

### tsup bundles all CLI commands into a single file
`packages/cli/dist/index.js` is one bundled file, not a mirror of the `src/commands/` directory. Relative path math from `import.meta.url` therefore differs from source. Use the sentinel-walker, not a fixed-level `resolve('..', '..', ...)`.

### Determinism contract
- `release_id = sha256(bundle_hash + git_commit + adapter_version).slice(0, 12)` — 12 hex chars
- `determinism_hash = sha256(stableStringify(everything-except-built_at))` — includes `adapter_version`, `core_contract_version`, `provenance`, `conflicts`, `gaps`, `skill_sources`
- The compile is pure; `built_at` is the only non-deterministic field (allowed and excluded from the hash)

### Test infrastructure note
[vitest.config.ts](../../vitest.config.ts) aliases `@staipler/core` to the source file rather than the built `dist/`. This was necessary for cross-package tests (the adapter and the e2e tests both import from `@staipler/core`). **All existing tests now resolve `@staipler/core` from source.** If you change the public API surface in `packages/core/src/index.ts`, tests will see it immediately without a rebuild.

### Memory files updated this thread
- `feedback_benchmark_credibility.md` — six principles for credible benchmark design
- `feedback_adapter_contracts.md` — adapter/core boundary discipline

---

## 4. Next recommended focus, in order

1. **Run the full 20-task benchmark.** Command: `node packages/cli/dist/index.js benchmark run` from the repo root. ETA 45–90 min based on the small-run timings (per-task spawn time 18–185s). Cost ~$10–20. Produces real signal across all 5 categories. **Audit `a658ddc` (continuity layer Phase 2) first** to verify it doesn't interfere with our CLAUDE.md generation — see Known Issues.
2. **Parse `claude -p --output-format json` to populate `token_usage` and `cost_usd`.** Currently null in every result. The CLI's JSON output includes a `usage` block. Wire it in [benchmark/harbor/scripts/run-matrix.ts:runClaude()](../../benchmark/harbor/scripts/run-matrix.ts). Update the `summary.md` row to show tokens-per-task.
3. **Add a "Run benchmark" button to the dashboard release page.** Server action that spawns `run-matrix.ts` and returns. The SSE stream already lights up the UI in real time, so once the spawn is started, the page updates itself. Needs a concurrency lock (one active run per release).
4. **Audit `a658ddc feat(core,cli): Phase 2 — continuity status injection into CLAUDE.md`.** This commit injects continuity status into CLAUDE.md, but our adapter ALSO generates CLAUDE.md from scratch. There may be a precedence conflict — the adapter overwrites, or both run and produce contradictory blocks. Read the commit, run both, inspect output. Fix may be: the adapter should preserve a continuity block if present.
5. **Terminal-Bench 2.0 adapter** at `packages/adapters/terminal-bench/`. The right shape: takes their Docker-based task harness, materializes `compileClaudeCode().artifacts` into the per-task workspace before the agent runs, reports paired deltas through our existing `generateDiffMd`. ~1–2 days of work. This is the credibility benchmark.
6. **SWE-bench Verified** as a secondary external benchmark. Lower priority than Terminal-Bench because the fit to "Claude Code in an IDE" is less direct.

---

## 5. Known issues and risks

### Real issues to validate
- **`a658ddc` Phase 2 continuity injection may collide with `compileClaudeCode`.** Both write/inject CLAUDE.md. I did not test the interaction. **Validate before the full benchmark run.** If they conflict, the staipler-mode workspace may not contain the CLAUDE.md you think it does.
- **Permission bypass is broad.** `--permission-mode bypassPermissions` lets the agent do anything in its workspace, including `rm -rf`. Workspaces are ephemeral (temp dirs / git worktrees that get cleaned up), so this is safe — but if anyone later changes the workspace provisioning to share a directory, this becomes dangerous.
- **adp-002 is partly self-referential.** stAIpler's CLAUDE.md says to use `.js` imports; adp-002 checks that Claude uses `.js`. We see a flip, but it's a directly-stated rule. The harder categories (constraint-obedience, handoff-quality, context-retention) are where the more interesting evidence will come from.
- **n=3 is not publishable.** Don't share the `ce0f6c3b0f8a` numbers externally. They prove the harness works, not that stAIpler works.

### Code fragility
- **`reports[mode]` typing** in `run-matrix.ts` is `Record<BenchmarkMode, ReturnType<typeof generateRunJson> | null>` — works but loose. If the report shape changes, the runner won't immediately complain. Consider an explicit type.
- **`STAIPLER_CLAUDE_BIN` env var** lets you swap in mock-claude for e2e tests but isn't documented in the CLI help. If someone strips env vars in a CI runner, the mock won't be picked up.
- **Bundle scanning is naive.** `loadActiveBundle` scans the project root with `scan()` from optimizer. It picks up every .md file. If unrelated documentation grows under `docs/`, those will quietly flow into the bundle and change the release_id. The actual rule is "what stAIpler considers an instruction file" — fine for v1, but worth watching.

### Open architectural questions
- **Where should release manifests live in production?** Currently `.staipler/releases/<id>.json` at the repo root. For multi-tenant SaaS this needs to move into project-scoped storage (probably Supabase storage with `project_id` foreign key).
- **Should the runner persist events.jsonl into a database?** Right now it's filesystem only. The dashboard tails it. For multi-user dashboards we need DB persistence.
- **No CI integration.** This benchmark isn't wired to GitHub Actions. The full run is too expensive for every PR, but a nightly job could publish trends.

---

## 6. Testing and verification

### Commands run this session
- `pnpm install` — relinked workspace after adding `packages/adapters/claude-code`
- `pnpm build` — all packages green (core, adapter, cli, web)
- `pnpm test` — 177+ tests green (in this session). May differ after subsequent commits.
- `pnpm vitest run packages/adapters/claude-code packages/core` — same suite, focused
- `node packages/cli/dist/index.js compile --target=claude-code --out /tmp/staipler-compile-test2` — produced release `ef8b9bfb33b0` smoke
- `node packages/cli/dist/index.js benchmark run --limit 3` — produced release `ce0f6c3b0f8a` real run

### Recommended pre-flight for the next agent
```bash
# Verify the world is sane before doing anything
pnpm install
pnpm build 2>&1 | tail -20         # all packages should build
pnpm test 2>&1 | tail -10          # all tests should pass
git status                          # should be clean

# Inspect existing benchmark data
ls .staipler/releases/              # should contain a0ea08b4c827.json, ce0f6c3b0f8a.json
ls benchmark/runs/                  # same release ids

# Bring up the dashboard
pnpm -F web dev
# Visit http://localhost:3001/dashboard/benchmark
```

### Before the full benchmark run
```bash
# 1. Audit continuity layer interaction
git log 4763b88..a658ddc -- packages/core packages/adapters
# Read continuity Phase 2 handoff if any
ls docs/handoffs/2026-04-22-staipler-continuity-status-injection.md

# 2. Smoke compile + diff the output
mkdir -p /tmp/staipler-precheck
node packages/cli/dist/index.js compile --target=claude-code --out /tmp/staipler-precheck
head -50 /tmp/staipler-precheck/CLAUDE.md
# Make sure the continuity block isn't either duplicated or missing

# 3. Working tree must be clean for current_repo_snapshot tasks
git status --porcelain   # empty

# 4. Then kick off the full run
node packages/cli/dist/index.js benchmark run
```

---

## 7. Files and references

### Core implementation
- [packages/core/src/eval/benchmark-ready-bundle.ts](../../packages/core/src/eval/benchmark-ready-bundle.ts) — the cross-adapter contract. **Anything new that consumes bundles must go through this.**
- [packages/core/src/eval/benchmark-spec.ts](../../packages/core/src/eval/benchmark-spec.ts) — task + requirement schema. Adding a new requirement type means: extend the discriminated union here AND extend `evaluateRequirement` in the next file.
- [packages/core/src/eval/requirement-evaluator.ts](../../packages/core/src/eval/requirement-evaluator.ts) — pure evaluator (no I/O; `FileSystemProbe` injects fs access for tests).
- [packages/core/src/eval/benchmark-report.ts](../../packages/core/src/eval/benchmark-report.ts) — report generation. Has `ReleaseContext` for provenance/conflicts/skills/gaps/coverage.
- [packages/core/src/eval/load-active-bundle.ts](../../packages/core/src/eval/load-active-bundle.ts) — scans repo, analyzes layers, populates provenance with real file paths, emits events.
- [packages/core/src/events/bus.ts](../../packages/core/src/events/bus.ts) — typed event bus. **The `DistributiveOmit` helper is intentional — keep it.**
- [packages/core/src/events/sinks.ts](../../packages/core/src/events/sinks.ts) — console, JSONL, memory sinks.

### Adapter
- [packages/adapters/claude-code/src/compile.ts](../../packages/adapters/claude-code/src/compile.ts) — pure `compileClaudeCode`. All scoring inputs go through `ManifestDeterminismInputs`.
- [packages/adapters/claude-code/src/render-claude-md.ts](../../packages/adapters/claude-code/src/render-claude-md.ts) — section partitioning. Always-loaded vs skills-only vs optional-appended.
- [packages/adapters/claude-code/src/render-skills.ts](../../packages/adapters/claude-code/src/render-skills.ts) — splits the skills layer into one SKILL.md per `##` heading.
- [packages/adapters/claude-code/src/manifest.ts](../../packages/adapters/claude-code/src/manifest.ts) — schema + hashing. **`ADAPTER_VERSION` is the rendering contract version — bump on breaking output changes.**
- [packages/adapters/claude-code/src/materialize.ts](../../packages/adapters/claude-code/src/materialize.ts) — writes artifacts to disk.

### Runner and dataset
- [benchmark/harbor/scripts/run-matrix.ts](../../benchmark/harbor/scripts/run-matrix.ts) — paired orchestrator. **Spawn args (line ~165): `claude -p --model <model> --permission-mode bypassPermissions`.** Don't touch the permission flag.
- [benchmark/harbor/datasets/staipler-core/tasks/](../../benchmark/harbor/datasets/staipler-core/tasks/) — 20 task YAMLs across 5 categories.
- [benchmark/harbor/fixtures/mock-claude/claude](../../benchmark/harbor/fixtures/mock-claude/claude) — deterministic stand-in. **`process.exit(0)` callback after `stdout.write` is intentional** — without it the test process hangs.

### CLI
- [packages/cli/src/commands/benchmark.ts](../../packages/cli/src/commands/benchmark.ts) — `staipler benchmark run|summarize|diff`. Uses `findRepoRoot()` (pnpm-workspace.yaml + benchmark/harbor pair sentinel).
- [packages/cli/src/commands/compile.ts](../../packages/cli/src/commands/compile.ts) — `staipler compile --target=claude-code`.

### Dashboard
- [packages/web/src/lib/benchmark/repo.ts](../../packages/web/src/lib/benchmark/repo.ts) — filesystem reader. **Same `repoRoot()` sentinel as the CLI.**
- [packages/web/src/app/dashboard/benchmark/page.tsx](../../packages/web/src/app/dashboard/benchmark/page.tsx) — release list.
- [packages/web/src/app/dashboard/benchmark/[releaseId]/page.tsx](../../packages/web/src/app/dashboard/benchmark/[releaseId]/page.tsx) — release detail (coverage, provenance, conflicts, skills, runs, live event stream).
- [packages/web/src/app/dashboard/benchmark/[releaseId]/events/route.ts](../../packages/web/src/app/dashboard/benchmark/[releaseId]/events/route.ts) — SSE endpoint tailing `events.jsonl`.
- [packages/web/src/components/benchmark-live-events.tsx](../../packages/web/src/components/benchmark-live-events.tsx) — client component consuming SSE.
- [packages/web/src/app/dashboard/benchmark/[releaseId]/[mode]/page.tsx](../../packages/web/src/app/dashboard/benchmark/[releaseId]/[mode]/page.tsx) — per-mode run.
- [packages/web/src/app/dashboard/benchmark/[releaseId]/[mode]/[taskId]/page.tsx](../../packages/web/src/app/dashboard/benchmark/[releaseId]/[mode]/[taskId]/page.tsx) — task drill-down (stdout, stderr, workspace.diff, requirements).

### Generated artifacts on disk (not in git)
- `.staipler/releases/a0ea08b4c827.json` — pre-permission-fix release (zero edits in workspaces, vacuous pass)
- `.staipler/releases/ce0f6c3b0f8a.json` — real release with the 66.67% → 100% paired delta
- `benchmark/runs/ce0f6c3b0f8a/{baseline,staipler}/{run.json,summary.md}` — real run data
- `benchmark/runs/ce0f6c3b0f8a/diff.md` — paired diff with the +33.33pp delta and adp-002 flip
- `benchmark/runs/ce0f6c3b0f8a/events.jsonl` — full event stream

### Docs added
- [benchmark/harbor/README.md](../../benchmark/harbor/README.md) — how to run the benchmark, flags, mock-claude, how to add tasks
- This file

### Memory files (in `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/`)
- `feedback_benchmark_credibility.md` — six principles for credible benchmark design (deterministic > judge, real git diffs, reproducibility envelope, adapter versioning, fixture vs snapshot, bias toward objective tasks)
- `feedback_adapter_contracts.md` — adapter/core boundary discipline

---

## Honest notes from the prior agent

- I did not run the full 20-task benchmark. n=3 is directional. Treat the +33pp number as proof-the-plumbing-works, not as proof stAIpler is +33pp better at coding.
- I did not audit the continuity layer Phase 2 commit (`a658ddc`) against the adapter's CLAUDE.md output. There is a non-trivial chance they collide. **Validate before the full run.**
- The mock-claude fixture and the `bus.ts` `DistributiveOmit` helper were tweaked outside my view (via linter or by the user) — both changes look correct and I left them as-is.
- The web dashboard requires Supabase auth. If you're running locally and don't want to log in, the read-only release data is also fully inspectable on disk under `.staipler/releases/` and `benchmark/runs/`.
- The post-benchmark commits on `main` (deploy fixes, vscode-extension, continuity Phase 2c, web CliPanel) were not part of this thread. I haven't verified the benchmark still passes against the current `HEAD`; you should re-run `pnpm test` and `pnpm build` first.
