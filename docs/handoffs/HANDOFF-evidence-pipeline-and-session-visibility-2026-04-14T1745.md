---
title: Evidence Pipeline + Heuristic Handoff System + Session Visibility
date: 2026-04-14
thread: evidence-pipeline-and-visibility
status: implemented-evolving
---

# Handoff: Evidence Pipeline, Heuristic Handoffs, and Session Visibility

## 1. Session Summary

### What we worked on

This session moved from product strategy ("which connectors do we ship?") to architectural diagnosis ("connectors aren't the bottleneck — extraction is") to building the foundation that makes the rest of stAIpler possible. Three things were built end-to-end:

1. **The 4-stage Evidence Pipeline** (Ingestion → Extraction → Organization → Compilation) — replaces the prior pattern where each connector route independently ran shallow regex classification and dumped raw text into `project_files`. Now connectors produce `SourceDocument[]`, the pipeline extracts `LayerCandidate[]` with snippet-level provenance, organizes them across documents with dedup and conflict detection, and compiles a typed `CompiledInstructionBundle`.
2. **The Heuristic Handoff System** — agent-to-agent operational wisdom with epistemic classification (`fact` / `inference` / `heuristic` / `unresolved-question`), confidence, provenance, decay (per-classification half-life), reinforcement-on-rediscovery, and similarity-based dedup. Handoffs are injected into chat system prompts **below source knowledge** with an explicit prompt instruction that source evidence takes precedence.
3. **Full Visibility Compliance** — closed all 17 violations from the prior visibility audit (`HANDOFF-visibility-audit-2026-05-11.md`). Every silent transformation now produces an artifact, every empty `catch {}` was addressed, optimizer reasoning is returned in API responses, a `decision_audit` table tracks every auto-decision, the Knowledge Journey shows the full extraction story, and a **Session Context Panel** in the chat exposes everything the agent is currently using.

### Major decisions

- **"Connectors are evidence pipelines, not importers."** No new connector ships unless it produces layer candidates with provenance and conflict-aware structured output. Codified in `CLAUDE.md`.
- **Trust hierarchy is explicit and visible**: Source knowledge (highest) > Operational wisdom (decaying) > AI-generated fills (lowest). Encoded in `CompiledInstructionBundle.sections[].status` (`source-grounded` | `ai-generated` | `mixed`) and in the chat system prompt's "Operational Wisdom" header.
- **The optimizer is a gap-filler, not the primary author.** `/api/optimize` now reads gaps from the latest `compiled_bundles` row and only generates for layers with no source-grounded content.
- **Total visibility is a hard product requirement.** Codified in `CLAUDE.md`: *"If there is a process running or data flowing, users need to see and know about it."* Stated framing: stAIpler is a window into the AI world for humans without a CS background.
- **Pipeline review pattern**: when the pipeline detects conflicts, low-confidence extractions, or ambiguous content (constraint-vs-policy), it surfaces `ReviewItem[]` for user resolution before finalizing compilation — modeled on Claude Code's plan-mode review.

### Architectural direction that emerged

The pipeline is the **core compounding asset**. Every future capability (new connectors, evals, deploy, widgets) plugs into the same `SourceDocument → LayerCandidate → ResolvedLayer → CompiledBundle` shape. The handoff system is **stAIpler eating its own cooking** — the same 4-stage pattern applied to agent-generated knowledge instead of user-provided documents. Future layer types (e.g., `continuity`, already added by a follow-on session) extend the same shape rather than introducing a parallel system.

## 2. Current State

### What is implemented

