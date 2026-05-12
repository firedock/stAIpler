---
session_date: 2026-05-11
created_utc: 2026-05-12T00:32
thread: assumptions-visibility
status: design-only, no code written
---

# Handoff — Assumptions Visibility Feature (Design)

## 1. Session Summary

Robert proposed a new stAIpler feature: **make the assumptions an AI agent is implicitly making visible to the user, and provide rails/guidance that constrain those assumptions.** This grew out of the project's [Total Visibility Requirement](../../CLAUDE.md) — assumptions are the invisible decisions an agent fills in when instructions under-specify, and stAIpler currently scores layers but does not surface those gaps as predicted *assumptions the agent will make*.

The session was design-only. No code changed.

Major decisions reached:

- **Assumptions are NOT a 13th instruction layer.** They are modeled as a cross-cutting concern that *references* layers. The 12-layer taxonomy stays intact.
- **Two complementary surfaces are needed:**
  - *Static* — at compile time the analyzer flags under-specified spots and predicts the assumption the agent will make (e.g. "no policy layer → agent will assume permissive defaults on PII").
  - *Runtime* — agents emit assumption events at moments of hedging; the user confirms/rejects; confirmations get codified back into the relevant layer.
- **Closing the loop is the load-bearing idea.** When a user resolves an assumption with `accept-as-policy`, synthesize a new `LayerCandidate` (origin: `user-confirmation`) and push it into the relevant layer. Next compile, the gap closes, empowerment score rises, the same assumption stops re-surfacing. Rejection produces a `constraints`-layer candidate phrased as a prohibition.
- **Sequencing:** ship static first (no agent cooperation required), design the runtime protocol in parallel.

Architectural/product intent that emerged: assumptions are the *runtime correlate* of empowerment-score gaps. Scoring tells you what is missing; assumptions tell you what the agent will silently substitute when something is missing. Together they form a feedback loop between authoring (compile-time) and operation (runtime).

## 2. Current State

**Nothing implemented.** This was a pure design conversation.

- No files created, modified, deleted.
- No commits, no branches, no tests run.
- Working tree clean on `main` (per session-start git status).
- The design sketch lives only in this handoff and in the prior conversation transcript.

What is "working" is the conceptual fit: the proposed `Assumption` entity slots cleanly into the existing pipeline types in [packages/core/src/pipeline/types.ts](../../packages/core/src/pipeline/types.ts) (`LayerCandidate`, `ResolvedLayer`, `CompiledInstructionBundle`, `PipelineResult`, `TransformationLog`) without requiring schema-wide changes.

What is incomplete / still uncertain:
- Severity policy for `staipler ci` (block vs warn — see open questions below).
- Runtime emission protocol — Claude Code hook first vs vendor-neutral schema first.
- Whether `agent-inferred` (post-hoc transcript scanning) is worth shipping at all, or whether explicit `agent-emit` is the only honest path.
- How `assumptionRisk` rolls up into the existing empowerment score, if at all. Possibly a separate "Assumption Risk" letter grade alongside the existing 0–100 score, to avoid double-counting gaps.

## 3. Important Context Learned

### Proposed data model (sketch — not yet code)

`Assumption` is a first-class cross-cutting entity:

```ts
export interface Assumption {
  id: string;
  projectId: string;

  // What the agent assumed (or will assume)
  statement: string;              // "Treats all customer emails as non-PII"
  defaultUsed: string;            // "permissive — no PII redaction applied"

  // Where it lives in the instruction surface
  layer: LayerType;               // which layer this gap belongs to
  bundleHash: string | null;      // bundle this was predicted/observed against

  // How it got here
  origin: 'static' | 'runtime';
  detectedBy:
    | 'analyzer-gap'              // static: layer empty/under-specified
    | 'analyzer-ambiguity'        // static: contradictory or vague spans
    | 'agent-emit'                // runtime: agent explicitly flagged
    | 'agent-inferred';           // runtime: post-hoc detection from trace

  // Lifecycle — the part that closes the loop
  status:
    | 'predicted'                 // static, before agent runs
    | 'observed'                  // runtime, agent acted on it
    | 'confirmed'                 // user said "yes, do that"
    | 'rejected'                  // user said "no, do this instead"
    | 'codified';                 // promoted into a layer; gap closed

  // Risk surface
  severity: 'info' | 'caution' | 'blocker';
  rationale: string;              // why this matters

  // Provenance
  evidence: AssumptionEvidence;
  resolution: AssumptionResolution | null;

  createdAt: string;
  resolvedAt: string | null;
}

export type AssumptionEvidence =
  | { kind: 'static'; bundleSection: LayerType; missingFrom: LayerType[] }
  | { kind: 'runtime'; sessionId: string; trigger: string; turnIndex: number };

export interface AssumptionResolution {
  decision: 'accept-as-policy' | 'override' | 'ignore';
  codifiedTo: { layer: LayerType; candidateId: string } | null;
  decidedBy: string;
  decidedAt: string;
}
```

### Pipeline integration points (additive only)

Extend the existing types in [packages/core/src/pipeline/types.ts](../../packages/core/src/pipeline/types.ts):

```ts
// in PipelineResult
predictedAssumptions: Assumption[];   // status: 'predicted', from analyzer

// in CompiledInstructionBundle
assumptionRisk: {
  blockers: number;
  cautions: number;
  byLayer: Record<LayerType, number>;
};
```

### Runtime emission protocol (proposed)

One event shape, agent emits at moments of hedging:

```ts
export interface AssumptionEvent {
  type: 'staipler.assumption';
  statement: string;
  defaultUsed: string;
  layer: LayerType;
  trigger: string;                // what the agent was about to do
  severity?: 'info' | 'caution' | 'blocker';
}
```

Carriers (in preferred order): structured stdout JSON line → IDE hook payload → SDK helper call. The existing events module at [packages/core/src/events/](../../packages/core/src/events/) is the natural home; it already has `bus.ts` and `sinks.ts`. Hook into the [Knowledge Pipeline v1](../../packages/core/) IDE-hook spec rather than inventing a new carrier.

### Rules of thumb / constraints to respect

- **Optimizer role constraint** (from [user memory](/Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_optimizer_role.md)): the optimizer is a gap-filler, not the primary author of foundational layers when source material exists. **Implication for this feature:** when an assumption is `confirmed → codified`, the new `LayerCandidate` must have origin `user-confirmation`, NOT be routed through the optimizer. The optimizer is the wrong tool for capturing user-stated policy.
- **Visibility requirement** (from [CLAUDE.md](../../CLAUDE.md)): the assumption lifecycle (predicted → observed → confirmed/rejected → codified) must be visible to the user in real time. Surfacing only the final list of unresolved assumptions is not enough — the codification step in particular must be auditable.
- **Connectors are evidence pipelines, not importers.** Same posture applies here: assumptions carry provenance (`evidence` field above) so the user can trace any assumption back to the under-specified bundle section or the runtime turn that triggered it.
- **Honest disagreement preferred** (from [feedback_pushback](/Users/robertflanagan/.claude/projects/-Users-robertflanagan-development-Firedock-stAIpler/memory/feedback_pushback.md)): Robert explicitly wants pushback on the two open questions below rather than passive deferral. Form an opinion and defend it.

### Anti-patterns to avoid

- **Don't add a 13th layer type.** That was considered and rejected. The 12-layer taxonomy is stable; assumptions are orthogonal.
- **Don't auto-codify without user confirmation.** Codification is the trust-bearing action; it must be explicit.
- **Don't make `agent-inferred` (transcript scanning) the primary detection path.** It has low precision and undermines the honesty of the surface. It is acceptable only as a fallback when `agent-emit` is unavailable.
- **Don't conflate `assumptionRisk` with the existing empowerment score** without an explicit design decision. Double-counting the same gap in two metrics is a credibility hit.

