# IDE Hooks — v1 Spec

> **stAIpler captures agent sessions via pluggable adapters, compiles durable knowledge, and injects approved delivery bundles back into future sessions. Adapters are the only provider-specific surface; the core pipeline is platform-agnostic.**

This is the first law. If any API path, schema column, or UI surface bakes a provider name into the core, the leak blocks merge. Claude Code is the only adapter shipped in this spec, and the word "Claude" appears exclusively inside the adapter package.

---

## 1. Sub-laws (all seven hold)

1. Hooks only capture immutable evidence.
2. All derived artifacts are replayable from raw ingest.
3. IDE injection always resolves through a versioned release artifact.
4. Source digest and compiled knowledge are separate trust tiers.
5. Project binding must be explicit. Unbound repos refuse capture.
6. Redaction occurs client-side first, server-side second.
7. Contradictions generate review evidence, not silent rollbacks.

---

## 2. Platform Vocabulary (locked)

**Event types** (every adapter maps its native hooks to exactly these four):

- `session_open` — adapter is about to hand a fresh session to the agent; may request a delivery bundle
- `session_close` — adapter has a completed transcript ready to hand off
- `context_pressure` — adapter's platform is about to compact or drop context
- `subtask_close` — a sub-agent or nested task completed

**Stage keys** (10 stages, 2 domains — see §5 for the run ledger):

| Domain | Stage keys (in order) |
|---|---|
| `ingestion` | `capture` → `redact` → `normalize` → `release_render` |
| `knowledge` | `extract` → `reconcile` → `review_queue` → `promote` → `article_render` → `injection_decision` |

**Release kinds:**

- `source_digest` — compact bundle of the project's existing source_documents; trusted by virtue of being grounded in user-managed files
- `knowledge` — compiled atoms bundle; trusted by virtue of user-controlled canonization

Same `ide_releases` table, different `kind` discriminator, different trust tiers, different UI treatment.

---

## 3. Adapter Contract

Every adapter ships two halves, independent of the core. `packages/adapters/<name>/` is the only place provider-specific names appear in code.

**Capture side.**
Listens to native hooks. For each event, produces a generic envelope and POSTs to `/api/ide/captures`:

```
{
  source_family: string,        // 'claude_code', 'cursor', 'mcp_generic', ...
  adapter_version: string,      // semver of the adapter that produced this
  event_type: 'session_open' | 'session_close' | 'context_pressure' | 'subtask_close',
  external_session_id: string,  // stable per provider session; enables idempotency
  project_id: uuid,             // resolved via binding (§7)
  transcript_fragment: string,  // raw or redacted payload
  provider_metadata: jsonb,     // adapter-specific extras; never read by core
  raw_payload_hash: string      // sha256 of transcript_fragment pre-redaction
}
```

Adapter owns: format parsing, client-side redaction using platform-known secret patterns, project binding lookup, idempotency via `external_session_id`.

**Delivery side.**
When its platform asks for context at `session_open`, the adapter calls `GET /api/ide/releases/active?project_id=X`, formats the returned bundle into the platform's injection surface (Claude Code's `additionalContext` return, an MCP resource, a file preamble, etc.), and returns it.

Adapter owns: platform-specific delivery format only.

Core never knows it's talking to Claude Code. Adapter never knows how atoms are compiled.

---

## 4. Hook Contract (Capture Side)

A capture hook is a one-transaction operation:
1. Open an `external_capture_batches` row (immutable).
2. Enqueue an `external_capture_jobs` row pointing at the batch.
3. Return `202 Accepted` with the batch id.

No normalization, no extraction, no release rendering in the hook path. The hook fails fast or succeeds fast. Everything else is a worker.

---

## 5. Run Ledger

**One table, two domains, no hard enum.** The existing `knowledge_pipeline_runs` is extended:

```sql
alter table knowledge_pipeline_runs
  add column if not exists domain text not null default 'knowledge'
    check (domain in ('ingestion', 'knowledge')),
  add column if not exists stage_order integer,
  add column if not exists retry_count integer not null default 0,
  add column if not exists locked_by uuid,
  add column if not exists locked_at timestamptz;

-- Relax the existing CHECK so new stage_keys can be added in code without migrations.
alter table knowledge_pipeline_runs drop constraint if exists knowledge_pipeline_runs_stage_check;
alter table knowledge_pipeline_runs rename column stage to stage_key;

-- Rename existing v1 stage_keys to the final vocabulary.
update knowledge_pipeline_runs set stage_key = 'review_queue'        where stage_key = 'review';
update knowledge_pipeline_runs set stage_key = 'article_render'      where stage_key = 'render';
update knowledge_pipeline_runs set stage_key = 'injection_decision'  where stage_key = 'inject';
```