**Core pipeline** — `packages/core/src/pipeline/`:
- `types.ts` — `SourceDocument`, `LayerCandidate`, `ResolvedLayer`, `ConflictRecord`, `CompiledInstructionBundle`, `PipelineEvent`, `TransformationLog`, `PipelineResult` (now includes `needsReview`, `events`, `transformations`)
- `ingest.ts` — `normalizeToSourceDocument()` / `normalizeToSourceDocuments()` with SHA256 content hashing and dedup
- `extract.ts` — `extractFastPath()` (filename/filetype/heuristic) + `buildExtractionPrompt()` / `parseExtractionResponse()` for semantic deep-path. Centralized `FILENAME_LAYER_MAP`, `AI_TOOL_DEFAULTS`, `KIND_SIGNALS`. Note: a follow-on session added `continuity` to `KIND_SIGNALS` and `LAYER_DESCRIPTIONS`.
- `organize.ts` — `organizeCandidates()` returns `{ resolvedLayers, transformations }`. Dedup logs merges. Conflict detection now includes content snippets from both sides in the description. Auto-resolutions logged. Gap reasons recorded.
- `compile.ts` — `compileBundle()` follows canonical section order, marks each section with grounding status, computes SHA256 of full text.
- `review.ts` — `buildReviewItems()` surfaces conflicts, uncertain extractions (`confidence < 0.5`), and constraint-vs-policy clarifications. `applyReviewDecisions()` reorganizes candidates per user choices.
- `handoff.ts` — `createHandoffPacket()`, `reinforceHandoff()`, `applyDecay()`, `calculateDecay()`, `getActiveHandoffs()`, `formatHandoffsForPrompt()`, `findSimilarHandoff()`. Half-lives: fact 90d, inference 30d, heuristic 14d, unresolved-question never. Threshold 0.15.
- `index.ts` — orchestrator `runPipeline(docs, llm?, onProgress?)` ties stages together and emits progress messages.

**Schema additions** — `packages/web/supabase/schema.sql`:
- `source_documents` — normalized raw content with `content_hash`, `metadata` (provider, importedAt, etc.)
- `layer_candidates` — extracted spans with `confidence`, `rationale`, `extraction_method` (`filename` | `filetype` | `heuristic` | `semantic`), full `provenance` JSON
- `compiled_bundles` — cached system prompts with per-section provenance, conflicts, gaps
- `session_handoffs` — handoff packets with classification, initial/effective confidence, provenance JSON, reinforcement_count, last_reinforced_at, status (`active` | `decayed` | `superseded` | `resolved`)
- `decision_audit` — every auto-decision: `decision_type`, `actor` (`user` | `system`), `target_ids`, `chosen_option`, `alternatives`, `rationale`, `context`
- RLS policies on all new tables (user access via project_id)

**API routes** (new in this session unless noted):
- `/api/sources/github`, `/api/sources/upload`, `/api/sources/google-drive/sync` — all rewired to use `runPipeline()`. Each now returns `transformations: { deduplicatedCount, autoResolvedCount, gapReasons }`, `reviewItems`, `needsReview`, `populatedLayers`, `gaps`, plus existing readiness data.
- `/api/compile` — reads from `compiled_bundles` first; falls back to `project_files` for backward compat.
- `/api/optimize` — reads gaps from latest bundle, generates only for missing layers, returns full `reasoning[]` array per generated layer (prompt sent, context selected, source of context, success/failure, error details).
- `/api/pipeline/resolve` — accepts `ReviewDecision[]`, reorganizes candidates, recompiles bundle.
- `/api/handoffs` — GET (returns with decay applied, updates newly-decayed in DB), POST (creates or reinforces via similarity), PATCH (resolve / supersede).
- `/api/session-context` — aggregates source docs, layer candidates, latest bundle, active handoffs (decay applied), and project files for the right-side panel. Follow-on session added knowledge/logs queries.
- `/api/chat` — appends active handoffs (with decay) to the system prompt below source knowledge, with header instructing the model that source knowledge takes precedence. Attribution now includes `sourceType`, `status` (`used` | `rejected`), and `rejectionReason` for layers where the last-wins strategy discarded files.
- `/api/widget/chat` — now sends `citations[]` (layer + sourceType) as the first SSE chunk before streaming response content.

