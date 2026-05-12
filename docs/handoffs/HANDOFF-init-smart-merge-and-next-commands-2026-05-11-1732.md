---
title: staipler init — smart-merge config + Next-commands guidance
date: 2026-05-11 17:32
thread: staipler-cli-ux
status: shipped (uncommitted in working tree as of writing; see "Files and References")
author: claude (opus-4-7 1m)
---

# Session Handoff — `staipler init` UX hardening

## 1. Session Summary

Two concrete UX changes to `staipler init`:

1. **Added a "Next commands" guidance block** to the post-init terminal output. The user noticed that after `staipler init` succeeds, the CLI prints the score and report URL but gives the user no signal about what to run next. The new block lists 7 high-value next commands with descriptions, formatted to match `staipler --help`, and a headline that adapts to the score band (`<60` / `60-79` / `≥80`).

2. **Fixed a silent-clobber footgun on re-running `staipler init`.** Previously, re-running `init` wrote a fresh 3-key `.staipler.json` (`minScore`, `requiredLayers`, `inject`) from `DEFAULT_CONFIG` — silently dropping any user customizations to `ignore`, `report`, `watchDebounce`, `continuity`, and even a previously-set `minScore`. Changed to a **smart-merge default** that preserves all existing fields and only overrides what was explicitly passed via CLI flags. Added a `--reset` flag for the explicit clobber path, guarded by a TTY confirmation prompt (skippable with `--yes`).

### Major decisions

- **Smart-merge over a confirmation prompt.** The user proposed a prompt-on-existing-config. Pushed back: a prompt breaks non-interactive callers (CI scripts, agents calling the CLI), tells the user nothing about *what* would change, and the dominant "second-run" intent is actually a refresh, not a re-setup. Smart-merge serves that intent directly. Prompt is reserved only for the genuinely destructive `--reset` path. The user agreed.
- **Print what was preserved, not a generic acknowledgment.** When smart-merging, the CLI prints `Reinitialized stAIpler — kept existing .staipler.json (preserved: minScore, requiredLayers, ignore, report, inject, watchDebounce, continuity)`. This satisfies the project's "total visibility" requirement (see [feedback_visibility](../../memory-equivalent — CLAUDE.md "Core Requirement: Visibility")) without requiring user input.
- **Curate next-commands rather than mirroring `--help` in full.** Init shows 7 high-value next steps; the full 15-command list is one `staipler --help` away. Skipped: `init` (just ran), `build`/`compile` (advanced), `validate` (niche), `eval` (use `eval-project` instead — more user-friendly), `login`/`pull`/`benchmark` (niche/internal-feeling).

### Architectural direction that emerged

- `staipler init`'s mental model is now clarified as **setup + first scan**, with smart-merge ensuring idempotent re-runs are safe. The "I want a fresh score" path stays out of `init` — that's what `optimize` / `dashboard` / `watch` are for, and the new guidance block surfaces them.
- The `loadConfig` → `writeFileSync` pattern in `init.ts` no longer round-trips through `DEFAULT_CONFIG`. It now reads raw JSON for merge purposes (so default values don't get persisted into the user's file, keeping the config terse).

## 2. Current State

### Implemented

