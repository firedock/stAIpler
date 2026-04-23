---
title: Continuity Layer Phase 2 — Status Block Injection
thread: staipler-continuity-layer
date: 2026-04-22
status: in-progress
session_type: code-change
continues: 2026-04-22-staipler-continuity-layer.md
summary: stAIpler now reads handoff frontmatter and injects a per-thread continuity table into CLAUDE.md, with configurable sort/cap/stale threshold via `.staipler.json`. 260/260 tests green. Web dashboard API routes still have stale hardcoded layer arrays — flagged as follow-up.
---

# Continuity Layer Phase 2 — Handoff

**Thread:** `staipler-continuity-layer` ([other handoffs in this thread](INDEX.md))
**Previous handoff in this thread:** [Continuity Layer Phase 1 — Detection and Scoring](2026-04-22-staipler-continuity-layer.md)
**Status:** in-progress (code-change)

---

## Session Story

Phase 1 had taught stAIpler to *know* about handoffs. It scored them, counted them, assigned them a layer — but the user never saw any of it. That was the whole point of Phase 2: turn the internal awareness into a user-facing nudge. Without it, the continuity layer was a silent test-pass.

We tackled it in two steps. First, we taught the scanner to read each handoff's YAML frontmatter — title, thread, status, the summary line that reads best at selection time. The tricky part was that YAML auto-parses `date: 2026-04-22` as a JavaScript Date, not a string; the first pass of the parser rejected every real handoff it saw. The fix normalized the date back to `YYYY-MM-DD` and relaxed the required-fields check to accept both forms. Malformed or partial frontmatter now returns null without crashing — a defensive choice so a single bad handoff never breaks the scan.

The second step was the rendering module. The agent reading CLAUDE.md needs a short, readable thread table plus an explicit "do not auto-load" instruction so it doesn't silently prime itself with the wrong prior context. We wrote it to collapse multiple handoffs in the same thread down to the most recent one, sort by the user's preference (default date), cap at ten rows inline, and add a bold stale warning when the most recent handoff is older than the threshold. When no handoffs exist, the block renders a "missing" message asking the user to run `/handoff`. When they exist but have broken frontmatter, a degraded "present but unreadable" message surfaces the discrepancy honestly.

The configuration lives in `.staipler.json` under a new `continuity` key, deep-merged with defaults so partial configs don't lose unrelated fields. The CLI commands that auto-inject on save (`init` and `watch`) now pass the user's config through to the renderer. Seventeen new tests cover every state, every sort mode, every truncation and escape edge, bringing the suite to 260 passing.

One debt surfaced along the way: the web app has roughly eight API route files with their own hardcoded copies of the layer list, none of which include continuity. We updated the two most visible ones — the project dashboard and the session-context endpoint — and flagged the rest as a follow-up. The right fix is consolidating to a single shared constant from the core package, which is beyond Phase 2 scope.

As of today, running `staipler init` or `staipler watch` against a project with handoffs writes a live, human-readable continuity section into CLAUDE.md that the next agent can actually act on. That closes the loop the whole skill was designed for.

---

## TL;DR for the next agent

- Phase 2 ships user-visible continuity surfacing in CLAUDE.md via `optimizer/inject.ts` → `continuity-status.ts`.
- `.staipler.json` now accepts `continuity: { sort, inlineThreadCap, staleThresholdDays }` — deep-merged with defaults in `config.ts`.
- 260/260 tests passing (`pnpm test`); all three packages build (`pnpm -r build`).
- **Web has ~8 stale `LAYER_TYPES` / `CANONICAL_ORDER` arrays hardcoded per-route file.** Dashboard + session-context updated; optimize/chat/widget-chat/memory/init-report/compile/quick-proof still need continuity added. Functional impact is contained to continuity-specific features through those endpoints.
- Start reading at [continuity-status.ts](../../packages/core/src/optimizer/continuity-status.ts) — all the rendering logic lives there, self-contained.
- The renderer always returns *something* when continuity is a tracked layer — missing, unreadable, or the table. Never empty. That's deliberate: silent absence of the continuity block would be indistinguishable from the layer not existing.
- **Still never auto-load a handoff.** The status block's footer instruction to the agent says so explicitly — do not soften it.