Validation of `stage_key` values moves to application code (a small registry keyed by `domain`). A lookup table can replace the registry later without a schema migration when the list stabilizes.

The pipeline panel renders all runs from this one table, grouped into two visual bands (Ingestion / Knowledge) ordered by `stage_order`. Users see one timeline.

---

## 6. Schema Additions

```sql
-- 1. External capture batches — immutable ingest ledger
create table if not exists external_capture_batches (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  source_family text not null,              -- 'claude_code' for v1
  adapter_version text not null,
  event_type text not null check (event_type in (
    'session_open', 'session_close', 'context_pressure', 'subtask_close'
  )),
  external_session_id text not null,        -- idempotency key with source_family
  raw_payload_hash text not null,           -- sha256 of pre-redaction transcript
  transcript_blob text,                     -- post-redaction transcript, inline for v1
  provider_metadata jsonb not null default '{}',
  redaction_report jsonb not null default '{}',   -- {"scrubbed": [...], "server_flagged": [...]}
  format_version text not null,             -- adapter's transcript format version
  received_at timestamptz default now(),
  unique (source_family, external_session_id, event_type)
);

create index if not exists external_capture_batches_project_idx
  on external_capture_batches(project_id, received_at desc);

-- 2. Normalized events — per-message rows derived from a batch
create table if not exists external_capture_events (
  id uuid default gen_random_uuid() primary key,
  batch_id uuid references external_capture_batches(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  sequence integer not null,
  role text not null check (role in ('user', 'assistant', 'tool', 'system')),
  content_type text not null,               -- 'text', 'tool_use', 'tool_result', ...
  content text,
  provider_metadata jsonb not null default '{}',
  occurred_at timestamptz,
  unique (batch_id, sequence)
);

-- 3. Job queue — one row per pipeline advance from a batch
create table if not exists external_capture_jobs (
  id uuid default gen_random_uuid() primary key,
  batch_id uuid references external_capture_batches(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  next_stage_key text not null,             -- 'redact' | 'normalize' | 'extract' | ...
  status text not null default 'pending'
    check (status in ('pending', 'running', 'succeeded', 'failed', 'cancelled')),
  attempts integer not null default 0,
  locked_by uuid,
  locked_at timestamptz,
  available_at timestamptz default now(),   -- enables delayed retries
  last_error text,
  created_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists external_capture_jobs_ready_idx
  on external_capture_jobs(status, available_at) where status = 'pending';

-- 4. IDE releases — versioned delivery bundles
create table if not exists ide_releases (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  kind text not null check (kind in ('source_digest', 'knowledge')),
  release_hash text not null,               -- content-addressable; format: 'ir_<date>_<short>'
  body_md text not null,
  token_estimate integer not null default 0,
  atom_ids uuid[] not null default '{}',    -- empty for source_digest kind
  source_document_ids uuid[] not null default '{}',  -- empty for knowledge kind
  status text not null default 'candidate'
    check (status in ('candidate', 'active', 'frozen', 'superseded')),
  health_checks jsonb not null default '{}', -- {"token_budget": true, ...}
  activated_at timestamptz,
  activated_by uuid references auth.users(id) on delete set null,
  frozen_at timestamptz,
  created_at timestamptz default now(),
  unique (project_id, release_hash)
);

create index if not exists ide_releases_project_status_idx
  on ide_releases(project_id, kind, status);

-- 5. Atom capture provenance (first-class identity fields)
alter table knowledge_atoms
  add column if not exists capture_batch_id uuid references external_capture_batches(id) on delete set null,
  add column if not exists repo_fingerprint text,
  add column if not exists source_family text,
  add column if not exists adapter_version text,
  add column if not exists extractor_version text,
  add column if not exists redaction_count integer default 0;
```

RLS on all new tables follows the existing project-owner pattern.

---

## 7. Project Binding

Two modes, explicit precedence:

1. `.staipler` marker file in the repo (explicit, version-controllable, team-shared)
   ```yaml
   project_id: abc-123-uuid
   adapter_policy:
     exclude_paths: [.env, secrets/, vendor/]
     exclude_subagents: []
   ```
2. `~/.staipler/registry.json` — machine-local CWD → project_id mapping (used when the project_id cannot be in the repo)

Precedence: marker file wins when both exist. Mismatch between marker and registry logs a warning but trusts the marker.

