# Knowledge Pipeline — v1 Spec

> **No durable system effect without a visible artifact, a visible reason, and a visible path back to source.**

This is the single rule every piece of this spec must satisfy. If any API route, schema column, or UI surface violates it, the violation blocks merge.

---

## 1. Principles

1. The system may **propose** knowledge automatically. It may not **canonize** knowledge automatically.
2. Evidence, knowledge atoms, compiled articles, and prompt views are separate products — blurring them is the drift path.
3. Compiled knowledge is an interpretation layer. It never overrides source-grounded context.
4. Every state transition is recorded, attributable, and visible.
5. Exclusions are as visible as inclusions.

---

## 2. Stage Vocabulary (locked — 6 stages)

`extract → reconcile → review → promote → render → inject`

These exact lowercase identifiers are used by:

- `knowledge_pipeline_runs.stage` enum
- API route namespace: `/api/knowledge/extract`, `/api/knowledge/reconcile`, `/api/knowledge/review`, `/api/knowledge/promote`, `/api/knowledge/render`, `/api/knowledge/inject`
- Pipeline status panel section labels (display-cased: "Extract", "Reconcile", etc.)
- Event type prefixes where relevant (`extract_produced_candidate`, `reconcile_found_similar`, etc.)
- Docs, PR titles, error messages

No synonyms. "Extraction" is acceptable as a display label; code uses `extract`.

---

## 3. Promotion Rules (locked)

| From | To | Trigger | Actor | Allowed? |
|---|---|---|---|---|
| (new) | `candidate` | `extract` produces atom | system | always |
| `candidate` | `provisional` | `source_authority = 'source_document'` | system | yes |
| `candidate` | `provisional` | `source_authority = 'user'` | system | yes |
| `candidate` | `provisional` | reinforced ≥ 3 across distinct sessions | system | yes |
| `candidate` | `provisional` | assistant-only, <3 reinforcement | — | **no** |
| `provisional` | `stable` | user action in review queue | user | yes |
| any | `stable` | any system trigger | system | **no — hard guard** |
| `stable` | `deprecated` | user action | user | yes |
| `stable` | `deprecated` (reason = `superseded`) | superseded by newer stable atom on same concept | system | yes (event logged) |
| any | `contradicted` | user resolves contradiction pair | user | yes |

**Hard guard:** `status = 'stable'` with `events.actor = 'system'` on the promoting event must fail at the API layer. No code path bypasses this.

**`deprecated` carries a reason, there is no separate `superseded` status.** The atom lifecycle is five states: `candidate`, `provisional`, `stable`, `deprecated`, `contradicted`. When a deprecation is caused by a newer stable atom on the same concept, the `deprecated` event records `payload.reason = 'superseded'` and `payload.superseded_by = <atom_id>`. The `superseded` value in the injection exclusion enum (§4) is a separate concern — it describes why an atom was withheld from a prompt compile, not a lifecycle state.

**Authority values:** `assistant`, `user`, `source_document`, `mixed`. `mixed` inherits the weakest constituent's rights. To make this enforceable rather than hand-wavy, every atom with `source_authority = 'mixed'` **must** populate `authority_breakdown` (jsonb, see §5) with the contributing authorities and their weights, e.g. `{"assistant": 0.6, "user": 0.4}`. The auto-promotion rule engine reads `authority_breakdown` directly: if any key is `assistant`, the atom follows assistant rules unless the reinforcement threshold is hit. The UI renders the breakdown on the atom card so "why is this mixed" is never implicit.

---

## 4. Exclusion Reason Enum (locked)

Used by `knowledge_injection_decisions.reason` when `decision = 'excluded'`:

- `low_authority` — assistant-only, no reinforcement
- `status_below_threshold` — still a candidate; not eligible for injection
- `pending_review` — in the review queue
- `contradicted` — marked contradicted, no resolution yet
- `superseded` — atom is `deprecated` with `superseded_by` set; a newer stable atom on the same concept won
- `token_budget` — would exceed the layer's token cap
- `source_override` — a source-grounded layer already covers this claim
- `manually_excluded` — user pinned it out of injection (see `is_pinned = false` override or explicit exclude flag in `authority_breakdown.excluded`)

