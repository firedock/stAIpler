---
thread: vscode-extension
date: 2026-05-11
status: in-progress
---

# Handoff — VSCode Extension MVP (read-only pipeline visibility)

## 1. Session Summary

Built and shipped an MVP VSCode extension that gives Robert a visual, read-only window into stAIpler's pipeline state. The extension lives at `packages/vscode-extension/` and renders an Activity Bar sidebar plus a status bar item driven by the same local `scan() → analyze()` flow that `staipler watch` uses.

**How the scope got framed (matters for next agent):**

Robert opened with: "I want a stAIpler icon I can click inside a Claude Code session that grabs a snippet and stores it in a directory format for future retrieval." Two pushbacks reshaped the scope:

1. **You can't decorate Claude Code's chat UI from a third-party VSCode extension.** Claude Code's transcript isn't a VSCode webview surface. The viable substitutes are slash commands inside Claude Code, hooks, and a VSCode-native sidebar.
2. **Dumping snippets to a directory would bypass the evidence pipeline.** Per `project_evidence_pipeline` memory and CLAUDE.md, connectors must produce `LayerCandidate[]` with provenance — not raw imports.

Robert then said verbatim: *"I don't want to drift or break our data flow contract. I just want to see visually what staipler is doing and have piece of mind that content like this very conversation is being captured and organized."*

I gave him an honest counter: *the conversation is NOT being captured today* — memory is one of the 6 missing layers (per CLAUDE.md), and there's no Claude Code session connector in `packages/core/src/pipeline/`. A visibility surface built today truthfully shows that gap — which is correct per the visibility requirement.

**Plan we settled on:**
- **Step 1 (this session):** read-only sidebar reflecting current pipeline state. Zero contract risk. **DONE.**
- **Step 2 (next):** Claude Code session connector as a proper evidence pipeline (produces `SourceDocument` → `LayerCandidate[]` with provenance). Once built, the sidebar from step 1 lights up automatically.

**Key decisions:**
- Extension consumes `@staipler/core`'s `scan()` and `analyze()` (same path as `staipler watch`). No new write path. No Supabase queries.
- The 4-stage Evidence Pipeline section in the tree is honest: Ingestion/Extraction/Organization counts derive from the local scan; Compilation explicitly says "Run `staipler ci` or `staipler inject`" because no compiled bundle exists locally.
- Bundle `@staipler/core` into the extension's CJS output (tsup `noExternal`) — core is ESM-only and VSCode extensions still run CJS.

## 2. Current State

### New package: `packages/vscode-extension/`

| File | Purpose |
|---|---|
| `package.json` | Manifest. Activity Bar container `staipler`, view `staipler.pipeline`, commands `staipler.refresh` + `staipler.openFile`. Main: `dist/extension.js`. Depends on `@staipler/core` workspace pkg, `@types/vscode`. |
| `tsconfig.json` | Extends repo base. ESNext module, bundler resolution. |
| `tsup.config.ts` | **Critical:** `external: ['vscode']`, `noExternal: ['@staipler/core']`. Inlines core (ESM) into a CJS bundle. Without this the extension fails to activate with "No exports main defined" because core only exports `import`, not `require`. |
| `.vscodeignore` | Excludes src/maps from `.vsix` packaging. |
| `src/extension.ts` | Entry. Registers tree provider, status bar item, refresh command, debounced (400ms) file watcher on `**/{*.md,*.mdc,.staipler.json,.cursorrules,.windsurfrules,.clinerules}`. |
| `src/pipeline-state.ts` | Holds the cached snapshot. `PipelineStatus` union: `idle` / `no-workspace` / `ready` / `error`. Fires `onDidChange` event on refresh. |
| `src/tree-provider.ts` | `StaiplerTreeProvider` — `TreeDataProvider<StaiplerNode>`. Renders 4 root sections under the view: Empowerment Score header, Evidence Pipeline (4 stages), Layers (13 types with importance markers), Knowledge Base. Layer leaves expand to show source files; clicking opens them. |

### Repo-level files added

| File | Purpose |
|---|---|
| `.vscode/launch.json` | F5 config. Passes `${workspaceFolder}` so the dev host opens with the current repo loaded. preLaunchTask runs the build. |
| `.vscode/tasks.json` | Build task. Uses `/bin/zsh -ic` shell so pnpm (nvm-installed) is on PATH when run from the VSCode GUI. **This was a fix** — exit 127 the first time because the default task shell didn't load nvm. |

### What's working (verified visually with a screenshot)

- Extension activates on `onStartupFinished`.
- Activity Bar shows a `$(layers)` icon → opens the stAIpler sidebar.
- Tree renders all 4 sections with correct counts when a workspace is open.
- Status bar at bottom-left shows `$(layers) stAIpler 60/100 (D)` and updates live.
- File watcher triggers refresh on .md edits.
- `staipler.refresh` toolbar button works.
- Clicking a file leaf opens it in an editor.

### What's incomplete / uncertain

