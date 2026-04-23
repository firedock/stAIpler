---
title: Continuity Layer Phase 1 — Detection and Scoring
thread: staipler-continuity-layer
date: 2026-04-22
status: in-progress
session_type: code-change
continues: null
summary: Added `continuity` as stAIpler's 13th instruction layer (runtime, alongside memory); scanner detects docs/handoffs/*.md, analyzer scores presence + freshness + chain length. All 231 tests green. Phase 2 (CLAUDE.md status injection with thread list) is the user-visible payoff and not yet built.
---

# Continuity Layer Phase 1 — Handoff

**Thread:** `staipler-continuity-layer` ([other handoffs in this thread](INDEX.md))
**Previous handoff in this thread:** none — this is the first
**Status:** in-progress (code-change)

---

## Session Story

Right after shipping a `/handoff` skill and setting up the threaded storage model, we turned to stAIpler — the user's product that scores AI instruction-stack coverage across 12 layers. The question was whether to integrate handoffs as a native layer now or defer until the skill had stabilized. We chose to do it now, after realizing the skill had no organic refinement mechanism without a forcing function to actually produce handoffs.

Before touching stAIpler code, two design questions forced corrections. First, whether the new `continuity` layer should be classified static or runtime. The initial instinct was static ("it's a file on disk"), but that was the wrong axis — memory is also a file on disk and is runtime. The right axis is role at compile time: runtime layers are session-scoped context, not baked into the standing instruction set. Handoffs fit runtime cleanly. Second, whether Phase 1 scored whether a handoff exists or how good it is. We split that into two phases: Phase 1 ships presence and freshness (mechanical, fast to calibrate); Phase 3 will ship content quality scoring once there are real handoffs to tune against.

The user also pushed back on a deeper design assumption. The skill had been writing a single "latest" pointer, which implicitly assumed work is linear. In reality there are multiple parallel initiatives at any given time. So the storage model shifted to threads: every handoff carries frontmatter with a thread name, and an index file replaces the pointer as the canonical navigation surface. The agent never auto-loads a handoff at session start — the user selects by mentioning a topic or a thread name.

With the model settled, the stAIpler work was straightforward: register continuity everywhere the 12 existing layers are enumerated (six files had exhaustive records the build caught one at a time), teach the scanner to detect dated handoff files, and special-case the analyzer to score freshness instead of content length. Dated handoffs score highest when recent and when they chain into a sequence — sustained discipline is worth more than a single stale document. All 231 tests pass, including 11 new ones covering scanner detection, index exclusion, and every scoring edge.

As of today, stAIpler knows about handoffs and scores projects on whether they're being written. The user-visible payoff — a "Continuity: 3 threads tracked, most recent 2 days old" block injected into each project's CLAUDE.md — is Phase 2, and it's the part that closes the loop by forcing the next agent to ask "are we continuing a thread, or starting fresh?" instead of flying blind.

---

## TL;DR for the next agent

- Build green (`pnpm --filter @staipler/core build`), 231/231 tests passing (`pnpm test`).
- Phase 1 ships `continuity` as stAIpler's 13th layer (runtime, alongside `memory`). Detected at `docs/handoffs/YYYY-MM-DD-*.md`. Scored on presence + freshness (parsed from filename date prefix) + chain length.
- **Phase 2 is the payoff and is NOT done.** stAIpler currently "knows" about continuity but writes nothing into CLAUDE.md. The user sees no nudge, no thread list, no "stale handoff" warning. Without Phase 2 the layer is invisible to the user.
- Start reading at `scoreContinuityLayer` in [packages/core/src/optimizer/analyzer.ts](../../packages/core/src/optimizer/analyzer.ts) — it's the new logic most different from the existing pattern.
- Risk surface: adding another `LayerType` exposed 6 exhaustive `Record<LayerType, ...>` sites across the codebase. If you add a 14th layer, the build catches the compile-time sites but runtime logic won't — chase every compile error and grep for `LAYER_TYPES`.
- Open question: Phase 2 status block format + size budget (how many threads to list inline vs. deferring to INDEX.md). Scoped, not confirmed with user.
- **Never auto-load a handoff at session start.** The threaded model explicitly forbids it — wrong-handoff-loaded primes bad context silently.