Every exclusion in `knowledge_injection_decisions` must carry exactly one of these. UI renders each as a badge on the Withheld list.

---

## 5. Schema (DDL)

All tables RLS-scoped to `project_id → projects.user_id = auth.uid()`, matching existing conventions.

```sql
-- Stage enum
create type knowledge_stage as enum (
  'extract', 'reconcile', 'review', 'promote', 'render', 'inject'
);

-- Authority enum
create type knowledge_authority as enum (
  'assistant', 'user', 'source_document', 'mixed'
);

-- Atom status enum (5 states; 'superseded' is not a status — it's a deprecation reason)
create type knowledge_status as enum (
  'candidate', 'provisional', 'stable', 'deprecated', 'contradicted'
);

-- Review state enum (separate from status — "has the user looked at this?")
create type knowledge_review_state as enum (
  'pending', 'approved', 'rejected', 'edited', 'deferred'
);

-- 1. Atoms — the durable compiler substrate
create table if not exists knowledge_atoms (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  concept_slug text not null,
  atom_type text not null check (atom_type in (
    'claim', 'heuristic', 'question', 'answer', 'decision_note'
  )),
  content text not null,
  status knowledge_status not null default 'candidate',
  source_authority knowledge_authority not null,
  -- Required when source_authority = 'mixed'; optional otherwise.
  -- Shape: { "assistant": 0.6, "user": 0.4, "source_document": 0.0 }
  -- The auto-promotion rule engine reads this to resolve 'mixed' deterministically.
  authority_breakdown jsonb,
  confidence numeric default 0.5,
  review_state knowledge_review_state not null default 'pending',
  -- Allows stable (always) or provisional (explicitly pinned) atoms into the prompt view.
  is_pinned boolean not null default false,
  source_log_ids uuid[] default '{}',
  source_document_ids uuid[] default '{}',
  handoff_ids uuid[] default '{}',
  parent_atom_id uuid references knowledge_atoms(id) on delete set null,
  superseded_by uuid references knowledge_atoms(id) on delete set null,
  embedding vector(1536),
  reinforcement_count integer default 0,
  distinct_session_count integer default 0,
  created_at timestamptz default now(),
  last_reinforced_at timestamptz,
  promoted_at timestamptz,
  deprecated_at timestamptz,
  -- Enforce the authority_breakdown requirement at the DB layer
  constraint mixed_requires_breakdown check (
    source_authority <> 'mixed' or authority_breakdown is not null
  )
);

create index on knowledge_atoms(project_id, concept_slug);
create index on knowledge_atoms(project_id, status);
create index on knowledge_atoms using ivfflat (embedding vector_cosine_ops);

-- 2. Events — append-only history per atom (the visibility substrate)
create table if not exists knowledge_atom_events (
  id uuid default gen_random_uuid() primary key,
  atom_id uuid references knowledge_atoms(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  event_type text not null,
    -- examples: 'extracted', 'reinforced', 'similar_detected',
    --           'auto_promoted', 'user_approved', 'user_rejected',
    --           'user_edited', 'user_merged_into', 'superseded',
    --           'contradicted', 'deprecated', 'injected', 'excluded'
  actor text not null check (actor in ('system', 'user')),
  trigger_ref text, -- session id, rule name, review action, etc.
  payload jsonb default '{}',
  created_at timestamptz default now()
);

create index on knowledge_atom_events(atom_id, created_at desc);
create index on knowledge_atom_events(project_id, created_at desc);

-- 3. Pipeline runs — macro-history per stage
create table if not exists knowledge_pipeline_runs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  stage knowledge_stage not null,
  session_id uuid, -- nullable; render/inject runs may not be session-scoped
  status text not null check (status in ('running', 'succeeded', 'failed')),
  counts jsonb default '{}', -- {candidates: N, reinforced: M, excluded: K, ...}
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index on knowledge_pipeline_runs(project_id, stage, started_at desc);

-- 4. Articles — rendered markdown cache (regenerable from atoms)
create table if not exists knowledge_articles (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  concept_slug text not null,
  title text not null,
  body_md text not null,
  atom_ids uuid[] not null default '{}',
  rendered_at timestamptz default now(),
  unique (project_id, concept_slug)
);

-- 5. Prompt view — single compact injection artifact per project
create table if not exists knowledge_prompt_view (
  project_id uuid primary key references projects(id) on delete cascade,
  body_md text not null default '',
  token_estimate integer default 0,
  atom_ids uuid[] not null default '{}',
  rendered_at timestamptz default now()
);

-- 6. Injection decisions — per-compile record of what was included/excluded and why
create table if not exists knowledge_injection_decisions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  session_id uuid,
  -- Points to the knowledge_pipeline_runs row (stage='inject') that made this decision.
  -- The 'inject' stage is exclusively the per-compile inclusion/exclusion pass;
  -- prompt-view regeneration is stage='render' (see §6 and Step 10).
  inject_run_id uuid references knowledge_pipeline_runs(id) on delete set null,
  atom_id uuid references knowledge_atoms(id) on delete cascade not null,
  decision text not null check (decision in ('included', 'excluded', 'pinned')),
  reason text, -- from exclusion reason enum when decision='excluded'
  token_cost integer default 0,
  compiled_at timestamptz default now()
);

create index on knowledge_injection_decisions(project_id, compiled_at desc);
create index on knowledge_injection_decisions(atom_id);

-- RLS policies (same pattern for every table)
-- ... standard project-scoped select/insert/update/delete
```