**UI components** (new unless noted):
- `knowledge-journey.tsx` — three-column flow (Your Sources / What We Found / Agent Expertise) with expandable per-layer candidate detail (no truncation when expanded)
- `pipeline-review.tsx` — conflict/uncertain-extraction/clarification review panel with radio-button decisions and a "Looks good, compile my agent" CTA. Error state visible.
- `handoffs-panel.tsx` — operational wisdom panel with classification icons, confidence bars including current decay %, days-until-fade computation, reinforcement count, expandable details, and a trust hierarchy legend
- `session-context-panel.tsx` — right-side chat panel with tabs (Overview / Sources / Layers / Wisdom / Prompt). **Modified by a follow-on session** to add Logs and Knowledge tabs, resize-by-drag, persisted width in localStorage, pop-out window, and a `standalone` prop for a dedicated route.
- `layer-grid.tsx` — modified to accept `bundleSections` (for authority badges) and `layerCandidates` (for "Found by X · Y% avg" line on each card)
- `project-dashboard.tsx` — added Knowledge Journey / Scan Report toggle, "Operational Wisdom" section, optimize-error banner, source-authority hero badges, passes new pipeline data through
- `dashboard/[id]/page.tsx` — server-fetches `source_documents`, `layer_candidates`, latest `compiled_bundles` alongside existing project data
- `chat.tsx` — outer flex restructured into a row layout; `SessionContextPanel` mounts on the right (default open); a "Context" toggle in the toolbar shows/hides it; attribution UI shows used vs rejected sources with rejection reasons and an asterisk on AI-generated layers; SSE JSON-parse `catch` annotated as expected partial-chunk
- `deploy-panel.tsx`, `memory-map.tsx`, `agent-setup-wizard.tsx`, `quick-proof-card.tsx`, `chat-with-demo.tsx` — empty `catch {}` blocks replaced with user-visible error state or explicit annotations

**Persistence layer** — `packages/web/src/lib/pipeline/store.ts`:
- `storeSourceDocuments()` (hash-based dedup), `storeLayerCandidates()`, `storeCompiledBundle()` (also writes snapshot + updates project score), `backfillProjectFiles()` (keeps the old table populated during migration), `getLatestBundle()`, `logTransformations()` (writes auto-decisions to `decision_audit`)

**CLAUDE.md** — codified the Core Visibility Requirement and the Evidence Pipeline 4-stage architecture as project-level instructions.

**Memory (persistent across sessions)** — `~/.claude/projects/...stAIpler/memory/`:
- `project_evidence_pipeline.md` — 4-stage architecture + decision statement
- `feedback_optimizer_role.md` — optimizer is a gap-filler
- `project_heuristic_handoff.md` — handoff design including epistemic classification
- `feedback_visibility.md` — visibility requirement + non-CS-user framing

### What appears to be working

- `pnpm build` clean across all packages.
- `pnpm test` — 262/262 tests passing as of this session's end. (Note: test count grew from 121 to 262 because follow-on work added the Knowledge v1 invariant suite and the benchmark system. None of those tests are mine, but they all pass alongside the pipeline work.)
- All 17 audit violations addressed (Tier 1, 2, and 3).
- Chat system prompt now includes handoffs below source knowledge; attribution stream includes rejected sources.

### What is incomplete or uncertain

- **No connector emits handoffs yet.** The handoff system is fully wired (API, schema, decay, dedup, compilation injection, UI panel), but **nothing in the product currently creates handoffs automatically**. They can only be created by POSTing to `/api/handoffs`. The agent-emits-at-session-end flow described in the design doc is not built — there's no session-end hook in the chat route. See "Next Recommended Focus."
- **`PipelineEvent[]` is typed but not populated.** `runPipeline()` returns `events: []` as a TODO. The `onProgress` callback fires text messages but doesn't produce structured `{stage, event, detail, elapsed}` events. Connector routes don't surface progress to the UI via SSE — they still return a single JSON response when done. The audit's Tier-1 item "stream pipeline progress via SSE" was addressed at the *data-model* layer (transformation logs are now visible after the fact) but not at the *transport* layer (no live streaming during import).
- **`backfillProjectFiles()` is dual-write.** Every connector writes to both `source_documents`/`layer_candidates`/`compiled_bundles` AND `project_files`. This is intentional for migration but means readers can see different states depending on which table they query.
- **The session-context-panel was modified after my changes.** A follow-on session added a Logs tab (querying `/api/project-logs`) and a Knowledge tab (querying `/api/knowledge/injection-state`), plus drag-to-resize and pop-out window features. The Knowledge tab depends on infrastructure I did not build (`@/components/visible-object`, `@/lib/knowledge/to-visible`, `AtomRow`, `InjectionDecisionRow`). I have not validated those tabs work end-to-end against the current schema.
- **A 13th layer (`continuity`) was added to `extract.ts` and `compile/route.ts` CANONICAL_ORDER** after this session. The 12-layer terminology in `CLAUDE.md`, `session-context-panel.tsx` CANONICAL_ORDER, the LAYER_COLORS map, and many UI components has **not been updated** to include `continuity`. Expect drift between the displayed layer count ("X / 12") and the actual layer set.

