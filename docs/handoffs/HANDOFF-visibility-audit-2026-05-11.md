---
title: Visibility Hard-Requirement Audit
date: 2026-05-11
thread: qa-visibility-audit
status: research-complete-no-code-changes
---

# Handoff: Visibility Hard-Requirement Audit

## 1. Session Summary

This session was a **read-only QA audit** of the stAIpler application against the hard requirement defined in `CLAUDE.md`:

> "Everything must be visible. Architecture, workflows, pipeline stages, contracts, intent, provenance, and conflicts must be visible to the user in real time."

**No code was changed.** The output is the audit itself — a catalog of where the product currently fails (and partially passes) the visibility contract. Three parallel Explore agents were dispatched to examine the UI, the API routes, and the core pipeline / database schema.

### Major findings (the verdict)

**Currently failing the requirement.** The data model supports visibility (provenance is tracked, conflicts are detected, intermediate state is persisted), but the *plumbing from core → API → UI does not stream real-time progress, and AI reasoning is opaque*. The architecture is sound; the surface is broken.

### Three systemic failure patterns identified

1. **Every long-running operation is a black box.** `runPipeline()` has an `onProgress` callback, but **no web route passes one in**. Users see a spinner with no per-stage, per-file, or per-layer visibility on imports, syncs, optimization, or compilation.
2. **Silent transformations eat data without trace.** Deduplication, confidence filtering, conflict auto-resolution, best-candidate selection, and gap-skipping all happen invisibly.
3. **AI reasoning is fully opaque.** Prompts sent to Claude, context selected for the optimizer, retrieval ranking in chat, and decay formulas for handoffs are never shown to the user.

### Architectural direction that emerged

The fix is *not* a redesign — the underlying types (`CandidateProvenance`, `SectionProvenance`, `ConflictRecord`, `ReviewItem`) and tables (`source_documents`, `layer_candidates`, `compiled_bundles`, `session_handoffs`) already model what needs to be visible. The work is:

- Convert blocking POST routes to SSE/streaming responses
- Thread `onProgress` callbacks through `runPipeline()` and `optimize()` to clients
- Add a `pipeline_decisions` / audit-log table for retrospective traceability
- Replace empty `catch {}` blocks with surfaced errors
- Return optimizer/judge reasoning structurally in API responses, not just in HTML reports

## 2. Current State

### What was implemented or changed in this session

**Nothing.** This was a research and documentation pass only. The repository is unchanged. `git status` is clean against `main` at commit `905b1d1`.

### What was inspected

| Area | Coverage |
|---|---|
| All UI components | `packages/web/src/components/*.tsx` (chat, pipeline-review, data-sources-panel, agent-setup-wizard, deploy-panel, handoffs-panel, knowledge-journey, layer-grid, memory-map, project-dashboard, quick-proof-card, timeline) |
| All API routes | All 21 routes under `packages/web/src/app/api/` |
| Core pipeline | `packages/core/src/pipeline/` (index, extract, organize, compile, review, types) |
| Optimizer | `packages/core/src/optimizer/agent.ts`, `index.ts` |
| Evaluator | `packages/core/src/eval/judge.ts`, `runner.ts`, `report.ts` |
| Web pipeline glue | `packages/web/src/lib/pipeline/store.ts` |
| Database schema | `packages/web/supabase/schema.sql` |

### What appears to be working (the genuine positives)

- **Provenance data model is strong** — `CandidateProvenance` captures sourceTitle, URL, provider, character span, importedAt, extractedAt across all 4 pipeline stages.
- **Conflict detection exists** at `packages/core/src/pipeline/organize.ts:78-109` (`detectConflicts()`) and surfaces conflicts as review items.
- **`Knowledge Journey` 3-column visualization** (sources → extraction → compilation) is the right mental model — just truncated in places.
- **Handoff classification** (fact / inference / heuristic / question) with decay model is well-structured.
- **`/api/quick-proof/`** is the *only* route that streams stage labels (steps 1–6 with progress events). It's the template the others should follow.
- **Database schema** stores all intermediate state needed for visibility — the data is there, the UI just doesn't surface it.