---

## 6. Compiler Integration

The `knowledge` layer is added to the canonical layer order in the compiler:

```
user request
  ↓
current source docs / project files
  ↓
source-grounded instruction layers (identity, goals, context, etc.)
  ↓
knowledge layer           ← NEW: compact prompt view from stable atoms
  ↓
handoff / short-memory layer
```

Layer registration lives in `packages/core/src/compiler.ts`. Token budget for the `knowledge` layer is capped (default 800 tokens); overflow produces `token_budget` exclusions. The layer writes `knowledge_injection_decisions` rows on every compile — one per atom considered, whether included or excluded — and every decision row references the `inject_run_id` of that compile.

**Two render moments, one stage each — no overlap:**

- **`render` stage** — deterministically regenerates both `knowledge_articles` rows and the singleton `knowledge_prompt_view` row from the current atom set. Triggered on atom status changes, on demand, or by a scheduled job. Writes one `knowledge_pipeline_runs` row with `stage = 'render'` and `counts.articles` / `counts.prompt_view_tokens` in the payload.
- **`inject` stage** — runs on every prompt compile. Reads the current `knowledge_prompt_view` and writes one `knowledge_injection_decisions` row per eligible atom (included or excluded with reason). Writes one `knowledge_pipeline_runs` row with `stage = 'inject'`, whose id becomes the `inject_run_id` on the decisions.

`render` rewrites the artifacts; `inject` records which atoms actually made it into the prompt this turn. They never share a run row.

---

## 7. VisibleObject Contract

`packages/web/src/components/visible-object.tsx` exports the interface and card. No knowledge UI may ship without using it.

```ts
export interface VisibleObject {
  identity: {
    id: string;
    type: 'log' | 'atom' | 'handoff' | 'article' | 'prompt_line' | 'conflict_pair' | 'pipeline_run' | 'injection_decision';
    label: string;
    conceptSlug?: string;
  };
  status: {
    value: string;
    tone: 'neutral' | 'info' | 'success' | 'warning' | 'danger';
    badge?: string;
  };
  provenance: {
    sourceLogIds?: string[];
    sourceDocumentIds?: string[];
    handoffIds?: string[];
    parentAtomId?: string;
    extractedFrom?: { sessionId: string; at: string };
  };
  explanation: {
    summary: string;        // "provisional because reinforced 3× across sessions A, B, C"
    lastEventAt: string;
    lastEventType: string;
    lastActor: 'system' | 'user';
  };
  effect: {
    injectedNow: boolean;
    pinned?: boolean;
    withheldReason?: string;
  };
  actions: Array<{
    id: string;
    label: string;
    shortcut?: string;      // single char, matches global convention
    destructive?: boolean;
    onInvoke: () => void | Promise<void>;
  }>;
}

export function ObjectCard(props: { object: VisibleObject }): JSX.Element;
```