---

## 1. Snapshot

- **Branch:** `main` (continuing from Phase 1 commit `77e93fb`; Phase 2 changes uncommitted at end of session)
- **Uncommitted from this session:**
  - Modified: `packages/cli/src/commands/init.ts`, `packages/cli/src/commands/watch.ts`, `packages/core/src/config.ts`, `packages/core/src/optimizer/inject.ts`, `packages/core/src/optimizer/scanner.ts`, `packages/core/tests/continuity.test.ts`, `packages/web/src/app/api/session-context/route.ts`, `packages/web/src/components/project-dashboard.tsx`
  - Untracked: `packages/core/src/optimizer/continuity-status.ts`, `packages/core/tests/continuity-status.test.ts`
- **Build:** green for all three packages — verified `pnpm -r build`
- **Tests:** 260/260 passing across 33 files — verified `pnpm test` from repo root
- **Dev server / CLI:** not exercised manually. Renderer output is verified by unit tests; actual `staipler watch` against a real project with handoffs is recommended before declaring Phase 2 user-complete.
- **Snapshot taken:** 2026-04-22

## 2. Orientation — read these in this order

1. [packages/core/src/optimizer/continuity-status.ts](../../packages/core/src/optimizer/continuity-status.ts) — the rendering module, self-contained. `renderContinuitySection` is the single entry point; everything else is internal.
2. [packages/core/src/optimizer/inject.ts](../../packages/core/src/optimizer/inject.ts) — `generateStatusBlock` was extended to call the renderer between weak-layers and coverage. The continuity config is now an optional parameter with defaults so existing call sites work unchanged.
3. [packages/core/src/config.ts](../../packages/core/src/config.ts) — `ContinuityConfig` shape, `DEFAULT_CONTINUITY_CONFIG`, and the deep-merge logic in `loadConfig` that preserves user overrides under `continuity`.
4. [packages/core/tests/continuity-status.test.ts](../../packages/core/tests/continuity-status.test.ts) — 17 tests that document the expected rendering for every state.

**What does NOT exist that the next agent might assume does:**
- **No shared `LAYER_TYPES` constant imported across the web package.** Each route file has its own copy. If you're adding a feature that touches layer ordering anywhere in `packages/web/src/app/api/*`, grep for `'constraints', 'context'` to find all the sites.
- **No automated check that `LAYER_TYPES` arrays are in sync.** A 14th layer added to core would not automatically propagate; the web arrays would drift silently.
- **No runtime validation of `.staipler.json` continuity block.** An invalid sort value silently falls back to `date`. If users want schema errors, we'd need to add Zod validation in `loadConfig`.

## 3. Why this session existed

Phase 1 made stAIpler aware of handoffs internally but left the user with no visibility into whether they had a handoff, when it was last written, or which threads were active. Without Phase 2, the `/handoff` skill had no forcing function — users (and I myself) would forget to run it. The status block injection is the nudge: every time stAIpler runs `inject`, the CLAUDE.md gets a current snapshot of handoff state that the next agent reads on session start.

## 4. What shipped

| Thing | One-line why |
|---|---|
| `ContinuityConfig` interface + defaults in `config.ts` | User control over sort mode, inline cap, and stale threshold without requiring code changes |
| Deep-merge in `loadConfig` | Partial `.staipler.json` configs don't clobber defaults for unset continuity fields |
| `parseHandoffFrontmatter` in scanner | Populates `ScannedFile.handoffMetadata` with title/thread/date/status/summary when handoff YAML is valid |
| YAML Date → `YYYY-MM-DD` string normalization | YAML auto-parses dates; first-pass parser rejected every valid handoff. Fix normalizes to the string form callers expect |
| `renderContinuitySection` in `continuity-status.ts` | Pure function: scanned files + config + now → markdown block. Self-contained, unit-testable |
| Three distinct states: missing / present-unreadable / table | Honest surfacing of all three real-world scenarios rather than silence |
| Stale warning when most recent handoff > `staleThresholdDays` | Nudge before the agent starts work on stale context |
| Inline-thread cap with truncation footer | Keeps CLAUDE.md bounded; the rest are accessible via `docs/handoffs/INDEX.md` |
| Three sort modes: date / status / thread | `date` default for recency; `status` highlights active work; `thread` alphabetical for large-scale projects |
| Pipe escaping in summaries | Summaries with `\|` characters don't break the markdown table |
| Singular/plural grammar ("1 thread tracked", "1 day ago") | Cosmetic polish; the block gets re-read on every session start, so readability matters |
| CLI `init`/`watch` pass continuity config through | Auto-inject on save uses user-configured sort/cap/threshold |
| Dashboard + session-context updated for continuity | Two highest-visibility web surfaces include continuity in their layer arrays |