- **No automated tests** for the extension. Manual verification only.
- **No publisher** — `publisher: "firedock"` is a placeholder; `.vsix` packaging not configured beyond what's in `package.json`.
- **No custom icon** — uses ThemeIcons throughout.
- **No webview detail panel** for click-through provenance (originally pitched as step 3 in the conversation).
- **No Claude Code session reader / connector** — the entire "capture this conversation" goal is still NOT implemented. The sidebar shows zero session data today because zero session data exists.
- **Multi-root workspaces** — only `folders[0]` is scanned. Untested.
- **Cloud reads** — Supabase tables (`source_documents`, `layer_candidates`, `compiled_bundles`) are not queried. Extension is purely local-scan.

## 3. Important Context Learned

### Strict rules from Robert (validated this session)

- **Total Visibility Requirement** (also a saved memory): every process and data flow must be visible to the user in real time. Honest "zero" / "missing" is preferable to invisible state.
- **Do not drift from the evidence pipeline contract.** Connectors must produce `LayerCandidate[]` with provenance — not raw file dumps. This rules out the original "snippet directory" idea and shapes the next step.
- **Push back when it matters.** Robert explicitly endorsed honest pushback this session (twice — once on the Claude-Code-icon technical mismatch, once on the false-peace-of-mind capture claim).
- **Optimizer is gap-filler, not primary author.** Doesn't directly apply to the extension but constrains step 2 (session connector should *evidence* memory candidates, not synthesize them).

### Technical facts that bit us

- **`@staipler/core` is ESM-only.** `package.json` declares `"type": "module"` and `exports` only has `import`, no `require`. Any consumer that runs as CJS (VSCode extension) must bundle core. Resolved with tsup `noExternal`.
- **VSCode tasks launched from the GUI don't inherit user PATH.** On macOS with nvm, pnpm resolves only inside an interactive shell. Solution: `options.shell = { executable: '/bin/zsh', args: ['-ic'] }` in tasks.json.
- **Empty dev-host workspace = silent forever-scan.** If `vscode.workspace.workspaceFolders` is empty, the extension MUST set an explicit state — the original "silently return" left the tree spinning "Scanning…" forever. Fixed by adding the `no-workspace` status kind.
- **`LAYER_ORDER` has 13 entries, not 12.** CLAUDE.md says "12 instruction layer types" but the actual code includes `continuity` as the 13th. The extension imports layers from the analyzer output directly so it stays in sync.
- **The watch CLI is the reference implementation.** `packages/cli/src/commands/watch.ts` is what the extension visualizes. Layer hints / status icons / sort order are taken from there.

### What lives where (data model)

- **Local file scan** → drives the empowerment score, layer presence, knowledge base list. Used by `staipler watch`, `staipler ci`, `staipler inject`, and now the VSCode extension.
- **Local KPI history** at `.staipler/kpi.json` — snapshots over time. Not yet surfaced in the extension.
- **Local config** at `.staipler.json`.
- **Supabase tables** (`source_documents`, `layer_candidates`, `compiled_bundles`) — these are the cloud/evidence-pipeline persistence. Used by `packages/web`. Not queried by CLI or extension.
- **The full 4-stage pipeline** (`packages/core/src/pipeline/`) is exported but currently engaged mainly by web/connector flows. The extension renders its STAGE NAMES but the *counts* come from the simpler local scan. This is intentional and called out in the UI ("Run `staipler ci` to compile").

## 4. Next Recommended Focus

In priority order:

1. **Claude Code session connector (the actual unlock).** This is what makes the visibility surface meaningful instead of merely truthful.
   - Read transcripts from `~/.claude/projects/<project-id>/`. The path is already used by stAIpler's auto-memory system (see `MEMORY.md` location: `/Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/`).
   - Per `project_evidence_pipeline` memory, the connector must produce `SourceDocument` with provenance (session id, timestamp, turn range), then `LayerCandidate[]` via `extractLayerCandidates`.
   - The memory layer is currently MISSING (per CLAUDE.md "Missing layers"). This connector is what populates it. Once it does, the existing extension sidebar automatically lights up.
   - **Transcript format risk:** Claude Code's session file format is not a public contract and can break on upgrades. Pin the parser tightly and version-tag it.

2. **Webview detail panel in the extension.** Click a layer → see resolved candidates, conflicts, provenance trail. This is the glass-box architecture from `project_knowledge_v1` made visible. Use `vscode.window.createWebviewPanel`.

3. **Slim the bundle.** Current `dist/extension.js` is 577KB because core re-exports eval, optimizer, memory, pipeline. The extension only needs scanner+analyzer. Options: add a sub-path export from core (`@staipler/core/optimizer`), or write a thin facade.

4. **Add tests.** At minimum a smoke test of `StaiplerTreeProvider` against a fixture `AnalysisResult` (returns expected node tree shape). Vitest is the suite convention.

5. **Polish:**
   - Custom SVG icon for the Activity Bar.
   - Click-through on the score node to a small KPI history view (use `.staipler/kpi.json`, exposed as `loadKpiHistory` from core).
   - Tighten the file watcher glob; verify it respects `files.watcherExclude` on large repos.