## 4. Next Recommended Focus

In practical order:

1. **Get Robert's call on the two open questions** (see Section 5). Both are blocking for an implementation plan. Do not start coding without resolving question #1 — it changes the CI contract.
2. **Wire the static path first.** Concretely:
   - Add `Assumption`, `AssumptionEvidence`, `AssumptionResolution` types to [packages/core/src/pipeline/types.ts](../../packages/core/src/pipeline/types.ts).
   - Extend `PipelineResult.predictedAssumptions` and `CompiledInstructionBundle.assumptionRisk`.
   - Build the analyzer step: walk `ResolvedLayer[]`, for each gap/weak layer produce a `predicted` `Assumption` with a layer-specific `defaultUsed` string (e.g. for missing `policies` → "permissive defaults; no compliance gating"). The 12 layer types in [packages/core/src/types.ts](../../packages/core/src/types.ts) are the enumeration to drive this off.
   - Surface assumptions in the existing `staipler watch` and `staipler ci` outputs before building any UI.
3. **Add a single end-to-end test** that takes a deliberately under-specified bundle (missing `policies`, `constraints`) and asserts the analyzer emits the expected `predicted` assumptions with correct `severity` and `layer` fields. Follow the existing vitest patterns — there are 121 tests across 11 files; mirror their shape.
4. **Design (don't yet build) the codification flow.** Specifically: when a user accepts an assumption as policy, where does the new `LayerCandidate` get persisted? Likely the `layer_candidates` table — verify the schema in [packages/core/src/schema.ts](../../packages/core/src/schema.ts) accommodates an `origin: 'user-confirmation'` value, or whether that needs a migration.
5. **Then runtime.** Define the `AssumptionEvent` shape in the events module, add a sink that persists events as `observed` Assumptions, and prototype the Claude Code hook integration. Defer vendor-neutral schema until there's real traffic to validate against.

What the next agent should inspect first:
- [packages/core/src/pipeline/types.ts](../../packages/core/src/pipeline/types.ts) — the data model to extend.
- [packages/core/src/types.ts](../../packages/core/src/types.ts) — `LayerType` enum the assumption analyzer drives off.
- [packages/core/src/schema.ts](../../packages/core/src/schema.ts) — confirm what tables need to grow (likely a new `assumptions` table, plus a candidate-origin enum extension).
- [packages/core/src/events/](../../packages/core/src/events/) — the carrier for runtime emission.
- The existing empowerment-score implementation (search for "empowerment" in `packages/core`) — to understand whether `assumptionRisk` should feed it or stand alone.

## 5. Known Issues / Risks

### Open questions (BLOCKING for implementation)

1. **Should `predicted` assumptions with `severity: 'blocker'` fail `staipler ci`, or only warn?**
   My recommendation: **fail.** It mirrors the existing empowerment-gate posture and makes the "rails" half of the feature real rather than cosmetic. The counterargument is that this could be very noisy on existing projects that have low empowerment scores (the current project itself is 60/100 D — would immediately have multiple blockers). Mitigation: ship as `warn` for one release, then flip to `block` once teams have a chance to codify the noisy assumptions.

2. **Runtime emission: Claude Code hook first, or vendor-neutral schema first?**
   My recommendation: **Claude hook first.** Robert's stack is Claude-centric (memory confirms heavy Claude Code use). Generalize once we have real assumption traffic to validate the schema against. Designing vendor-neutral upfront risks bikeshedding without data.

### Architectural risks

- **`assumptionRisk` vs empowerment score overlap.** If a missing `policies` layer already costs ~8 points in the empowerment score *and* produces 3 `blocker` assumptions, the user is being penalized twice for the same gap. Decide whether assumptions are a *view* over the existing scoring or an *additive* signal before shipping the UI.
- **`agent-inferred` detection is a credibility trap.** Inferring assumptions from transcripts post-hoc will produce false positives that undermine user trust in the whole surface. Consider deferring it indefinitely.
- **Codification permanence.** Once a `confirmed` assumption is promoted to a `LayerCandidate`, what undo path exists? If the user changes their mind, can they de-codify? This needs UX thought before the codification flow ships.
- **Severity calibration.** `info | caution | blocker` is a guess. Without examples, severity will be assigned inconsistently. Recommend defining 3–5 worked examples per layer in code comments before the analyzer ships.

### Edge cases worth validating

- An assumption that spans two layers (e.g. missing both `policies` AND `constraints` produces correlated assumptions about PII handling). Deduplication strategy is undefined.
- An assumption that is *resolved* but the underlying layer later gets a source-grounded candidate that contradicts the codified resolution. Conflict resolution path is undefined — likely reuses `ConflictRecord` from the pipeline types, but needs verification.

## 6. Testing / Verification

No commands were run this session. The working tree was clean at session start and remains clean.

Recommended commands before any code changes:

```bash
pnpm build                # confirm baseline builds
pnpm test                 # baseline: 121 tests across 11 files should pass
pnpm --filter @staipler/core test   # focused, faster iteration
```

When the analyzer step is added, the new test should live alongside the existing pipeline tests (search `packages/core/src/pipeline/` and adjacent test files for the convention — this handoff did not enumerate them).

## 7. Files and References

### Files central to this design (not yet modified)

- [packages/core/src/pipeline/types.ts](../../packages/core/src/pipeline/types.ts) — where `Assumption`, `AssumptionEvidence`, `AssumptionResolution` will live, and where `PipelineResult` and `CompiledInstructionBundle` will be extended.
- [packages/core/src/types.ts](../../packages/core/src/types.ts) — defines `LayerType` (12 static + 2 runtime layers); drives the assumption analyzer's enumeration.
- [packages/core/src/schema.ts](../../packages/core/src/schema.ts) — likely needs an `assumptions` table and a candidate-origin enum extension (`'user-confirmation'`).
- [packages/core/src/events/bus.ts](../../packages/core/src/events/bus.ts) and [packages/core/src/events/sinks.ts](../../packages/core/src/events/sinks.ts) — carrier for runtime `AssumptionEvent` emission.
- [packages/core/src/pipeline/extract.ts](../../packages/core/src/pipeline/extract.ts), [organize.ts](../../packages/core/src/pipeline/organize.ts), [compile.ts](../../packages/core/src/pipeline/compile.ts) — the static analyzer step needs to run after `organize` and before/within `compile` to populate `predictedAssumptions`.
- [packages/core/src/optimizer/](../../packages/core/src/optimizer/) — do NOT route codification through here (see optimizer role constraint).

### Reference docs

- [CLAUDE.md](../../CLAUDE.md) — Total Visibility Requirement and pipeline architecture overview.
- [docs/handoffs/2026-04-22-staipler-continuity-layer.md](./2026-04-22-staipler-continuity-layer.md) — most recent prior handoff; useful for understanding the runtime-layer pattern that `Assumption` partially mirrors.
- User memory (auto-loaded for next session):
  - `feedback_visibility.md` — total visibility requirement.
  - `feedback_optimizer_role.md` — optimizer is gap-filler only, not author.
  - `project_evidence_pipeline.md` — connectors as evidence pipelines, provenance model.
  - `feedback_pushback.md` — Robert wants honest disagreement on the open questions.

### What is NOT in scope for the next session

- UI work in `packages/web`. The static analyzer + CLI surface is the minimum viable visibility surface; UI follows.
- The runtime path beyond a written protocol spec. Static must ship and be in use before runtime work begins.
- Any change to the empowerment score formula itself. Until question 5.1 (overlap with `assumptionRisk`) is resolved, leave the score untouched.