## 5. Architecture — non-obvious decisions

- **Renderer is a pure function, not a class or a service.** Input: `ScannedFile[]` + `ContinuityConfig` + optional `now`. Output: `string`. That shape made the 17 tests trivial to write and keeps the module free of IO dependencies — testing doesn't need tmpdirs the way the scanner tests do.
- **Optional config parameter, defaults applied in-module.** `generateStatusBlock(analysis, continuityConfig = DEFAULT_CONTINUITY_CONFIG)` preserves backwards compatibility for the eval and prove-value call sites (`packages/core/src/eval/prove-value.ts`) which don't have a project config. They get default rendering, which is fine for their purposes.
- **Thread collapsing happens in the renderer, not the scanner.** The scanner emits all files; the renderer decides how to group them. That leaves the raw file list available to downstream consumers (e.g. Phase 3's quality scoring) that need every handoff, not just the most recent per thread.
- **Degraded "present but unreadable" state.** When handoffs exist but all have broken frontmatter, the block says so explicitly rather than showing "missing." If we conflated the two, a user with broken handoffs would see the same message as a user with none, and the diagnostic trail would be lost.
- **Stale threshold computed from filename date, not frontmatter date.** Matches Phase 1's scoring logic — the filename prefix is the durable source of truth across git operations and machine syncs. Frontmatter dates are read for rendering but not for freshness.

## 6. Contracts

**New contracts established this session:**
- `.staipler.json` `continuity` block shape: `{ sort: 'date' | 'status' | 'thread', inlineThreadCap: number, staleThresholdDays: number }`. Unknown sort values fall back to `date`. Enforced by `loadConfig` deep-merge and renderer's sort switch.
- Handoff files with valid frontmatter populate `ScannedFile.handoffMetadata`. Malformed / missing → `null`. Enforced by `parseHandoffFrontmatter` in scanner.
- The continuity status block lives between weak-layers and coverage lines inside `<!-- staipler:status -->`. Enforced by `inject.ts` ordering.
- The agent-facing instruction footer ("do not auto-load any handoff...") is verbatim text inside every rendered non-empty state. Enforced by `continuity-status.ts` emitting it as the last line before returning.

**Existing load-bearing contracts this code depends on:**
- `generateStatusBlock` and `injectStatus` signatures kept backwards-compatible via optional `continuityConfig` parameter. Three external callers (`init.ts`, `watch.ts`, `prove-value.ts`) continue to work; the first two pass config through, the third gets defaults.
- `parseHandoffDate` (Phase 1) is now called by both the analyzer (for scoring) and the renderer (for freshness and age display). Changing its contract changes both surfaces.
- `ScannedFile` construction must set `handoffMetadata: null` at every creation site. Three sites were updated (walkFiles, scanMcpConfigs, memory-provider synthetic file). If a new site is added and omits the field, TypeScript catches it.

## 7. Key patterns — the status block layout

```
<!-- staipler:status -->

**Empowerment Score: N/100 (Grade)**

Missing layers: ...
Weak layers: ...

**Continuity — N thread(s) tracked**    ← new in Phase 2
[optional] **Stale**: last handoff X days old...
| Thread | Status | Age | Summary |
| ...    | ...    | ... | ...     |
_(N more threads in docs/handoffs/INDEX.md.)_
_For the agent reading this: do not auto-load any handoff..._

Coverage: N present, M weak, L missing out of 13 layers

_Last updated: YYYY-MM-DDTHH:MM_

<!-- /staipler:status -->
```

The continuity section is a self-contained block. It can be lifted or repositioned without breaking anything else in the status block.

## 8. Guardrails enforced

- **Never return empty when continuity is tracked.** Empty state is "missing" message, not silence. Keeps the layer's presence visible.
- **Never auto-load in the agent instruction footer.** The footer text is verbatim in every non-empty render; modifying it requires an intentional code change, not a config toggle.
- **Sort fallback is silent, not an error.** Unknown sort values fall back to `date`. A misconfigured `.staipler.json` should not block injection.
- **Deep-merge preserves user continuity overrides.** Shallow spread would have wiped partial configs. Test: `{ continuity: { sort: 'thread' } }` keeps `inlineThreadCap: 10` and `staleThresholdDays: 30` from defaults.
- **Pipe escaping in summaries.** User-authored summaries can contain `\|`; unescaped, they break the markdown table and the next agent reads corrupted state.

## 9. Lessons — about the code

- **YAML date parsing is a silent footgun.** `gray-matter` returns JS `Date` objects for `date: 2026-04-22`, but `typeof` says `'object'` — strict string checks reject every real-world frontmatter. The fix is a single small helper, but finding it took a test failure and reading the `matter` return values. Worth remembering for any future YAML-parsing work.
- **Optional parameters with defaults beat new signatures.** Keeping `generateStatusBlock(analysis, continuityConfig = DEFAULTS)` backwards-compatible let me ship Phase 2 without touching `prove-value.ts` or writing migration shims. If I'd required the config, I would've had to chase three unrelated call sites.
- **Hardcoded `LAYER_TYPES` arrays propagate.** Grep-finding eight sites in the web package that duplicate the core constant is a clear technical debt. Every layer addition is an N-site change until someone consolidates. I updated two; the remaining six are flagged in §13.
- **Test the renderer, not the IO.** Writing the renderer as a pure function meant all 17 tests run in milliseconds without tmpdirs. The scanner tests (Phase 1) need filesystem setup; the renderer tests just construct `ScannedFile` objects and check the string. Architectural choice paid off in the test suite.

## 10. Lessons — about the collaboration

- **Micro-decisions deserve explicit confirmation even in high-trust mode.** I surfaced three micro-decisions (truncate-or-full summary, age format, stale-threshold config) before implementing. User answered all three directly and we moved on. Skipping that checkpoint would've meant guessing defaults and possibly ending up with a rendering the user didn't want.
- **The user's "lets do it" and "go" are commitment signals, not vague approval.** Don't re-ask the same question after "go" — execute and surface work at the next natural checkpoint.
- **Auto-mode toggle is a signal, not a license.** It turned on briefly mid-session and exited again. The right read is that the user was willing to let me run autonomously for the low-risk staging work but wanted oversight back once we hit the commit/design-decision boundary.

## 11. Failed approaches / dead ends

- **First-pass frontmatter parser used strict string checks on every field.** Rejected every real handoff because YAML parsed the `date` field as a JS `Date`. Fixed by adding an `asDateString` helper that accepts both forms. The strict check on `title`/`thread`/`summary` stayed (those are always strings).
- **Initial test used CLAUDE.md to verify non-continuity files don't get handoff metadata.** The test couldn't reliably find a `context`-kind file (CLAUDE.md classification depends on `FILE_TYPES` lookup that produced inconsistent results in tmpdir). Switched to `memory.md` which is classified via `FILENAME_LAYER_MAP` — deterministic. Lesson: when testing classification, use files with direct filename matches, not AI-tool-source-type inferences.
- **Considered putting the continuity section at the very top of the status block (above Empowerment Score).** Decided against — the score is the headline for the whole stAIpler value proposition; continuity is one layer among thirteen. Putting it after weak-layers keeps the block's existing narrative (score → gaps → continuity → coverage) intact.
- **Tempted to cache thread-collapse results.** Didn't — the renderer is called once per inject, and collapse is O(n) over handoffs. Premature optimization; dropped.

## 12. Risk surfaces

- **`continuity-status.ts` renderer is the single source for the agent-facing footer instruction.** If that text drifts ("ask which thread" → "guess the thread"), every CLAUDE.md in every project using stAIpler gets the wrong guidance on next re-inject. Treat changes with care.
- **`loadConfig` deep-merge only handles `continuity` specially.** If a future config block needs the same treatment (e.g. `requiredLayers` nested under something), someone will add it and forget to update the catch block on the bottom. Worth a note in a future refactor.
- **Web app's ~8 hardcoded `LAYER_TYPES` arrays.** Any feature touching layer ordering in the web package must update whichever copy is local to that route. A contributor who doesn't know this will ship a bug where continuity silently drops from their feature's output. Mitigation: the dashboard + session-context routes are updated; the highest-visibility surfaces are correct.
- **Age calculation uses UTC, not local time.** `daysBetween` computes in UTC milliseconds. If a user in UTC-8 writes a handoff at 11 PM local, it gets a UTC date of the next day, which might read as "1 day ago" when they expect "today." Acceptable for daily-granularity display; documented as a known-quirk.

## 13. Technical debt

**Known (we accepted it):**
- **Web package layer-list duplication.** ~8 route files have hardcoded `LAYER_TYPES` / `CANONICAL_ORDER`. Only 2 updated this session. Trigger for consolidation: next time someone adds a layer, or next time a continuity-specific feature ships through those routes and produces visibly-wrong output. Right fix: export a single constant from `@staipler/core` and import everywhere.
- **No Zod validation on `.staipler.json` continuity block.** Unknown `sort` values silently fall back; unknown fields are silently ignored. Acceptable for Phase 2 — validation would add friction for a feature still stabilizing. Add once the shape is settled.
- **Phase 2 isn't manually dogfooded yet.** Unit tests verify rendering; no one has run `staipler init` against firedock and read the resulting CLAUDE.md with human eyes. That's the next-session task flagged in §16.

**Suspected (we worry but didn't verify):**
- **Windows paths in `HANDOFF_FILE_REGEX`.** Regex handles both `/` and `\\` but testing was macOS-only. Worth a Windows CI test before public release.
- **Deep-merge semantics for arrays inside `continuity`.** Currently `continuity` is a flat object of scalars. If we later add an array field (e.g. `hiddenThreads: string[]`), a user's partial config would replace rather than merge it. Will revisit when/if we add array fields.

## 14. Open questions awaiting the user

- **Do we want Zod validation for `.staipler.json` now?** Current behavior is silent fallback on bad values. I'd defer until Phase 3, but if you see users misconfiguring in ways that confuse the rendering, it's a 15-minute add.
- **Dogfood timing.** Running `staipler init` against firedock to see the live CLAUDE.md update is a natural next-session task. Worth doing before Phase 3 to confirm the rendering reads well in-context.

## 15. Intentionally not done

- **Web API route sweep.** Six route files have stale `LAYER_TYPES` arrays. Intentionally scoped out — the right fix is a consolidation refactor, not a six-file copy-paste update.
- **Zod schema on config.** Deferred until the continuity config surface stabilizes.
- **Phase 3 (handoff content quality scoring).** The whole point was to wait until we had real handoffs to calibrate against. Still waiting.
- **Updating stAIpler's own CLAUDE.md or README to advertise the new layer.** Documentation lag is deliberate — wait until Phase 3 is in or the feature has been dogfooded.
- **Thread auto-detection in `/handoff` skill.** The skill still asks the agent to match existing threads freeform. The stAIpler INDEX + status block now makes this tractable, but the skill itself wasn't updated this session.

## 16. Next steps (ordered, with rationale)

1. **Commit Phase 2 as a focused feature commit.** Clean unit of work, tests green, builds green. Do this before anything else. Proposed message in §17.
2. **Dogfood against a real project.** Run `staipler init` in firedock (which now has `docs/handoffs/INDEX.md` with two handoffs), then read the resulting CLAUDE.md. Fix whatever looks wrong in-context — word count, section positioning, phrasing. This is the step that tells us whether the design reads the way we hoped, and it can't be done purely from tests.
3. **Sweep the web package's stale `LAYER_TYPES` arrays.** Six route files. Either (a) add `continuity` in each, or (b) consolidate to a shared import from `@staipler/core`. The latter is the right fix; the former is acceptable if time-pressured.
4. **Phase 3: handoff content quality scoring.** Only after 1–3 and after there's a corpus of at least 5 real handoffs across 2+ threads. Parse handoff markdown structure, score section completeness, detect filler text, flag stale snapshot SHAs.
5. **Ecosystem rollout.** Run `staipler inject` against NoteDrawer-Web, NoteDrawer-Mobile, and stAIpler itself. Each picks up continuity tracking. This is where the compounding value kicks in: every project in the ecosystem gets a continuity nudge, dramatically more likely to sustain the handoff discipline.

## 17. File map

**New (this session):**
- `packages/core/src/optimizer/continuity-status.ts` — rendering module (renderContinuitySection + helpers)
- `packages/core/tests/continuity-status.test.ts` — 17-test suite for the renderer

**Modified (this session):**
- `packages/core/src/config.ts` — `ContinuityConfig` interface, `DEFAULT_CONTINUITY_CONFIG`, deep-merge in `loadConfig`
- `packages/core/src/optimizer/scanner.ts` — `HandoffMetadata` interface, `parseHandoffFrontmatter` export, `ScannedFile.handoffMetadata` field, population in `walkFiles` + backfill at MCP and memory-provider ScannedFile sites
- `packages/core/src/optimizer/inject.ts` — `generateStatusBlock` and `injectStatus` accept optional `ContinuityConfig`; continuity section injected between weak-layers and coverage
- `packages/core/tests/continuity.test.ts` — 12 new tests covering frontmatter parsing (valid, missing, malformed, partial, all status values, fallback behavior) and scanner integration
- `packages/cli/src/commands/init.ts` — loads config, passes `config.continuity` to `injectStatus`
- `packages/cli/src/commands/watch.ts` — passes `config.continuity` to auto-inject; `LAYER_ORDER` and `LAYER_HINTS` updated with continuity
- `packages/web/src/components/project-dashboard.tsx` — `LAYER_TYPES` includes continuity
- `packages/web/src/app/api/session-context/route.ts` — `CANONICAL_ORDER` includes continuity

**Proposed commit:**
```
feat(core,cli): Phase 2 — continuity status injection into CLAUDE.md

- New continuity-status.ts renders the per-thread table between
  weak-layers and coverage inside the <!-- staipler:status --> block
- Scanner now parses handoff YAML frontmatter into ScannedFile.handoffMetadata
  (title, thread, date, status, session_type, continues, summary); malformed
  or partial frontmatter returns null rather than crashing the scan
- .staipler.json accepts a new `continuity` block: { sort, inlineThreadCap,
  staleThresholdDays }, deep-merged with defaults; unknown sort values
  silently fall back to 'date'
- CLI init/watch pass user's continuity config through to injectStatus;
  generateStatusBlock and injectStatus remain backwards-compatible via
  optional config parameter
- Renderer surfaces three states: missing / present-unreadable / table;
  stale warning appears when the most recent handoff exceeds the
  configurable threshold (default 30 days)
- Web dashboard + session-context route updated for continuity in their
  layer arrays; six other API routes flagged as follow-up consolidation

17 new renderer tests + 12 new frontmatter tests; full suite at 260/260.
See docs/handoffs/2026-04-22-staipler-continuity-status-injection.md.
```

## 18. Related docs

- [Phase 1 handoff](2026-04-22-staipler-continuity-layer.md) — predecessor in this thread. Registers `continuity` as stAIpler's 13th layer and defines the scoring rubric this Phase 2 reads from.
- [firedock/docs/handoffs/2026-04-22-handoff-skill-design.md](../../../firedock/docs/handoffs/2026-04-22-handoff-skill-design.md) — the upstream `/handoff` skill work that this stAIpler integration is built on top of.
- [~/.claude/skills/handoff/SKILL.md](~/.claude/skills/handoff/SKILL.md) — the skill's definition of the handoff frontmatter shape. When the skill updates that shape, `parseHandoffFrontmatter` in this repo needs to stay in sync.
- [stAIpler/CLAUDE.md](../../CLAUDE.md) — will get a continuity status block on the next `staipler init` run against this repo. The block's content is what the next agent working on stAIpler will read.