## 3. Important Context Learned

### Rules of thumb worth carrying forward

- **Returning richer types from core functions is cheaper than streaming.** Changing `organizeCandidates()` to return `{ resolvedLayers, transformations }` instead of just `ResolvedLayer[]` gave us visibility everywhere with one refactor. Three callers needed updating; all three were trivial. Prefer this pattern over plumbing callbacks through the entire stack.
- **Every silent transformation must produce an artifact, not a log line.** Console logs are invisible to users; artifacts flow back through the API response and become part of the audit trail. The `TransformationLog` shape is the template: `{ deduplicatedDocuments, mergedCandidates, filteredByConfidence, autoResolutions, gapReasons }`.
- **Empty `catch {}` blocks fall into two categories.** (1) The error matters and was being hidden — must surface to the user via state. (2) The error is genuinely expected and non-actionable (partial SSE chunk, temp file cleanup, decryption with fallback) — must still be annotated with a comment explaining why silence is correct. There is no third category.
- **Handoffs should never outrank source knowledge.** This is enforced in two places: (a) `formatHandoffsForPrompt()` emits an "## Operational Wisdom" section with explicit precedence instructions, and (b) handoffs are appended *after* the source-knowledge sections in the compiled system prompt. Do not refactor handoffs into the same section ordering as source layers — the separation is load-bearing.
- **The optimizer must be auditable.** `/api/optimize` returns `reasoning[]` with every prompt sent and every context selection. If you ever cache or batch optimizer calls, preserve this. The point isn't logging; it's that the user can answer "why did the AI write this layer?" without spelunking.
- **Provenance is at the snippet level, not the document level.** A 20-page SOP can contain 2 paragraphs of constraints, 1 paragraph of style guidance, and 18 pages of irrelevant process. `LayerCandidate.content` stores the span, `CandidateProvenance.span = { startChar, endChar }` stores the location, and `rawContent` on `SourceDocument` is preserved for re-extraction. Never collapse this to "this layer came from Drive."
- **Non-CS users are the design target.** UI copy avoids "candidates," "pipeline," "heuristics" — use "What We Found," "Operational Wisdom," "From your docs." When you find yourself reaching for a CS term, you've designed for the wrong audience.
- **Plan mode is the right pattern for AI judgment calls.** `pipeline-review.tsx` is modeled on Claude Code's plan-mode flow. When the pipeline can't decide between two reasonable interpretations (conflict-resolution, constraint-vs-policy, low-confidence extraction), it stops and asks. Don't add more auto-resolutions — add more review item types.

### Constraints / conventions

- **`@staipler/core` must remain provider-free.** The pipeline takes an optional `LLMFunction = (prompt: string) => Promise<string>` rather than importing Anthropic/OpenAI SDKs. The web package supplies the LLM at call-time.
- **All new tables use the project_id RLS pattern**: `project_id in (select id from projects where user_id = auth.uid())`. Existing pattern; don't deviate.
- **Schema file is idempotent.** Every new table uses `create table if not exists` and drops policies before recreating. `packages/web/supabase/schema.sql` is meant to be re-run safely.
- **The 12-layer canonical set lives in `packages/core/src/schema.ts`** (`LAYER_TYPES`, `CANONICAL_SECTION_ORDER`, `REQUIRED_LAYER_TYPES`). The continuity-layer addition happened to `extract.ts` and the web compile route's local arrays but not the core schema. If `continuity` is meant to be a first-class layer it needs to flow through `LAYER_TYPES` to avoid divergence — see Risks.