**Refuse on unbound.** If neither resolves, the CLI exits non-zero with a clear error. Hooks never silently create projects, never post unbound captures.

---

## 8. Release Activation & Health

A release is born `candidate` on every successful `release_render` run. Only `active` releases are served by `GET /api/ide/releases/active`.

**Activation is blocked if any of these is true:**

1. `body_md` exceeds the layer token budget (default 800 for knowledge releases, 1200 for source_digest releases).
2. The `release_render` run that produced it has `status = 'failed'` or recorded any uncaught parser error.
3. The incoming release includes any atom (in `atom_ids`) that has unresolved contradiction evidence:
   - `atoms.status = 'contradicted'`, OR
   - a `similar_detected` event whose peer atom is also in `atom_ids` and neither atom has been approved/merged since the event
4. A `frozen` release with an identical `release_hash` exists for this project (kill-switch was used on this exact content).

Each check writes its result into `ide_releases.health_checks`. All four must be `true` for activation.

**Activation modes** (per project):

- **Manual (default).** First activation is always a human gesture. Subsequent releases stay `candidate` until a human clicks activate.
- **Auto (opt-in).** After the first manual activation, the user may opt the project into auto-activation. Subsequent renders auto-activate only if all four health checks pass. Otherwise they stay `candidate` with check failures visible. Auto-activation never bypasses a health check.

**Kill switch.** One click freezes the currently-active release (`status = 'frozen'`), marks its `frozen_at`, and flips the project back to manual mode. Served bundles fall back to the prior `active` release; if none exists, `GET /api/ide/releases/active` returns 204.

**Canary tagging.** Every capture batch received while a release is active records that release's hash on the batch. Contradictions surfaced in later sessions attribute back to the release under which they were captured — evidence, not automatic rollback.

---

## 9. Redaction

**Client side (adapter).** Before bytes leave the machine:
- Regex sweep for high-confidence secret patterns: `sk-*`, `ghp_*`, AWS key shapes, `-----BEGIN * PRIVATE KEY-----`, high-entropy `.env` assignments.
- Scrubbed spans replaced with `[REDACTED:api_key]` style markers preserving structure.
- Count and categorization recorded into `redaction_report.scrubbed`.

**Server side (core).** Second sweep as defense-in-depth:
- Same patterns plus optional tenant-specific patterns (v1.1).
- Hits are flagged into `redaction_report.server_flagged` but do not block ingest.
- Server-flagged batches surface in the provenance UI for user review.

**Dry-run mode.** `staipler kb capture --dry-run` runs the full capture path (parse, redact, normalize) against stdin and prints the redaction report + proposed batch without any DB writes. Ships in Slice 1.

---

## 10. CLI Surface

```
staipler kb link   [--adapter=NAME] [--project-id=ID]
staipler kb capture [--adapter=NAME] [--dry-run]
staipler kb status
staipler kb unlink [--adapter=NAME]
```

`--adapter` is required whenever more than one adapter is installable. Default: `claude-code` when `.claude/` exists in CWD. Always accepted, always respected.

Adapter selection is explicit, not magic. Second adapters are a new `packages/adapters/<name>/` package + one new installer module; no core changes.

---

## 11. Slices

### Slice 1 — capture + source_digest delivery (`knowledge-ide-capture` branch)

**Schema:** external_capture_batches, external_capture_events, external_capture_jobs, ide_releases (with `kind = 'source_digest'` only). Knowledge atoms gain capture provenance columns (nullable — zero impact on v1).

**Adapter (Claude Code):** Stop hook → `session_close` event; SessionStart hook → request bundle, inject `source_digest` release. PreCompact / SubagentStop out of scope for this slice.

**Core:** `POST /api/ide/captures` (202 fast-return), `GET /api/ide/releases/active`. Worker drains `external_capture_jobs` (Postgres-backed; polling worker inside the Next.js process for v1, graduated to a dedicated worker later).

**UI:** Pipeline panel grows to 10 stages in two bands (Ingestion / Knowledge). Atom cards show capture provenance when present. Release panel lists releases with kind, status, health checks. First activation is manual and visible.

**CLI:** `kb link`, `kb capture`, `kb capture --dry-run`, `kb status`, `kb unlink`.

**Redaction:** client + server as specified in §9.

**Acceptance:**
- Stop hook in a bound repo produces exactly one `external_capture_batches` row and one `external_capture_jobs` row in under 500ms.
- Unbound repo: hook exits non-zero with a human-readable error and does not write any rows.
- Dry-run against a real transcript prints a redaction report and proposed batch; no rows written.
- SessionStart hook returns a `source_digest` bundle with the active release's `release_hash` on a visible first line of the bundle.
- Kill switch freezes the active release; next SessionStart returns the prior active bundle (or 204 if none).