## 5. Known Issues / Risks

| Issue | Detail |
|---|---|
| **Bundle size 577KB** | Includes all of `@staipler/core`. Workable for v0.1 but slow to load on cold start. See "Slim the bundle" in §4. |
| **Multi-root workspaces** | Only `folders[0]` is read. Acceptable for now; document or fix when it bites. |
| **No-workspace edge cases** | The `no-workspace` status fires only at startup and on workspace folder change. Untested: removing then re-adding folders rapidly. |
| **File watcher scope** | `**/*.md` is broad. VSCode's `files.watcherExclude` should cover `node_modules` but not verified on a large repo. |
| **No error telemetry** | Scan failures show in the sidebar but no devtools output / log. Hard to debug remotely. Consider `vscode.window.createOutputChannel('stAIpler')`. |
| **Handoff naming convention drift** | Existing files in `docs/handoffs/` use `<date>-<thread>-<title>.md` (no `HANDOFF-` prefix). This file uses `HANDOFF-<title>-<date-time>.md` per Robert's explicit instructions. INDEX.md was **NOT** updated — flagging for next agent or follow-up. |
| **CLAUDE.md says "12 layers" but code has 13** | Documentation drift. Not fixed in this session. |
| **Test count drift** | CLAUDE.md says 121 tests across 11 files. Prior handoff (2026-04-22) said 260 green. Test suite was not run this session — actual count unknown. |

## 6. Testing / Verification

### Commands run during the session

```
pnpm install                                          # workspace deps
pnpm --filter @staipler/vscode-extension build        # ~120ms, 577KB CJS output
npx tsc -p packages/vscode-extension/tsconfig.json --noEmit   # passed
```

Manual verification: F5 from VSCode → dev-host window opened with the stAIpler repo loaded → sidebar populated with all 4 sections → status bar showed score → confirmed visually via Robert's screenshot.

### Test suite NOT run this session

Neither `pnpm test` nor any package-specific tests were executed. Status of the existing 121/260 (depending on which doc you trust) tests is unknown for this session.

### Recommended commands before further changes

```
pnpm install
pnpm --filter @staipler/vscode-extension build        # verify extension still builds
pnpm test                                             # baseline the suite
```

Then F5 to confirm the extension still loads in a dev host with this workspace open.

## 7. Files and References

### Files created or modified this session

- `packages/vscode-extension/package.json` — extension manifest. Activity bar contribution, view `staipler.pipeline`, `staipler.refresh` + `staipler.openFile` commands.
- `packages/vscode-extension/tsconfig.json` — extends repo base.
- `packages/vscode-extension/.vscodeignore`
- `packages/vscode-extension/tsup.config.ts` — **central to making this work.** `noExternal: ['@staipler/core']` is non-negotiable.
- `packages/vscode-extension/src/extension.ts` — entry point. `activate()` / `deactivate()`. Wires tree provider, status bar, file watcher, commands.
- `packages/vscode-extension/src/pipeline-state.ts` — state machine. `PipelineStatus` union.
- `packages/vscode-extension/src/tree-provider.ts` — UI tree. `LAYER_HINTS` mirrors `watch.ts`.
- `.vscode/launch.json` — F5 config.
- `.vscode/tasks.json` — preLaunchTask with `/bin/zsh -ic` shell.

### Files to read for context

- `packages/cli/src/commands/watch.ts` — terminal equivalent of the extension. Authoritative reference for layer order, hints, importance markers, status semantics.
- `packages/core/src/optimizer/analyzer.ts` — `AnalysisResult` / `LayerAnalysis` shapes consumed by the tree provider.
- `packages/core/src/optimizer/scanner.ts` — `ScanResult` shape; what counts as an instruction file vs knowledge-base file.
- `packages/core/src/pipeline/` — the 4-stage evidence pipeline. Step 2 (session connector) plugs in here. Files: `ingest.ts`, `extract.ts`, `organize.ts`, `compile.ts`.
- `packages/core/src/index.ts` — public API. Tree of all exports.
- `packages/web/supabase/schema.sql` (lines 151–227) — cloud table shapes. Useful when step 2 needs to decide where session-derived `SourceDocument` records live.
- `CLAUDE.md` — visibility requirement, empowerment score truth (60/100 D), missing-layer list.
- `docs/handoffs/INDEX.md` — handoff registry. **Was not updated this session** to include this file.
- `/Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/MEMORY.md` — auto-memory index. The relevant entries for this work: `feedback_visibility`, `project_evidence_pipeline`, `feedback_optimizer_role`, `project_knowledge_v1`, `project_memory_platform`.

### Out of scope for this handoff but related

- The Claude Code transcript file location pattern: `~/.claude/projects/<encoded-cwd>/`. Used by stAIpler's auto-memory today. This is where the future session connector will read from.
- The `staipler watch` `o` keybinding triggers an optimize flow. Could inspire an `optimize` command in the extension later.