**Global keyboard shortcuts** (consistent across every card type):

- `a` — approve / primary positive action
- `m` — merge
- `e` — edit
- `r` — reject
- `p` — promote to next status (review-queue only)
- `d` — demote / deprecate
- `?` — open "why is this here" explanation panel

---

## 8. UI Surfaces

Three surfaces are required before any automation runs. Each must render its empty state correctly on day one.

**Pipeline status panel** — `/dashboard/[id]/knowledge`
- 6 stage cards laid out left-to-right matching the stage vocabulary.
- Per stage: last-run timestamp, run count (today / all-time), most recent `counts` payload, most recent error if any.
- Click a stage → drawer with last N `knowledge_pipeline_runs` rows.

**Review queue** — `/dashboard/[id]/knowledge/review`
- List of atoms with `review_state = 'pending'`, sorted newest first.
- Similarity pairs (from `reconcile`) rendered side-by-side.
- Uses `<ObjectCard>`. Keyboard actions trigger the promotion/demotion rules.
- Actions log `knowledge_atom_events` rows with `actor = 'user'`.

**Knowledge tab in Session Context panel** — added to the existing panel
- **Included** section: every atom in the current compact prompt view, via `<ObjectCard>`, each linking to its concept article and source provenance.
- **Withheld** section: every atom `decision = 'excluded'` for this session's compile, grouped by reason, with badges.
- Empty-state copy:
  - Included empty: "No knowledge atoms are being injected this session."
  - Withheld empty: "Every eligible atom is in context."

---

## 9. Build Order (10 steps, glass-box first)

Each step has acceptance criteria. No step may land without its criteria met.

### Step 1 — Schema + events + runs + decisions tables

- DDL above merged into `packages/web/supabase/schema.sql`.
- Idempotent (`create … if not exists`, `drop policy if exists` before create).
- RLS policies cover select/insert/update/delete scoped to project owner.
- `knowledge_pipeline_runs` and `knowledge_injection_decisions` exist and are writable from the server.

**Acceptance:** schema re-runs cleanly; integration test inserts an atom, an event, a run, and a decision under a project owned by a test user.

### Step 2 — VisibleObject contract + ObjectCard component

- Interface and component at `packages/web/src/components/visible-object.tsx`.
- Keyboard shortcut layer wired as a global handler for focused cards.
- Storybook-style demo page at `/dashboard/_dev/visible-object` rendering one card per object type with mocked data.

**Acceptance:** demo page renders all 8 object types; shortcuts fire their actions; no knowledge UI file imports raw atom shapes without going through the contract.

### Step 3 — Knowledge layer wired into the compiler (empty)

- New layer registered between `context` and `memory` in `packages/core/src/compiler.ts`.
- Reads `knowledge_prompt_view.body_md` for the project; empty string if row missing.
- On every compile, writes one `knowledge_injection_decisions` row per candidate-or-better atom in the project (either `included` or `excluded` with a reason).
- Token budget cap (default 800) enforced; overflow writes `token_budget` exclusions.

**Acceptance:** a compile with no atoms writes zero decision rows; a compile with atoms but empty prompt view writes decision rows with reason `status_below_threshold` or `low_authority` for each.

### Step 4 — Read-only visibility surfaces

- Pipeline status panel, review queue (empty), and Knowledge tab in Session Context panel, all shipping before any extractor runs.
- All three read from the tables above and render correct empty states.
- Atom card (when atoms exist) renders full `knowledge_atom_events` history as a timeline.

**Acceptance:** the three surfaces are reachable from nav; each renders with zero atoms in the DB; each renders correctly with a single manually-inserted atom + events.

### Step 5 — Session-close extractor

- Triggered on session close or explicit "promote knowledge" action.
- One LLM call per session; prompt biased toward restraint.
- Writes atoms with `status = 'candidate'`, `source_authority` inferred from message origin.
- Writes one `knowledge_pipeline_runs` row with `stage = 'extract'` and counts.
- Emits `extracted` event per atom.

**Acceptance:** closing a session with N user/assistant messages produces ≤ N candidate atoms visible in the pipeline panel and review queue.

### Step 6 — Reconciler