### Slice 2 — knowledge releases (`knowledge-ide-releases` branch)

**Schema:** `ide_releases.kind = 'knowledge'` becomes usable; no new tables.

**Core:** `release_render` stage (ingestion domain) produces `knowledge` releases from stable + pinned-provisional atoms. Health checks run before activation. Canary tagging on captures. Contradiction attribution in the review queue.

**UI:** Auto-activation opt-in per project. Release diff view showing atom_ids added/removed vs prior active release. Contradicted atoms surface the release hash under which they were captured.

**Acceptance:**
- Promoting a new atom to stable produces a `candidate` knowledge release; manual activation flips it to `active`; next SessionStart serves it.
- A release that includes two near-duplicate atoms both still pending review has health check #3 fail and cannot auto-activate.
- Kill switch on a knowledge release rolls forward to the most recent prior active release (could be `source_digest` or `knowledge`).

### Slice 3 — PreCompact handoffs (`knowledge-ide-handoffs` branch)

**Adapter:** PreCompact hook → `context_pressure` event. Adapter synthesizes a handoff-shaped payload from the soon-to-be-compacted context.

**Core:** `context_pressure` events produce `session_handoffs` rows (existing table, extended with a `capture_batch_id` FK). Handoffs then become atom candidates through the normal extract pathway.

**Acceptance:** A PreCompact event under a bound project produces one handoff row and one atom candidate with `source_authority = 'mixed'` and the decayed handoff content as provenance.

---

## 12. Explicitly Out of Scope for v1 of IDE Hooks

- Adapters other than `claude_code` (cursor, vscode_copilot, mcp_generic).
- UserPromptSubmit retrieval-time injection.
- PostToolUse auto-reingestion of edited source_documents.
- MCP delivery channel.
- Per-atom `eligible_for_ide` trust flag (the release-based trust boundary subsumes this for v1).
- Team / multi-user release approval workflows.
- Release signing / cryptographic attestation.
- Blob storage offload for `transcript_blob` (kept inline for v1).

Each is re-evaluated after a slice ships and produces usage data.

---

## 13. Migration from Knowledge v1

One migration file lands before Slice 1:

`packages/web/supabase/migrations/ide-hooks-v1-run-ledger.sql`
- ALTER `knowledge_pipeline_runs`: drop CHECK on stage, rename `stage` → `stage_key`, add `domain`, `stage_order`, `retry_count`, `locked_by`, `locked_at`.
- UPDATE existing rows: `domain = 'knowledge'`, rename `review` → `review_queue`, `render` → `article_render`, `inject` → `injection_decision`, set `stage_order` per the vocabulary in §2.
- Code path: update every `supabase.from('knowledge_pipeline_runs').insert(...)` call in `lib/knowledge/*.ts` to write the new keys plus `domain` and `stage_order`. Single-commit, test-suite updated accordingly.

New tables for Slice 1 land in a second migration. Keeps the v1 rename isolated from the IDE-hooks schema additions — clean rollback story.

---

## 14. Definition of Done per Slice

**Slice 1:**
1. Pipeline panel shows 10 stages in two bands, reading from one run ledger.
2. Bound project + Stop hook produces atom candidates through the normal knowledge pipeline, visible in the review queue, carrying capture provenance.
3. SessionStart delivers a `source_digest` release with the release_hash visible in the injected prompt.
4. Dry-run mode is a safe, documented onboarding path.
5. Kill switch is a single click and tested end-to-end.
6. Unbound repo refuses capture with a clear error.
7. Claude Code is the only adapter; `claude` appears only inside `packages/adapters/claude-code/`.

**Slice 2:**
1. Knowledge releases activate only when all four health checks pass.
2. Contradiction evidence from canary-tagged captures is attributable to release hashes.
3. Auto-activation opt-in is per-project, manual-by-default, and reversible.

**Slice 3:**
1. Context pressure events produce handoff rows that feed the atom pipeline without operator intervention.

If any DoD item is false, the slice is not done.

---

## 15. The Test That Determines Whether the Abstraction Leaked

If Claude Code disappeared tomorrow, could a new adapter be added in a single `packages/adapters/<name>/` package without modifying any file under `packages/web/src/lib/knowledge/`, `packages/web/src/app/api/ide/`, or `packages/web/supabase/schema.sql`?

If yes, the abstraction held.
If no, this spec failed and the leak must be fixed before a second adapter is considered.