---

## 1. Snapshot

- **Branch:** `main` — last commit `4f6957f safety(billing): BYOK-only until managed billing ships` (pre-existing, not from this session)
- **Uncommitted from this session:**
  - Modified: `packages/core/src/optimizer/agent.ts`, `analyzer.ts`, `scanner.ts`, `pipeline/extract.ts`, `pipeline/organize.ts`, `schema.ts`, `types.ts`, `tests/schema.test.ts`
  - Untracked: `packages/core/tests/continuity.test.ts`, `docs/handoffs/` (this file + INDEX.md)
- **Build:** green — verified `pnpm --filter @staipler/core build` (ESM 296.84 KB + DTS 89.21 KB, no errors)
- **Tests:** 231/231 passing — verified `pnpm test` from repo root (32 test files, 6.61s, includes the 11 new continuity tests)
- **Dev server / CLI:** not exercised this session. The continuity layer changes show up in `scanner.scan()` + `analyzer.analyze()` output, but the `staipler watch` / `staipler ci` visible surfaces haven't been manually run against a project with handoffs.
- **Snapshot taken:** 2026-04-22

## 2. Orientation — read these in this order

1. [packages/core/src/optimizer/analyzer.ts](../../packages/core/src/optimizer/analyzer.ts) — the new `scoreContinuityLayer` function (presence + freshness + chain) and `LAYER_DESCRIPTIONS['continuity']` are the most novel pieces. Every other layer uses the generic `scoreLayer` logic; continuity is the only special case.
2. [packages/core/src/optimizer/scanner.ts](../../packages/core/src/optimizer/scanner.ts) — specifically the `HANDOFF_FILE_REGEX`, `isHandoffPath`, and exported `parseHandoffDate` at ~line 102–130, plus the `inferKind` signature change to take `relativePath`. The path-based classification is different from the filename-only classification the other 12 layers use.
3. [packages/core/tests/continuity.test.ts](../../packages/core/tests/continuity.test.ts) — 11 tests covering every scoring case + INDEX.md exclusion. Gives you the complete picture of the intended behavior in one file.

**What does NOT exist that the next agent might assume does:**
- **No frontmatter parsing in the scanner.** The scanner only uses filename + path for classification; handoff YAML frontmatter (`thread`, `status`, `summary`) is still unparsed. Phase 2 will need this.
- **No CLAUDE.md status block for continuity.** The `<!-- staipler:status -->` injection path exists for other layers; continuity is registered but not surfaced there yet.
- **No thread-aware scoring.** The score is across all handoffs regardless of thread. "Stale threads" (thread with handoffs but no recent activity) aren't detected.
- **No UI changes.** `packages/web/` was not touched; if a dashboard shows layer coverage, it'll pick continuity up from `LAYER_TYPES` generically but won't render anything handoff-specific.

## 3. Why this session existed

The user produces long-form retrospective docs by hand (e.g. `firedock/docs/main-agent.md`) that let future AI agents pick up complex initiatives cleanly. They wanted the pattern systematized: every coding session ends with a handoff, the next session starts warm. Earlier in the same session we designed and shipped the `/handoff` skill and its threaded storage model. The remaining gap: without a forcing function, people (including the user) will forget to run the skill. stAIpler is already in the business of scoring AI-context coverage across layers — making `continuity` a first-class layer gives stAIpler a reason to nudge the user when handoffs are missing or stale.

## 4. What shipped