## 4. Next Recommended Focus

In practical order:

1. **Reconcile the 13th layer (`continuity`) across the codebase.** Either promote it into `packages/core/src/schema.ts` `LAYER_TYPES` (and update `LAYER_COLORS`, `IMPORTANCE`, every UI component that hardcodes "X / 12"), or treat it as a derived/virtual layer with its own pathway. Today the symbol exists in `extract.ts` `KIND_SIGNALS`/`LAYER_DESCRIPTIONS` and in `compile/route.ts` CANONICAL_ORDER but is missing from the core schema. Compilation will reject continuity assets unless `LayerType` accepts the string. **Inspect first**: `packages/core/src/types.ts` (LayerType union), `packages/core/src/schema.ts` (LAYER_TYPES), `extract.ts` KIND_SIGNALS, and the existing handoffs about the continuity layer (`2026-04-22-staipler-continuity-layer.md`, `2026-04-22-staipler-continuity-status-injection.md`) — those describe what the new layer is supposed to do.

2. **Implement automatic handoff generation.** The handoff system is built but no agent emits handoffs. Pick one of:
   - At chat session end (when the client unmounts or after N minutes of inactivity), prompt the model: "Did this session produce reusable insight? If yes, emit a JSON handoff packet with classification, content, confidence."
   - Hook into the existing `/handoff` skill / `docs/handoffs/*.md` files (which the continuity layer already detects) and convert detected handoff frontmatter into `session_handoffs` rows.
   The second option may be the right move given the continuity layer infrastructure already exists. Investigate before building.

3. **Wire SSE streaming through the connector routes.** The `runPipeline()` `onProgress` callback exists but no route forwards it to the client. Convert `/api/sources/upload`, `/api/sources/github`, `/api/sources/google-drive/sync` to SSE responses and emit `{stage, event, detail, elapsed}` events. Then update `data-sources-panel.tsx` (during import) and `quick-proof-card.tsx` (already streams stages — model the pattern there) to render a live step indicator. This is the audit's Tier-1 item that was only partially addressed.

4. **Validate the Knowledge and Logs tabs in `session-context-panel.tsx`.** A follow-on session added these but I did not verify them against the current schema. Confirm `/api/project-logs` and `/api/knowledge/injection-state` exist and return shapes the panel expects (`AtomRow`, `InjectionDecisionRow`). If they don't, the tabs will error silently because the panel does set `knowledgeError` / `logsError` but the error UI is minimal.

5. **Add a `/dashboard/context/[projectId]` route for the panel's pop-out window.** `popOut()` in `session-context-panel.tsx` opens `/dashboard/context/${projectId}` but I did not see this route in the repo. Either build the route (a thin page that renders `<SessionContextPanel projectId={...} standalone />`) or remove the pop-out button if the route is intentionally out of scope.

6. **Migrate readers off `project_files` once everything writes to the new tables.** `backfillProjectFiles()` is dual-write today. Eventually `/api/chat`, `/api/compile`, `/api/init-report`, and the layer modal should read solely from `source_documents` + `layer_candidates` + `compiled_bundles`. Schedule this as an explicit migration so the old table can be dropped.

7. **Surface conflict detail in the layer grid modal.** The layer modal currently shows files contributing to a layer but does not show conflicts. Hooking `compiled_bundle.conflicts` into the modal would give per-layer conflict visibility without a new screen.

## 5. Known Issues / Risks