- [packages/cli/src/commands/init.ts:58](../../packages/cli/src/commands/init.ts#L58) — `--reset` option added with description "Reset .staipler.json to defaults — discards any customizations"
- [packages/cli/src/commands/init.ts:27-36](../../packages/cli/src/commands/init.ts#L27-L36) — local `confirm()` helper using `readline.createInterface`, matching the pattern in [pull.ts:42](../../packages/cli/src/commands/pull.ts#L42)
- [packages/cli/src/commands/init.ts:79-88](../../packages/cli/src/commands/init.ts#L79-L88) — TTY confirmation guard for `--reset` (skipped when `--yes` or non-TTY)
- [packages/cli/src/commands/init.ts:98-108](../../packages/cli/src/commands/init.ts#L98-L108) — inject-target detection now prefers existing `loadedConfig.inject` over re-detection on smart-merge runs (so the user's chosen agent file stays sticky)
- [packages/cli/src/commands/init.ts:110-142](../../packages/cli/src/commands/init.ts#L110-L142) — smart-merge config-write logic: reads raw JSON, spreads it, applies explicit-flag overrides, falls back to clobber path only when `--reset` is set
- [packages/cli/src/commands/init.ts:211-232](../../packages/cli/src/commands/init.ts#L211-L232) — "Next commands" output block with adaptive headline and `staipler --help` footer

### Touched files

- [packages/cli/src/commands/init.ts](../../packages/cli/src/commands/init.ts) — the only file changed in this session.

### Working / verified by manual smoke test

Tested in `/tmp/staipler-init-test`:

| Scenario | Result |
|---|---|
| Fresh init (no `.staipler.json`) | Writes clean 3-key config — unchanged behavior |
| Re-run with hand-edited 7-field config | All 7 fields preserved; prints `(preserved: minScore, requiredLayers, ignore, report, inject, watchDebounce, continuity)` |
| Re-run with `--min-score 95` | Only `minScore` updated; other 6 fields preserved |
| `--reset --yes` | Clobbered back to defaults |
| `--reset` in TTY without `--yes` | Logic path verified by reading; not exercised interactively |

`pnpm --filter @staipler/cli build` succeeds cleanly.

### Incomplete / uncertain

- **No automated tests for `init`.** The CLI package has no `test` script (`packages/cli/package.json` only declares `build`). All verification was via manual `node dist/index.js init` runs in `/tmp`. Adding a vitest suite for `init` would catch regressions on the smart-merge logic.
- **`--reset` TTY prompt not exercised interactively.** The branch is straightforward and matches the verified pattern in `pull.ts`, but a human should run `staipler init --reset` in a real terminal once to confirm prompt UX.
- **`--reset --no-yes` non-TTY behavior is currently "clobber without asking."** That's defensible (non-TTY ⇒ scripted ⇒ user knows what they want) but worth a sanity check if anyone disagrees.

## 3. Important Context Learned

### Project conventions / constraints

- **CLAUDE.md "Total Visibility" rule applies even to CLI output.** Every state change should be visible to the user. The smart-merge path *must* print what was preserved — not just "updated existing config." A silent merge would violate this even though it's safer than the previous silent clobber.
- **Robert wants pushback when it matters** ([feedback_pushback](file:///Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_pushback.md)). Earlier in this session he proposed "prompt before proceeding," and the right move was to argue for smart-merge instead and explain why. He agreed. Don't auto-agree with framings — interrogate them.
- **Optimizer Role Constraint** ([feedback_optimizer_role](file:///Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_optimizer_role.md)) — relevant for next-commands ordering: `optimize` is positioned first specifically because it *gap-fills* the missing layers detected by `init`'s scan. Don't reorder without considering this.

### Code-level lessons

- **`loadConfig` already merges with defaults** ([packages/core/src/config.ts:54-76](../../packages/core/src/config.ts#L54-L76)). If you spread `loadedConfig` directly into the new config, the user's `.staipler.json` will get bloated with default values they never set. To avoid this, **re-read raw JSON via `readFileSync` + `JSON.parse`** for merge purposes, not `loadedConfig`. This is what the smart-merge path does at [init.ts:117-122](../../packages/cli/src/commands/init.ts#L117-L122).
- **Commander's "was this flag passed?" semantics**: with no default on `.option('--min-score <n>', ..., parseInt)`, `opts.minScore` is `undefined` when not passed. That's the cleanest "explicit override" signal. Don't add a default in the `.option()` call — it would make smart-merge impossible to distinguish from "user passed default."
- **`injectStatus` is idempotent** ([packages/core/src/optimizer/inject.ts:160-173](../../packages/core/src/optimizer/inject.ts#L160-L173)) via `<!-- staipler:status -->` marker tags. Safe to call on every `init` run. No risk of duplicating blocks in CLAUDE.md.
- **The CLI uses raw ANSI escape codes**, not chalk or kleur, for color (`\x1b[38;5;135m` etc., defined inline in each command). Match this style if extending init's output. Existing palette: `purple` for headers, `bold` for emphasis, `dim` for secondary, `gc` (green/yellow/red) for score grade.

### Rules of thumb

- **Don't add default values when writing user config files.** The user's `.staipler.json` should contain *only* what they care about overriding. `loadConfig` re-applies defaults at read time.
- **Prompts are a last resort for destructive paths only.** Never use them as a substitute for "do the right thing by default."
- **When changing CLI output, screenshot the rendered terminal** (or capture with `sed 's/\x1b\[[0-9;]*m//g'` to strip color) and verify spacing/alignment. The `padEnd` width math for the next-commands block aligns to the longest command name.

## 4. Next Recommended Focus

In priority order:

1. **Commit the working-tree changes if they're not yet in a proper commit of their own.** `git status` returned clean at handoff time, which is suspicious — the diff appears bundled into the most recent commit (`905b1d1 feat(vscode-extension): ...`) whose message does not describe this work. Verify with `git show 905b1d1 -- packages/cli/src/commands/init.ts` and decide whether to split it out into a dedicated commit with an accurate message like `feat(cli): smart-merge init config + next-commands guidance`. Otherwise the changelog will obscure this work.

2. **Add a vitest suite for `init.ts`.** The CLI package currently has no test script. At minimum, test:
   - Fresh init writes the clean 3-key config.
   - Re-run with existing custom fields preserves all of them.
   - Re-run with `--min-score N` overrides only that field.
   - `--reset --yes` clobbers.
   - `--inject foo` sets a previously-null `inject` and overrides a non-null one.
   Wire `pnpm test` for the CLI package (add `"test": "vitest run"` to `packages/cli/package.json` and create `packages/cli/src/commands/__tests__/init.test.ts`). Existing test patterns live in `packages/core/src/__tests__/`.

3. **Interactively exercise `staipler init --reset`** in a real terminal to confirm prompt UX (formatting, default-no behavior on Enter, abort message). Quick smoke test, not blocking.

4. **Audit other CLI commands for similar silent-clobber bugs.** `inject` and `optimize` both write files; check whether they preserve user customizations or reset on every run. (Quick `grep -rn "writeFileSync" packages/cli/src/commands` and trace each.)

5. **Consider extracting a shared `confirm()` helper.** It now exists in both `pull.ts` and `init.ts` (identical). Move to `packages/cli/src/utils/prompt.ts` and import in both places. Low priority — DRY can wait until the third caller.

## 5. Known Issues / Risks

- **Commit hygiene:** the diff from this session appears bundled into a commit whose message is about the VS Code extension (`905b1d1`). The init UX changes are not surfaced in the changelog. See item 1 in Next Recommended Focus.
- **No test coverage on init.** Smart-merge logic is the kind of code that breaks subtly (e.g., someone adds a new field to `StaiplerConfig`, forgets it's no longer in the explicit-override allow-list, and the field gets silently preserved but defaults out at read time). The lack of tests means this can regress invisibly.
- **`--reset` confirmation only fires when `process.stdin.isTTY` is truthy.** In environments where stdin is piped or redirected, `--reset` acts as `--reset --yes`. Defensible (caller knows what they're doing) but worth a CLAUDE.md or `--help` note if a user gets surprised.
- **`preservedKeys` is declared but only the count branch (`preservedKeys.length > 0`) and the join are used.** No leak, but a careful reviewer might flag it as over-allocated. Trivial.
- **`opts.inject` cannot currently be set back to `null` from the CLI.** Once a user has set `inject` in their config, there's no flag to clear it via `init` (passing `--inject ''` would set it to empty string). Workaround is `--reset`. Probably fine — edge case.
- **The `headline` strings in next-commands** ("Your score is low…", "Solid start…", "Strong baseline…") are not internationalized. The CLI doesn't have an i18n story; just noting in case one ever appears.

## 6. Testing / Verification

### Commands run this session

```bash
# Build verification (succeeded)
pnpm --filter @staipler/cli build

# Manual smoke tests in /tmp/staipler-init-test
node /Users/robertflanagan/development/Firedock/stAIpler/packages/cli/dist/index.js init --no-open --no-share
# → wrote clean 3-key config

# (After writing a 7-field customized .staipler.json by hand)
node .../dist/index.js init --no-open --no-share
# → "Reinitialized stAIpler — kept existing .staipler.json (preserved: minScore, requiredLayers, ignore, report, inject, watchDebounce, continuity)"
# → all 7 fields intact in .staipler.json

node .../dist/index.js init --no-open --no-share --min-score 95
# → minScore became 95; other 6 fields intact

node .../dist/index.js init --no-open --no-share --reset --yes
# → .staipler.json reset to defaults
```

### Recommended commands before next changes

```bash
# Confirm build still passes
pnpm --filter @staipler/cli build

# Repeat the four smoke-test scenarios above in /tmp to confirm no regression

# Inspect commit history to clarify what is/isn't committed
git log --oneline -5 -- packages/cli/src/commands/init.ts
git show HEAD:packages/cli/src/commands/init.ts | grep -n "Reinitialized\|--reset\|Smart-merge"

# When tests exist, run:
# pnpm --filter @staipler/cli test
# pnpm test  # full monorepo
```

### Current test status

- **CLI package:** no test script declared. `pnpm --filter @staipler/cli test` returns silently.
- **Core package:** unchanged in this session. Last known status per [HANDOFF 2026-04-22 Phase 2](2026-04-22-staipler-continuity-status-injection.md) was 260/260 green.
- **No tests were run for this work.** Verification was manual smoke-testing only.

## 7. Files and References

### Primary file changed

- [packages/cli/src/commands/init.ts](../../packages/cli/src/commands/init.ts) — the only file modified. All changes from this session live here.
  - Lines 1-5: added `readFileSync`, `createInterface` imports
  - Lines 15: removed unused `StaiplerConfig` type import (was only referenced in the old clobber path)
  - Lines 27-36: `confirm()` helper
  - Line 58: `--reset` option
  - Lines 79-88: TTY confirmation for `--reset`
  - Lines 98-108: inject-target falls back to existing config value on smart-merge runs
  - Lines 110-142: smart-merge vs reset-clobber config write
  - Lines 211-232: Next-commands output block

### Reference files (read but not modified)

- [packages/cli/src/commands/pull.ts:42-50](../../packages/cli/src/commands/pull.ts#L42-L50) — pattern for `confirm()` helper. Identical implementation copied into init.ts; consider extracting to shared utility (see Next Focus item 5).
- [packages/core/src/config.ts:15-46](../../packages/core/src/config.ts#L15-L46) — `StaiplerConfig` interface and `DEFAULT_CONFIG`. The fields preserved by smart-merge: `minScore`, `requiredLayers`, `ignore`, `report`, `inject`, `watchDebounce`, `continuity`.
- [packages/core/src/config.ts:54-76](../../packages/core/src/config.ts#L54-L76) — `loadConfig` — important to understand that it merges raw JSON with defaults, which is why init.ts re-reads raw JSON instead of writing `loadedConfig` back to disk.
- [packages/core/src/optimizer/inject.ts:140-177](../../packages/core/src/optimizer/inject.ts#L140-L177) — `injectStatus` idempotency via marker tags. Relevant to "is re-running init safe?" analysis.
- [packages/cli/src/index.ts](../../packages/cli/src/index.ts) — full command registry. Reference when curating which commands appear in the post-init guidance block.

### Project context

- [CLAUDE.md](../../CLAUDE.md) — project instructions. Especially the "Core Requirement: Visibility" section which motivates printing `(preserved: ...)` instead of a generic acknowledgment.
- [docs/handoffs/INDEX.md](INDEX.md) — handoff index. **Not updated by this handoff** — the user's spec asked for the standalone file only. If the project wants this surfaced in the index, add a row manually or via `/handoff`.
- Existing handoffs under [docs/handoffs/](.) use the naming convention `YYYY-MM-DD-<thread>.md`; this file follows the user's explicit `HANDOFF-<title>-<date-time>.md` spec instead. Worth deciding which convention sticks.

### Memory references (for the next agent)

The user's auto-memory at `/Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/` is loaded automatically. Most relevant entries for continuing this work:

- `feedback_pushback.md` — argue when there's a better answer; don't auto-agree
- `feedback_visibility.md` — every state change must be visible to the user
- `feedback_optimizer_role.md` — informs the ordering in the next-commands block
- `project_business_model.md` — `init`/`watch`/`dashboard` are free-tier; `optimize`/`eval` involve paid AI calls. Relevant if reordering the next-commands list.