| Thing | One-line why |
|---|---|
| `continuity` as a `RuntimeLayerType` | Classified alongside `memory` because handoffs are session-scoped context, not standing instructions |
| Handoff path detection in the scanner | `docs/handoffs/YYYY-MM-DD-*.md` → classified as `continuity` with 0.95 confidence; `INDEX.md` under the same dir is excluded |
| Exported `parseHandoffDate` | Derives age from the filename's date prefix so handoffs score correctly even when copied between machines (mtime would lie) |
| `scoreContinuityLayer` function | Presence (40) + freshness (0–30 based on age buckets) + chain bonus (0–25 based on count), capped at 100 |
| `LAYER_IMPORTANCE['continuity'] = 'recommended'` | Same weight as context/skills/goals — high-value but not critical |
| `LAYER_DESCRIPTIONS['continuity']` | Diagnosis strings used by the analyzer when layer is missing/weak/present |
| Entry in `pipeline/extract.ts` KIND_SIGNALS + LAYER_DESCRIPTIONS | For future LLM-based layer extraction to route handoff-shaped content correctly |
| Entry in `optimizer/agent.ts` `getLayerGuidance` | Explicitly notes continuity is user-authored, not AI-generated by the optimizer |
| 11-test suite in `tests/continuity.test.ts` | Covers every scoring case + INDEX.md exclusion + filename date parsing edge cases |

## 5. Architecture — non-obvious decisions