- **The 13th-layer drift is a real bug, not just a cosmetic issue.** Any `LayerCandidate` with `layer: 'continuity'` will fail `LayerType` typing in `packages/core/src/types.ts` unless the union has been updated. Verify before merging anything that creates continuity candidates. (`pnpm test` passed at 262/262 in this session, so either the union was already updated by the continuity feature or no test exercises this path. Worth confirming.)
- **`backfillProjectFiles()` writes happen unconditionally on every import** — even when the pipeline produced no source-grounded content. If a user imports a folder of unrelated docs, they'll see junk rows in `project_files` with `inferred_kind: null` and high content_length. Consider filtering or marking these.
- **Handoff dedup is Jaccard-on-word-tokens.** `findSimilarHandoff()` uses set intersection of words >3 chars. This will mismatch on paraphrases. If we start seeing duplicate handoffs in the wild, swap to embedding similarity.
- **Decay computation runs at read time, not on a schedule.** `applyDecay()` is called every time `/api/handoffs` is hit. This is correct (always fresh) but means a project that hasn't loaded the panel in months may have many handoffs that should be `decayed` in the DB but still show `status: 'active'`. The `/api/handoffs` GET writes the status change as a side effect — that works but is implicit. A nightly cron is a cleaner long-term answer.
- **Pipeline review can be skipped.** The connector routes return `needsReview` and `reviewItems` but I did not enforce that compilation pause when `needsReview === true`. Today the bundle is compiled immediately with the auto-resolutions applied; the review is a *post-hoc* opportunity to override. If the intent is "no compilation without user sign-off," gate the bundle write on `needsReview` and only persist after `/api/pipeline/resolve` runs.
- **Operational wisdom is appended to the system prompt without a token budget.** A project that accumulates 100+ active handoffs over months will balloon the prompt. The decay threshold of 0.15 + the per-classification half-life provides some natural pruning, but heavy/recent use will dominate the prompt budget. Add a `max_handoffs` ceiling or rank-by-confidence cap.
- **The Session Context Panel's `popOut()` opens a route that may not exist** (see Next Focus #5). Clicking pop-out today might 404.
- **Attribution `status: 'rejected'` only fires for identity/style layers** (last-wins merge strategy). All other layers use concatenate, so nothing is rejected. The UI shows "Not used" only when relevant, which is correct, but make sure the chat copy doesn't oversell rejection visibility.

## 6. Testing / Verification

### Commands run this session

- `pnpm build` — completed cleanly across all packages multiple times.
- `pnpm test` — 262/262 passing at session end.

### Recommended before further changes

```bash
pnpm build                  # confirm the tree still compiles after the session-context-panel modifications
pnpm test                   # full suite — should still be 262/262
pnpm --filter @staipler/core test   # narrow to core if iterating on pipeline modules
```

### Manual verification that's still worth doing

- Import a multi-topic markdown file (e.g., a 10-page SOP) and confirm:
  - `source_documents` row created with content hash
  - Multiple `layer_candidates` produced from one document, each with non-null `span_start`/`span_end`
  - `compiled_bundles` row with `gaps[]` populated for missing layers
  - `decision_audit` rows for any dedup or auto-resolution