### What is incomplete or violates the requirement

See the **Issues** section below for the catalog of 17 specific violations across critical, high, and medium severity.

## 3. Important Context Learned

### Conventions / constraints

- **The visibility requirement in `CLAUDE.md` is treated as a hard requirement, no exceptions.** This is not aspirational — it is the bar every feature must clear. The audit applied this strictly.
- **Robert wants honest disagreement, not automatic agreement** (per `feedback_pushback.md`). The audit was direct about failures and did not soften them.
- **Connectors are evidence pipelines, not importers** — they must produce layer candidates, provenance, and conflict-aware structured output. This is already wired in `runPipeline()` but is not visible to the user during execution.
- **The optimizer is a gap-filler, not a primary author** when source material exists. The optimizer is *already* implemented this way; the visibility gap is that the user can't see the gap-fill reasoning.

### Rules of thumb for the next agent

1. **Don't add visibility features without streaming.** A modal that lazy-loads data on click is not "real time visible" per the requirement. Information must flow as it is produced.
2. **`onProgress` callbacks already exist; use them.** `runPipeline()` accepts one at `packages/core/src/pipeline/index.ts:104`. `optimize()` accepts one at `packages/core/src/optimizer/agent.ts:209`. They are never passed from web routes. This is the single most impactful fix.
3. **Empty `catch {}` is a visibility violation.** Treat every silenced error as a bug against the hard requirement, not just a code-quality issue. There are 12 instances catalogued.
4. **The database has the data; the API and UI don't expose it.** Don't propose new tables before checking what `layer_candidates.provenance`, `compiled_bundles.provenance`, and `compiled_bundles.conflicts` already store.
5. **Provenance ≠ audit trail.** Provenance answers "where did this come from?" — already strong. Audit trail answers "why was this kept/rejected/merged?" — missing entirely. A new `pipeline_decisions` table is the cleanest way to close this gap.
6. **Don't propose UI redesigns.** The components are mostly fine; they're starved of data because the backend doesn't stream and the API doesn't return reasoning. Fix backend first.

### Non-obvious gotchas found in the codebase

- `pipeline-review.tsx:76-77` has a **dead code path** — both branches of `showAll ? reviewItems : reviewItems` are identical. Worth flagging during cleanup.
- `chat.tsx:188-190` parses attribution data from the stream, but if parsing fails the attribution panel silently shows nothing — user thinks no sources were used.
- `/api/quick-proof/` silently falls back to hardcoded dummy judge results at `route.ts:100-105` if Claude returns unparseable output. The card looks successful but the data is fake.
- `organize.ts:93` only flags conflicts when *both* candidates have confidence ≥ 0.7. Low-confidence conflicts are silently dropped — the user is never told there is latent disagreement.
- `store.ts:156-186` `backfillProjectFiles()` writes only the *best candidate* per document to `project_files`, discarding alternatives from any UI that reads `project_files`. The richer view requires querying `layer_candidates` directly.

## 4. Next Recommended Focus

Prioritized for impact-per-effort against the hard requirement:

### Step 1 — Read the audit report first
Read this handoff's "Known Issues / Risks" section and the prior assistant message in the conversation log (if available) for the full per-file/per-line catalog. The audit is the source of truth for what is broken.

### Step 2 — Land streaming on the highest-traffic black box
**Pick one of these as a vertical slice to prove the pattern:**

- **Recommended first slice: `/api/optimize/`** — Convert to SSE, thread an `onProgress` callback through `optimize()` in `packages/core/src/optimizer/agent.ts:209`, emit per-layer events (`{stage: "generating", layer: "identity", elapsedMs: ...}`). Wire the events into `project-dashboard.tsx:43-59` to replace the silent "Optimizing..." state. This is the highest-frustration black box because it is long-running (multiple sequential Claude CLI calls, ~120s timeout *per layer*).