- **Runtime, not static.** Runtime layers (`memory`, now `continuity`) aren't compiled into the permanent instruction bundle — they're session context. Static layers (identity, constraints, etc.) are. Handoffs fit runtime because they're read fresh each session; if they were baked into the compiled bundle, a stale handoff would corrupt every subsequent agent session until re-optimization.
- **Path-based detection, not filename.** Every other layer is classified by filename (`CONSTRAINTS.md` → constraints). Continuity had to be path-based because handoffs live at `docs/handoffs/YYYY-MM-DD-<slug>.md` — we can't pattern-match on filename alone without missing handoffs or grabbing unrelated dated files. `inferKind` now takes `relativePath` as a third argument for this reason.
- **Date from filename, not mtime.** `parseHandoffDate` parses the `YYYY-MM-DD-` prefix. Filesystem mtime would work locally but break if the user copies/syncs handoffs between machines, or if git operations rewrite mtime. The date prefix is the durable source of truth.
- **Presence + freshness + chain — not content length.** Every other layer's `scoreLayer` rewards longer content (up to a point). Continuity deliberately doesn't — a 500-word handoff isn't worse than a 5000-word one; what matters is whether the handoff exists, how old it is, and whether there's a chain (multiple handoffs over time = sustained discipline). Content quality is Phase 3.
- **`last-wins` merge strategy.** For the rare case where continuity is somehow merged (shouldn't happen in normal use since handoffs are per-session), the most recent one wins. This mirrors `memory: 'concatenate'` being different — memory accumulates, handoffs supersede.

## 6. Contracts

**New contracts established this session:**
- Handoff filename format: `YYYY-MM-DD-<slug>.md`. The date prefix is required; without it, the file is counted as "present but undateable" and gets a 30-point score instead of 40+. Enforced by `parseHandoffDate` returning null.
- `docs/handoffs/` is the only path `continuity` files are detected at. Other locations won't be classified. Enforced by `HANDOFF_FILE_REGEX`.
- `INDEX.md` inside `docs/handoffs/` is explicitly not a handoff. Enforced by the regex requiring the `YYYY-MM-DD-` prefix.

**Existing load-bearing contracts this code depends on:**
- `LAYER_TYPES` is alphabetized; any new layer must slot in alphabetically to match the existing convention. See [schema.ts:15](../../packages/core/src/schema.ts) and `CANONICAL_SECTION_ORDER`.
- Every `Record<LayerType, X>` in the codebase must have an entry for every layer. The TypeScript compiler catches missing entries at build time — this is how I found the 6 sites that needed updating (see §12 Risk surfaces).
- Scanner walks skip `tests/`, `test/`, `__tests__/`, `fixtures/`, etc. Projects that put handoffs inside those directories will be missed — acceptable tradeoff for not polluting the scan with test fixtures.

## 7. Key patterns — scoring shape

The continuity score curve, with why each threshold:

```
ageDays = days since most recent handoff (from filename prefix)
chain   = total number of dated handoffs in docs/handoffs/

score = 0                                     if no handoffs
score = 30                                    if handoffs exist but none has a parseable date
score = 40                                    base for ≥1 dated handoff
      + 30 (freshness)  if ageDays ≤ 7        recent, actively maintained
      + 20              if 8 ≤ ageDays ≤ 14   moderate
      + 10              if 15 ≤ ageDays ≤ 30  aging
      + 0               if ageDays > 30       stale (no freshness bonus)
      + 15 (chain)      if chain ≥ 2          more than a one-off
      + 10              if chain ≥ 5          sustained discipline
capped at 100
```

Representative scores:
- 1 handoff, 2 days old → 70 (present, B/C band)
- 5 handoffs, most recent 1 day old → 95 (A band — target state)
- 1 handoff, 45 days old → 40 (present but stale; analyzer reports status='present' per the ≥40 threshold, but Phase 2 status injection should distinguish)

## 8. Guardrails enforced

- **Never score on mtime.** Filename date prefix is the only source of truth for age. Keeps scoring stable across machine moves and git operations.
- **Exclude INDEX.md.** It's a generated table of contents, not a handoff — counting it would inflate chain length misleadingly.
- **Require exhaustive records for new layers.** Every `Record<LayerType, ...>` in the codebase is an enforcement point. Anyone adding a 14th layer will get compile errors until every site has an entry — no silent gaps.
- **Phase 1 does not read handoff content.** Scoring is purely metadata (path + filename). This keeps Phase 1 fast and deterministic, and keeps the content-quality work cleanly isolated to Phase 3.

## 9. Lessons — about the code

- **Exhaustive `Record<LayerType, ...>` is a feature, not a chore.** Six build errors iteratively pointed me at every site that needed updating. Without the exhaustiveness check I would have missed at least two — `pipeline/organize.ts:290` weights and `pipeline/extract.ts:66` descriptions are far from the main analyzer path and easy to overlook.
- **Path-based vs filename-based classification was a real design wedge.** `inferKind` existed for 12 layers as `(fileName, sourceType) → kind`. Continuity needed the full relative path. Adding a parameter to a well-scoped function was the right call — better than special-casing in `walkFiles` or maintaining two parallel classification functions.
- **Runtime layers are load-bearing even though the union currently has only two.** The distinction ("is this compiled into the standing instruction set, or injected fresh per session?") matters for the eventual compilation pipeline. Classifying continuity as static because it's a file on disk would have created subtle bugs when the compiler tried to bake stale handoffs into bundles.

## 10. Lessons — about the collaboration

- **The user pushes back on framing, and those pushbacks reshape the entire design.** Three times this session: the static/runtime question, the presence/quality split, the threaded-vs-linear storage model. Each one was a framing correction, not a code correction. Watch for those — they're far higher-leverage than low-level feedback.
- **"Agreed, let's proceed" and "continue in order" are high-trust execution signals.** When the user signs off on a sequence with those phrasings, execute without re-confirming each step. Re-confirming feels like friction.
- **The user explicitly invited meta-observation** ("keep a record of what you do… what would have been good to know"). When asked to do meta-work, do it actively and surface findings, don't just produce the primary artifact.
- **The user's questions often point at under-specified design, not just under-explained answers.** "How is continuity different from memory?" wasn't a clarification ask — it was flagging that my static/runtime classification was on the wrong axis. Treat these questions as design-review prompts, not explanation prompts.
- **Scope expansion is fine when the rationale is clear.** The handoff design went from "single skill" to "skill + storage model + stAIpler integration" across one session. The user accepted every expansion when I explained *why*. Don't pre-emptively shrink scope.

## 11. Failed approaches / dead ends

- **Static layer classification.** Briefly committed to this ("handoffs are files on disk like static layers"), then caught by the user's direct question. Reverted before writing code. Lesson: challenge the first-pass classification against the strongest counter-case (`memory` is also a file on disk — so "file on disk" can't be the axis).
- **Treating `INDEX.md` as a handoff.** Early regex would have matched it. Caught during test writing, added the date-prefix requirement to exclude. Lesson: write the exclusion test before trusting the regex — `HANDOFF_FILE_REGEX` is now correct specifically because of that test.
- **Skipped:** adding frontmatter parsing to the scanner in Phase 1. Tempting because it was "right there," but the scanner has a single-responsibility shape (classify + surface files) and frontmatter is only consumed by Phase 2. Keeping Phase 1 metadata-only made this session finishable in one pass.