- POST two near-identical handoffs to `/api/handoffs` and confirm the second reinforces the first (look for `reinforcement_count` increment, not a new row).
- Open the chat with handoffs present and verify the system prompt (visible in the Context panel's Prompt tab) contains "## Operational Wisdom" below the source-grounded sections.
- Confirm the "Knowledge" and "Logs" tabs in the Session Context Panel load without errors against the current backend.

## 7. Files and References

### Core pipeline (new this session)

- `packages/core/src/pipeline/types.ts` — all pipeline interfaces. Source of truth for shapes.
- `packages/core/src/pipeline/ingest.ts` — normalization + hash-based dedup at ingestion
- `packages/core/src/pipeline/extract.ts` — fast-path (centralized FILENAME_LAYER_MAP / AI_TOOL_DEFAULTS / KIND_SIGNALS) and deep-path semantic. **Modified by follow-on session** to add `continuity` to KIND_SIGNALS and LAYER_DESCRIPTIONS.
- `packages/core/src/pipeline/organize.ts` — dedup, conflict detection (now includes content snippets), ranking, quality scoring, merge strategy application. Returns `{ resolvedLayers, transformations }`.
- `packages/core/src/pipeline/compile.ts` — canonical-order section assembly with grounding status + SHA256
- `packages/core/src/pipeline/review.ts` — `ReviewItem` builder for conflicts / uncertain / clarification; `applyReviewDecisions()` reorganizer
- `packages/core/src/pipeline/handoff.ts` — `HandoffPacket` lifecycle, decay math, formatting for prompt, Jaccard-based similarity dedup
- `packages/core/src/pipeline/index.ts` — `runPipeline()` orchestrator + barrel exports
- `packages/core/src/index.ts` — public API exports for everything above

### Web persistence + API

- `packages/web/src/lib/pipeline/store.ts` — Supabase write-side helpers, including `logTransformations()` → `decision_audit`
- `packages/web/src/app/api/sources/github/route.ts`, `.../upload/route.ts`, `.../google-drive/sync/route.ts` — connector shells calling `runPipeline()`
- `packages/web/src/app/api/pipeline/resolve/route.ts` — applies `ReviewDecision[]` and re-compiles
- `packages/web/src/app/api/handoffs/route.ts` — GET/POST/PATCH handoff lifecycle
- `packages/web/src/app/api/session-context/route.ts` — right-side panel data aggregator. **Modified by follow-on session** to include `continuity` in CANONICAL_ORDER for the layer summary.
- `packages/web/src/app/api/chat/route.ts` — injects handoffs below source knowledge; attribution includes rejected sources with reasons
- `packages/web/src/app/api/optimize/route.ts` — reads gaps from latest bundle, returns full `reasoning[]`
- `packages/web/src/app/api/compile/route.ts` — reads from `compiled_bundles`, fallback to `project_files`. **Modified by follow-on session** to include `continuity` in CANONICAL_ORDER and KIND_TITLES.
- `packages/web/src/app/api/widget/chat/route.ts` — emits `citations[]` in first SSE chunk

### Web UI

- `packages/web/src/components/session-context-panel.tsx` — right-side chat panel. **Heavily modified by follow-on session**: added Logs and Knowledge tabs, drag-to-resize with localStorage persistence, `popOut()` to a dedicated route, `standalone` prop for full-width rendering. The Knowledge tab depends on `@/components/visible-object` and `@/lib/knowledge/to-visible` which I did not author.
- `packages/web/src/components/knowledge-journey.tsx` — three-column visualization with expandable per-layer detail
- `packages/web/src/components/pipeline-review.tsx` — review UI for conflicts / uncertain / clarifications
- `packages/web/src/components/handoffs-panel.tsx` — operational wisdom panel with decay formula visibility
- `packages/web/src/components/layer-grid.tsx` — extraction-method + avg-confidence label on each card; authority badges from compiled bundle
- `packages/web/src/components/project-dashboard.tsx` — toggle between Knowledge Journey and Scan Report; "Operational Wisdom" section; optimize error banner; pipeline data plumbing
- `packages/web/src/app/dashboard/[id]/page.tsx` — server-side fetch of new pipeline tables
- `packages/web/src/components/chat.tsx` — flex-row restructure; Session Context toggle in toolbar; attribution rendering for used vs rejected sources

### Schema and config

- `packages/web/supabase/schema.sql` — `source_documents`, `layer_candidates`, `compiled_bundles`, `session_handoffs`, `decision_audit` tables with RLS
- `CLAUDE.md` — Core Visibility Requirement, Evidence Pipeline architecture, optimizer-as-gap-filler constraint

### Related prior handoffs (read these next if continuing the work)

- `docs/handoffs/HANDOFF-visibility-audit-2026-05-11.md` — the audit this session implemented fixes for. Useful for cross-checking what's been closed.
- `docs/handoffs/2026-04-22-staipler-continuity-layer.md` — Phase 1 of the continuity layer (the 13th layer added after this session)
- `docs/handoffs/2026-04-22-staipler-continuity-status-injection.md` — Phase 2 of the continuity layer (CLAUDE.md status injection)
- `docs/handoffs/HANDOFF-assumptions-visibility-design-2026-05-12T0032.md` — assumptions/visibility design that may further refine the patterns here

### Persistent memory (across sessions)

- `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/MEMORY.md` — index
- `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/project_evidence_pipeline.md`
- `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/project_heuristic_handoff.md`
- `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_visibility.md`
- `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_optimizer_role.md`