- **Alternative first slice: `/api/sources/upload/`** — Same pattern. `runPipeline()` already supports `onProgress`. Wire events through to `data-sources-panel.tsx` per-file progress UI. Smaller blast radius if you want a safer first slice.

### Step 3 — Replace all empty `catch {}` blocks
12 specific locations catalogued. Each becomes an error toast / inline error state. This is mostly mechanical but high signal — it eliminates the "I can't tell if it worked or failed" experience.

### Step 4 — Add the `pipeline_decisions` audit table
Schema sketch in the audit (see "Database Audit Gap"). Add migration in `packages/web/supabase/`. Backfill on conflict resolution at `packages/web/src/app/api/pipeline/resolve/route.ts:70-78`.

### Step 5 — Expose optimizer reasoning structurally
Return with every `OptimizedAsset`:
- `generationContext.selectedFiles` (which files fed the prompt)
- `generationContext.excludedFiles` (what was considered and dropped)
- `generationContext.promptUsed` (the actual prompt sent to Claude)
- `changeSummary` should be the real Claude-articulated summary, not the hardcoded `Generating new ${kind} layer from scratch` at `agent.ts:227`.

### Step 6 — Surface silent pipeline transformations
- `deduplicateCandidates()` at `organize.ts:44-63` should return `{kept, merged: Array<{keptId, droppedIds, reason}>}` instead of just mutating in place.
- `mergeContent()` at `organize.ts:152-168` should record the merge ordering and which candidates contributed.
- These structures flow into `compiled_bundles.provenance` so the Knowledge Journey can render the full story.

### Step 7 — Knowledge Journey: remove the 2-candidate truncation
At `knowledge-journey.tsx:134-162`, the `.slice(0, 2)` + `+N more` summary actively hides extraction detail. Replace with a virtualized expand-all view.

## 5. Known Issues / Risks

### Critical violations (block the hard requirement)

| # | Location | Issue |
|---|---|---|
| 1 | `packages/web/src/app/api/optimize/route.ts:111-173` | Multi-layer generation loop with zero progress feedback; user waits ~10min blind |
| 2 | `packages/web/src/app/api/sources/upload/route.ts:63` | `runPipeline()` called without `onProgress`; entire pipeline blocking |
| 3 | `packages/web/src/app/api/sources/github/route.ts:131` | Same pattern: pipeline runs silently, no per-file or per-stage feedback |
| 4 | `packages/web/src/app/api/sources/google-drive/sync/route.ts:128-147` | File export loop + pipeline both silent; export failures silently skip files (line 134) |
| 5 | `packages/web/src/app/api/compile/route.ts:1-92` | No per-stage events; cache hit/miss invisible; layer-selection logic unexplained |
| 6 | `packages/web/src/app/api/pipeline/resolve/route.ts:1-94` | Decision application returns final bundle with no audit trail |
| 7 | `packages/core/src/pipeline/organize.ts:44-63` | `deduplicateCandidates()` silently merges by content hash |
| 8 | `packages/core/src/pipeline/organize.ts:93-104` | Conflict auto-resolution by confidence/recency; winner pre-determined, bias hidden |
| 9 | `packages/core/src/optimizer/agent.ts:117-154` | `buildGeneratePrompt()` selects context invisibly; user can't see what fed the LLM |
| 10 | `packages/core/src/optimizer/agent.ts:221-228` | `changeSummary` is hardcoded literal; no Claude-articulated reasoning surfaced |
| 11 | `packages/web/supabase/schema.sql` | No `pipeline_decisions` / audit log table; can't answer "why was X rejected?" six months later |

### High-severity silent-failure violations (empty `catch {}`)