## 12. Risk surfaces — innocent-looking changes that aren't

- **Any file with `Record<LayerType, ...>`.** Six sites were updated this session: `schema.ts` (merge strategies), `optimizer/analyzer.ts` (importance, descriptions), `optimizer/agent.ts` (guidance), `pipeline/organize.ts` (importance, weights), `pipeline/extract.ts` (signals, descriptions). Adding a 14th layer means another ~6 updates. The compiler catches most but not runtime iteration over `LAYER_TYPES` — grep explicitly before assuming the build caught everything.
- **`inferKind` signature.** Now takes `(fileName, relativePath, sourceType)`. Anything calling it (currently only `walkFiles`) must pass the relative path. If a future caller imports `inferKind` from outside the scanner, they need relativePath too.
- **`HANDOFF_FILE_REGEX` case-insensitive matching.** Works on both Unix and Windows separators, but is strict about the date format. A user writing `2026-4-22-foo.md` (no leading zero) will not match. Enforce the convention in the `/handoff` skill.
- **`scoreContinuityLayer`'s `now` parameter.** Defaults to `new Date()` but is parameterizable for testing. If any callsite passes a past date by mistake, scoring will inflate. Only the test suite uses the parameter currently.

## 13. Technical debt

**Known (we accepted it):**
- **No frontmatter parsing.** Scanner sees handoffs as opaque files. Phase 2 needs thread/status/summary from frontmatter; the parsing logic isn't written yet. Triggering: Phase 2 starts.
- **Flat scoring across threads.** A project with 10 active threads and a project with 1 active thread score the same, as long as the most recent handoff is fresh in both. Per-thread scoring (orphaned threads, stale threads) is deferred to a later phase. Triggering: real usage reveals this matters; not before.
- **No integration with stAIpler's existing inject flow.** The `<!-- staipler:status -->` block injection in `optimizer/inject.ts` doesn't know about continuity yet. Phase 2 work.