- Nearest-neighbor embedding search per new candidate against existing atoms in the same project.
- Threshold: cosine similarity > 0.85 → write `similar_detected` event on the new atom, linking the matched atom id via `payload`.
- Writes `knowledge_pipeline_runs` row with `stage = 'reconcile'`.
- **No auto-merge. No auto-contradict.** Pairs are surfaced to the review queue.

**Acceptance:** near-duplicate candidates render side-by-side in review queue with similarity score; events recorded on both sides.

### Step 7 — Review queue actions

- Keyboard actions: `a` approve, `m` merge, `e` edit, `r` reject, `p` promote, `d` demote.
- Approve → `review_state = 'approved'`, status stays or moves per rules.
- Merge → mark source atom as `superseded`, copy reinforcement into target.
- Promote → only valid from `provisional` → `stable`; logs `user_approved` event.
- Every action writes a `knowledge_atom_events` row with `actor = 'user'`.

**Acceptance:** running through the queue leaves every atom with `review_state != 'pending'` and a coherent event history on each.

### Step 8 — Auto-promotion rules (candidate → provisional)

- Rule engine runs on atom insert/update and on reinforcement events.
- Each rule logs an `auto_promoted` event with `trigger_ref = '<rule_name>'`.
- Hard guard at API layer: `status = 'stable'` with `actor = 'system'` → 400.

**Acceptance:** an atom with `source_authority = 'user'` auto-promotes to provisional on insert, visible in pipeline counts; an assistant-only atom does not.

### Step 9 — Article renderer

- Deterministic: reads `status = 'stable'` atoms (and `status = 'provisional' AND is_pinned = true` atoms) grouped by `concept_slug`.
- Emits sectioned markdown (Summary / Why It Matters / Current Understanding / Key Decisions / Known Heuristics / Open Questions / Evidence / Change Log).
- Section assignment driven by `atom_type`, not LLM freestyle.
- Upserts `knowledge_articles` rows. Writes `knowledge_pipeline_runs` with `stage = 'render'`.

**Acceptance:** running render twice in a row with no atom changes produces byte-identical `body_md`.

### Step 10 — Compact prompt view

- Regenerated by the **`render`** stage (alongside articles — see §6). Triggered on any atom status change, on `is_pinned` toggle, or on demand.
- Contains `status = 'stable'` atoms plus `status = 'provisional' AND is_pinned = true` atoms.
- Updates the `knowledge_prompt_view` singleton row. Writes a `knowledge_pipeline_runs` row with `stage = 'render'` (same stage as article rendering; the run's `counts` payload distinguishes `articles` vs `prompt_view_tokens`).
- The per-compile inclusion/exclusion logging remains in Step 3 and runs under `stage = 'inject'`. These are two separate runs and never share a row.

**Acceptance:** promoting an atom to stable (or pinning a provisional atom) causes the compact view to regenerate within one `render` cycle; the next compile's `inject` run emits an `included` decision for it with a matching `inject_run_id`; the Knowledge tab's Included list shows it.

---

## 10. What's Explicitly Out of Scope for v1

- Separate human `INDEX.md` artifact
- `decision` and `qa` as distinct artifact types (rolled into concept articles via section)
- Automated contradiction/alias resolution
- Retrieval-time (mid-turn) injection
- Filesystem adapter / local markdown storage
- Article versioning (atoms are the versioned layer; articles regenerate)
- Per-message extraction
- Cross-project knowledge sharing

These are re-evaluated after v1 produces usage data.

---

## 11. Definition of Done for v1

1. All 6 tables exist with RLS.
2. `VisibleObject` contract is the only path to rendering a knowledge object in the UI.
3. The 6-stage vocabulary appears identically in code, API routes, UI copy, docs.
4. Promotion rules are enforced at the API layer, not just documented.
5. Every inclusion and every exclusion in injection is recorded with a reason.
6. User can open any atom and see: what it is, why it's at this status, every event that moved it, every source it came from, whether it's in context right now, and what they can do about it.
7. Closing a session produces visible candidate atoms within 60 seconds.
8. Promoting a candidate through the review queue to stable causes it to appear in the next prompt compile and in the Knowledge tab's Included list.

If any of these eight are false, v1 is not done.