| Component | File | Effect |
|---|---|---|
| Chat stream parse | `packages/web/src/components/chat.tsx:196-199` | Mid-stream JSON parse errors swallowed |
| Pipeline review resolve | `packages/web/src/components/pipeline-review.tsx:96` | Resolve operation failures invisible |
| Deploy panel | `packages/web/src/components/deploy-panel.tsx:29-41` | Token generation failure invisible |
| Memory map | `packages/web/src/components/memory-map.tsx:120-134` | Graph load failure logs to console only |
| Handoffs panel | `packages/web/src/components/handoffs-panel.tsx:100-111` | Fetch + resolve failures hidden |
| Optimize per-layer | `packages/web/src/app/api/optimize/route.ts:168-172` | Per-layer generation failures only console.error'd |
| Quick-proof scenario | `packages/web/src/app/api/quick-proof/route.ts:79-84` | Scenario gen failure silently uses fallback |
| Quick-proof judge | `packages/web/src/app/api/quick-proof/route.ts:100-105` | Judge failure silently uses hardcoded dummy results |
| Project dashboard optimize | `packages/web/src/components/project-dashboard.tsx:43-59` | Optimize failure shows no error UI |

### Architectural risks / open questions

- **Streaming + Supabase RLS:** SSE routes will need careful handling of Supabase auth. Not yet researched. Worth a 30-min spike before committing to SSE vs WebSocket.
- **Claude CLI is invoked via `execSync`** in optimize and quick-proof. To stream Claude reasoning, you'll need to switch to `spawn` with stdout streaming. This is a non-trivial refactor and may affect the existing 120s timeout behavior at `agent.ts:142-148`.
- **Token-count approximation** at `chat/route.ts:351` uses `inputChars / 4` (±25% error). If accurate token visibility is part of "contracts must be visible," this needs to become a real tokenizer call.
- **Widget chat** at `packages/web/src/app/api/widget/chat/route.ts` has zero attribution for end-users. Unclear whether the visibility requirement applies to widget consumers or only to the project owner. **This should be clarified with Robert before any widget changes.**
- **Conflict detection threshold** at `organize.ts:93` (only `≥ 0.7` confidence pairs) is a product decision, not just an implementation detail. Lowering it floods the user with noise; keeping it silently drops latent conflicts. Worth surfacing for a product decision.

### Risks of acting on the audit naively

- **Don't add real-time streaming to every endpoint at once.** Pick one vertical slice (recommendation: `/api/optimize/`), prove the SSE + `onProgress` pattern end-to-end, *then* fan out. A half-finished streaming layer is worse than the current state.
- **Don't add visibility *features* that themselves aren't visible.** For example: an audit-log table that has no UI is just more invisible data.
- **Don't compress the catalog into one mega-PR.** This is ~3 sprints of work. Land it in tiers (streaming → silent failures → audit table → optimizer reasoning → silent transformations → Knowledge Journey expand).

## 6. Testing / Verification

### Commands run this session

**None.** This session was read-only research. No tests executed. No builds run.

### Current test status

Unknown for this session. Last known state from the commit history: per the most recent handoff index entry, `260/260 tests green` as of `2026-04-22` (Phase 2c continuity layer). Three commits have landed since (`905b1d1`, `51311d0`, `8b7c578`); test status not re-verified here.

### Recommended commands before further changes

Run from repo root:

```bash
pnpm build    # confirm clean baseline before touching anything
pnpm test     # confirm 260+ tests still green
```

Once those are green, any visibility-related change should add:
- A test asserting the new SSE event sequence (use a streaming-aware test client)
- A test asserting that a previously silent failure now propagates an error to the caller
- A schema migration test if `pipeline_decisions` table is added

### Verification approach for the streaming work

For the recommended first slice (`/api/optimize/` SSE):
1. Manual: run `staipler optimize` via the dashboard, confirm per-layer events render in `project-dashboard.tsx`.
2. Integration: assert that `optimize()` invokes `onProgress` at least once per layer in `generate[]`.
3. Negative: kill the Claude CLI mid-generation, confirm an error event is emitted (not swallowed).

## 7. Files and References

### The audit's most-cited files (start here)