**Suspected (we worry but didn't verify):**
- **Non-Unix paths.** `HANDOFF_FILE_REGEX` handles both `/` and `\\` but I only ran tests on macOS. Worth a Windows test before Phase 2 ships publicly.
- **Skip-dirs collision.** If a project has `docs/handoffs/` nested inside a skipped directory (e.g. inside `tests/`), the scanner won't find it. Current skip list doesn't include `docs`, so this should be fine, but the scanner's `walkFiles` has a separate skip list from `walkForKnowledge` and they could drift.

## 14. Open questions awaiting the user

- **Phase 2 status block format.** I proposed a table with columns (thread, status, age, summary) plus explicit agent instructions. Size budget: show up to 10 threads inline, defer rest to INDEX.md link. Not confirmed. This is the single biggest open design question before Phase 2 starts.
- **Where to commit.** The firedock tree has a dirty state from a prior session (the main-agent assistant work, unrelated to this session). stAIpler has net-new changes from this session. I'd recommend committing stAIpler first as a clean "feat(core): add continuity layer for session handoff tracking" commit, and leaving the firedock changes for the user to review separately. Not confirmed.

## 15. Intentionally not done

- **Phase 2 status injection.** Scoped, not implemented. Explicitly deferred to let the user review Phase 1 first and confirm the Phase 2 shape.
- **Frontmatter parsing in scanner.** Only needed when Phase 2 starts. Keeping it out of Phase 1 kept the session scope tight.
- **`staipler init` / CLI surface updates.** The CLI commands don't mention continuity in their help text. Intentional: no user-facing surface until Phase 2 lands. Otherwise the CLI would advertise a layer the user can't actually see in status blocks.
- **Web dashboard changes.** `packages/web/` untouched. If the dashboard renders layer coverage generically, continuity will show up automatically; if it special-cases some layers, continuity needs explicit wiring in Phase 2 or later.
- **Updating stAIpler's own CLAUDE.md or README to mention the 13th layer.** Documentation lag is deliberate — no point telling users about a layer they can't see yet. Update in Phase 2.

## 16. Next steps (ordered, with rationale)

1. **Scope and confirm Phase 2 status block shape.** Before writing code. The design choices (how many threads to list, how much summary to include, explicit agent instructions format) are user-facing and worth one round of review. This is the step that takes continuity from "stAIpler knows about it internally" to "user sees and acts on it."
2. **Implement Phase 2: frontmatter parsing + status block injection.** Two sub-steps: (a) extend scanner to parse handoff YAML frontmatter into a new `HandoffMetadata` interface attached to `ScannedFile`; (b) extend `optimizer/inject.ts` to emit a continuity section inside the `<!-- staipler:status -->` block. Tests required: frontmatter parse (with/without, malformed, partial), status block rendering (missing, fresh, stale, multiple threads, >10 threads truncation).
3. **Dogfood Phase 2 against firedock.** Run `staipler init` or `staipler inject` against the firedock repo, confirm the status block appears correctly with the current single-handoff state. Adjust formatting based on what reads clearly in-context.
4. **Phase 3: quality scoring.** Only after 1–3 are shipped and there are ≥5 real handoffs across ≥2 threads to calibrate against. Parse section structure, detect filler, score completeness.
5. **Ecosystem rollout.** Once stAIpler is producing good status blocks, run `staipler inject` against NoteDrawer-Web, NoteDrawer-Mobile, and stAIpler itself. Each will get its own continuity tracking. This is where the compounding value kicks in — 20+ projects, each with continuity nudges, vastly more likely to sustain handoff discipline across sessions.

## 17. File map

**New (this session):**
- `packages/core/tests/continuity.test.ts` — 11-test suite covering scanner detection, INDEX.md exclusion, `parseHandoffDate`, and every scoring case

**Modified (this session):**
- `packages/core/src/types.ts` — `RuntimeLayerType` now `'memory' | 'continuity'`
- `packages/core/src/schema.ts` — continuity added to `RUNTIME_LAYER_TYPES`, `LAYER_TYPES`, `DEFAULT_MERGE_STRATEGIES` (`last-wins`), `CANONICAL_SECTION_ORDER`, and the Zod `LayerTypeSchema` enum
- `packages/core/src/optimizer/scanner.ts` — `HANDOFF_FILE_REGEX`, `isHandoffPath`, exported `parseHandoffDate`; `inferKind` signature now takes `relativePath`; `isInstructionFile` accepts handoff paths
- `packages/core/src/optimizer/analyzer.ts` — new `scoreContinuityLayer` function, continuity entries in `LAYER_IMPORTANCE` (`recommended`) and `LAYER_DESCRIPTIONS`, `scoreLayer` special-cases continuity
- `packages/core/src/pipeline/organize.ts` — continuity entries in `LAYER_IMPORTANCE` (`recommended`) and readiness weights (2 = recommended weight)
- `packages/core/src/pipeline/extract.ts` — continuity entries in `KIND_SIGNALS` (regexes for handoff-shaped content) and `LAYER_DESCRIPTIONS`
- `packages/core/src/optimizer/agent.ts` — continuity entry in `getLayerGuidance` (noting it's user-authored, not optimizer-generated)
- `packages/core/tests/schema.test.ts` — assertions updated for the 13th layer; new test for `RUNTIME_LAYER_TYPES` contents

## 18. Related docs

- [firedock/docs/handoffs/2026-04-22-handoff-skill-design.md](../../../firedock/docs/handoffs/2026-04-22-handoff-skill-design.md) — the prior handoff (in a different repo) that spawned this work. Thread `handoff-skill` there, thread `staipler-continuity-layer` here. Not a `continues:` link because they're different threads in different repos, but load-bearing context for why this session existed.
- [~/.claude/skills/handoff/SKILL.md](~/.claude/skills/handoff/SKILL.md) — the `/handoff` skill itself. The storage model this layer detects and scores is defined there.
- [stAIpler/README.md](../../README.md) — the 12-layer overview. Continuity will be the 13th layer listed once documentation is updated in Phase 2.
- [stAIpler/CLAUDE.md](../../CLAUDE.md) — the current stAIpler CLAUDE.md has a `<!-- staipler:status -->` block already; Phase 2 will extend it to include the continuity section.
