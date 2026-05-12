---
session_date: 2026-05-11
created_utc: 2026-05-11T17:39
thread: cmc-comparison
status: research-only, no code written
---

# Handoff — Comparative Review: stAIpler vs claude-memory-compiler

## 1. Session Summary

Robert asked for a comparative review of stAIpler against [coleam00/claude-memory-compiler](https://github.com/coleam00/claude-memory-compiler) (referred to as **CMC** below) — strengths, weaknesses, and how the two products differ.

The session was research-only. No source files were modified. The output was a written comparison delivered in chat, summarized below for the next agent.

**Major findings:**

- **CMC and stAIpler solve overlapping but distinct problems.** CMC is a single-user Python tool that compiles *Claude Code session transcripts* into a personal markdown knowledge base (Karpathy LLM-KB pattern). stAIpler is a TS/Next.js platform that compiles *any* source material into a structured 12-layer agent instruction bundle with an Empowerment Score and a visible 4-stage evidence pipeline.
- **CMC has one capability stAIpler lacks today: an automatic capture loop.** Claude Code `SessionEnd` / `PreCompact` hooks trigger `flush.py`, which uses the Claude Agent SDK to extract decisions/lessons into a daily log; `compile.py` then turns daily logs into concept/connection/qa articles; the index is injected into the next session via `SessionStart`.
- **stAIpler's structural advantages are real but undermined by lack of continuous ingress.** Typed layers, provenance, conflict resolution, scoring, web visibility — none of it matters if there is no live source feed. Today stAIpler is pull-based (user uploads sources); CMC is push-based (conversations flow in).
- **The strategic implication**: CMC is best treated as a **reference implementation for a Claude Code connector** that stAIpler does not yet have. Its hook → daily log → compile shape maps directly onto stAIpler's Ingestion → Extraction → Organization → Compilation pipeline. A session-capture connector would emit `LayerCandidate[]` with provenance, closing the loop the architecture was designed for.

No product or architectural decisions were made — the discussion was diagnostic.

## 2. Current State

**Nothing implemented.** This was a comparative review delivered as chat output only.

Files touched in this session:
- `docs/handoffs/HANDOFF-claude-memory-compiler-comparison-2026-05-11T1739.md` — this handoff (new)
- `docs/handoffs/INDEX.md` — appended a row pointing to this handoff

No code, schemas, tests, or configuration changed.

## 3. Important Context Learned

**About CMC (so the next agent doesn't need to re-fetch it):**

- Repo: `coleam00/claude-memory-compiler`. Python project managed with `uv`. Two top-level dirs: `hooks/` and `scripts/`. Entry points: `scripts/compile.py`, `scripts/query.py`, `scripts/lint.py`, plus `flush.py` invoked by hooks.
- Activation: drop `.claude/settings.json` (or merge hooks) into any project; Claude Code's `SessionEnd` and `PreCompact` events fire `flush.py` in the background.
- Output layout: `daily/YYYY-MM-DD.md` raw logs → `knowledge/concepts/`, `knowledge/connections/`, `knowledge/qa/` compiled articles → `index.md` that gets injected into future sessions.
- Retrieval philosophy: **no RAG.** At personal scale (50–500 articles) the LLM reading a structured index outperforms vector similarity. RAG only justified beyond ~2,000 articles.
- Cost model: runs on the user's Claude subscription via the Claude Agent SDK — no separate API billing. This is a meaningful go-to-market advantage CMC explicitly contrasts against "OpenClaw."
- Lint: 7 health checks (broken links, orphans, contradictions, staleness). This is closest CMC has to a quality signal — no scoring.
- The README explicitly cites Karpathy's gist as the architectural inspiration.

**About the stAIpler ↔ CMC mapping (the key insight to preserve):**

| stAIpler concept | CMC equivalent |
|---|---|
| Ingestion stage | `SessionEnd` / `PreCompact` hook + transcript capture |
| Extraction → LayerCandidate[] | `flush.py` Agent-SDK-driven extraction into daily log |
| Organization → ResolvedLayer[] | `compile.py` clustering into concept articles |
| Compilation → InstructionBundle | `index.md` generation injected via `SessionStart` |
| Empowerment Score | (no equivalent — CMC has only lint health checks) |
| Provenance + conflict resolution | (no equivalent — CMC cross-references but doesn't reconcile) |
| 12-layer taxonomy | Freeform concepts/connections/qa |
| `qa/` articles | Closest analog to stAIpler `examples` layer |
| Daily logs | Closest analog to stAIpler `memory` layer |

**Rules of thumb learned this session:**

- **Do not pitch stAIpler as a CMC competitor.** They are in different categories (platform vs single-user tool). Framing as competitor obscures the actual opportunity, which is reuse of CMC's ingress pattern.
- **The capture loop is what's missing, not the structure.** stAIpler's typed layers and scoring are genuine differentiators. The gap is ingress, not output.
- **CMC validates a subscription-covered Agent-SDK execution path.** If stAIpler's optimizer or session-connector ever runs locally, this is a viable cost model worth mirroring.
- Per existing memory `project_heuristic_handoff.md`, stAIpler has already designed something conceptually adjacent (handoff system with confidence/provenance/decay). CMC ships a simpler version of that idea today — useful as proof-of-life, not as a replacement for the heuristic-handoff design.

## 4. Next Recommended Focus

In priority order:

1. **Decide whether stAIpler should ship a Claude Code session connector.** This is the highest-leverage takeaway. The architecture (`packages/core/src/pipeline/`) already supports it — the connector would need to:
   - Register Claude Code hooks (`SessionEnd`, `PreCompact`, `SessionStart`).
   - Emit `SourceDocument` rows from session transcripts.
   - Run extraction into `LayerCandidate[]` with `origin: claude-code-session` and snippet-level provenance.
   - Let Organization/Compilation handle the rest of the pipeline — no parallel storage like `daily/`.
   - On `SessionStart`, surface the compiled bundle (or a diff vs last session) into the agent context. This integrates with the existing `staipler inject` flow rather than competing with it.
2. **Cross-reference the [Continuity Layer](2026-04-22-staipler-continuity-status-injection.md) work.** A session connector overlaps with the continuity/handoff thread — coordinate so they don't ship duplicate ingress paths. The continuity layer reads `docs/handoffs/*.md`; a session connector would read raw transcripts. Decide whether they are sibling connectors or one consumes the other.
3. **Inspect `packages/core/src/pipeline/` first** before any implementation — the `SourceDocument` / `LayerCandidate` / `ResolvedLayer` contracts are the integration surface. Per `feedback_adapter_contracts` memory, do not let a new connector reach into analyzer/pipeline internals; it must produce data that lands at the public pipeline boundary.
4. **Sanity-check the Empowerment Score irony.** CLAUDE.md still reports 60/D with `evals, examples, memory, policies, prompts, tools` missing. If a session connector produces `memory`-layer and `examples`-layer (`qa`-style) candidates, this directly remediates two of the six missing layers. Verify the score will actually move before promising it will.
5. **Do not adopt CMC's `query.py` / no-RAG retrieval discussion as a stAIpler concern.** stAIpler injects the compiled bundle into agent config; it doesn't run interactive retrieval against the bundle. That conversation belongs to CMC's product, not ours.

## 5. Known Issues / Risks

- **Scope creep risk.** A "session connector" can balloon into a parallel system if it grows its own storage, retrieval, and UI surfaces. Keep it confined to the connector contract: in = transcript, out = `LayerCandidate[]`. Anything beyond that belongs in the existing pipeline stages.
- **Hook ergonomics.** CMC ships `.claude/settings.json` for users to merge. stAIpler would need to do the same; merging into a user's existing `settings.json` is a known sharp edge (collision with other tools' hooks). Plan for non-destructive merge.
- **Privacy / sensitivity.** Session transcripts contain raw user prompts and secrets that source-document connectors don't. Any candidate produced from a transcript must be reviewable before it lands in the compiled bundle — provenance is not optional here, it is the gating control.
- **Verification gap.** I read CMC's README and listed the repo contents via `gh api`, but did not read `AGENTS.md`, `scripts/*.py`, or `hooks/*` line-by-line. The mapping table in §3 is from the README's "How It Works" diagram, not from a code-level review. Before implementing anything CMC-shaped, the next agent should read `AGENTS.md` (18kB) and the actual hook + script code.
- **Claim about "no RAG" is restated from CMC's README**, not independently evaluated. It's plausible but not load-bearing for stAIpler decisions.
- **The Empowerment Score (60/D) is from CLAUDE.md dated 2026-04-12.** It may be stale. Verify before citing it externally.

## 6. Testing / Verification

No tests were run. No code changed. Nothing to verify from this session itself.

Recommended commands the next agent should run **before** acting on any of §4:

- `pnpm test` — confirm 260/260 still green (per last continuity-layer handoff).
- `pnpm build` — confirm clean build state on `main`.
- `git log --oneline -20` — recent commits are mostly continuity-layer + CLI/web bridge work; check nothing collides with a connector plan.
- `gh api repos/coleam00/claude-memory-compiler/contents/AGENTS.md --jq .content | base64 -d` — read the full CMC technical reference before designing the connector.
- `gh api repos/coleam00/claude-memory-compiler/contents/scripts` and `gh api repos/coleam00/claude-memory-compiler/contents/hooks` — list the actual script and hook files before drawing further parallels.

## 7. Files and References

**Internal (stAIpler):**

- `CLAUDE.md` — project instructions, current Empowerment Score (60/D), Visibility Requirement, Evidence Pipeline architecture. Source of truth for the 12-layer taxonomy.
- `packages/core/src/pipeline/` — 4-stage pipeline implementation. Where a session connector would integrate.
- `docs/handoffs/2026-04-22-staipler-continuity-status-injection.md` — continuity layer Phase 2. Overlaps with any session-connector work; read before designing.
- `docs/handoffs/HANDOFF-cli-web-bridge-2026-05-11-1733.md` — recent CLI/web push bridge scoping. A session connector may want to share the `/api/cli/push` ingress.
- `docs/handoffs/HANDOFF-assumptions-visibility-design-2026-05-12T0032.md` — assumptions feature design. Relevant because both that thread and CMC are about closing the loop between agent runtime and authored layers.
- Memory: `project_evidence_pipeline.md`, `project_heuristic_handoff.md`, `feedback_optimizer_role.md`, `feedback_adapter_contracts.md`, `feedback_visibility.md` — load-bearing constraints for any connector design.

**External (CMC):**

- `https://github.com/coleam00/claude-memory-compiler` — repo root.
- `https://github.com/coleam00/claude-memory-compiler/blob/main/AGENTS.md` — full technical reference (18kB). **Read this before implementing anything CMC-shaped.**
- `https://github.com/coleam00/claude-memory-compiler/blob/main/README.md` — high-level pitch (only thing I read in full this session).
- `https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f` — Karpathy's LLM Knowledge Base architecture, cited by CMC as inspiration.
- `https://github.com/anthropics/claude-agent-sdk` — the SDK CMC uses for extraction; the same SDK a stAIpler session connector would use.