| File | Why it matters |
|---|---|
| [`CLAUDE.md`](../../CLAUDE.md) | Source of truth for the hard requirement. Re-read before designing fixes. |
| [`packages/core/src/pipeline/index.ts`](../../packages/core/src/pipeline/index.ts) | `runPipeline()` orchestrator. Lines 104-162: has `onProgress` callback that nothing uses. |
| [`packages/core/src/pipeline/organize.ts`](../../packages/core/src/pipeline/organize.ts) | Site of silent dedup (44-63), silent conflict resolution (93-104), silent merge (152-168). |
| [`packages/core/src/optimizer/agent.ts`](../../packages/core/src/optimizer/agent.ts) | `optimize()` at line 209 has `onProgress`; never called. `buildGeneratePrompt()` at 117-154 hides context selection. `changeSummary` hardcoded at 227. |
| [`packages/web/src/app/api/optimize/route.ts`](../../packages/web/src/app/api/optimize/route.ts) | Recommended first streaming slice. Loop at 111-173 generates layers blind. |
| [`packages/web/src/app/api/sources/upload/route.ts`](../../packages/web/src/app/api/sources/upload/route.ts) | Calls `runPipeline()` at line 63 without `onProgress`. Smallest-blast-radius streaming slice. |
| [`packages/web/src/app/api/quick-proof/route.ts`](../../packages/web/src/app/api/quick-proof/route.ts) | The *only* streaming route in the codebase. Use as template. Note silent fallbacks at 79-84 and 100-105. |
| [`packages/web/supabase/schema.sql`](../../packages/web/supabase/schema.sql) | Has provenance + conflicts in JSONB but no `pipeline_decisions` audit table. |

### UI components with the most visibility debt

| Component | Why it matters |
|---|---|
| [`packages/web/src/components/project-dashboard.tsx`](../../packages/web/src/components/project-dashboard.tsx) | Optimize UI — the first place SSE events should land. |
| [`packages/web/src/components/data-sources-panel.tsx`](../../packages/web/src/components/data-sources-panel.tsx) | Import UI — second place for SSE events. |
| [`packages/web/src/components/chat.tsx`](../../packages/web/src/components/chat.tsx) | Silent error swallowing + opaque retrieval ranking. |
| [`packages/web/src/components/knowledge-journey.tsx`](../../packages/web/src/components/knowledge-journey.tsx) | 3-column model is right; truncation at 134-162 actively hides data. |
| [`packages/web/src/components/pipeline-review.tsx`](../../packages/web/src/components/pipeline-review.tsx) | Conflict review surface; conflict descriptions too generic to be useful. |

### Reference: prior handoffs (context for the project's trajectory)

| Handoff | Why it might matter |
|---|---|
| [2026-04-22 Continuity Layer Phase 2](2026-04-22-staipler-continuity-status-injection.md) | Continuity layer is already a 13th instruction layer. The audit didn't catalog continuity UI visibility — worth double-checking before assuming it's compliant. |
| [2026-04-22 Continuity Layer Phase 1](2026-04-22-staipler-continuity-layer.md) | Detection + scoring of `docs/handoffs/*.md`. Relevant if visibility work touches the handoff system itself. |

### Memory references

The user has standing memory entries that informed how this audit was framed. The next agent should be aware these exist (in `~/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/`):

- `feedback_visibility.md` — Total visibility requirement (this is the requirement under audit)
- `feedback_pushback.md` — Honest disagreement, not automatic agreement
- `project_evidence_pipeline.md` — Connectors as evidence pipelines, 4-stage model
- `feedback_optimizer_role.md` — Optimizer gap-fills, never primary author when source exists
- `project_heuristic_handoff.md` — Handoff confidence/provenance/decay model

These memories are likely auto-loaded for the next session; flagging in case they aren't.

---

**Honest uncertainty:** This audit was done by reading code, not by running the app. There may be runtime behaviors (loading states, animations, websocket connections, etc.) that partially close some of the visibility gaps in ways that aren't apparent from static analysis. The next agent should run the app and verify the *user-perceived* state of each "violation" before treating any specific item as gospel. The systemic findings (no streaming, silent transformations, opaque AI reasoning, silent errors) are robust against this caveat — those are structural, not perceptual.
