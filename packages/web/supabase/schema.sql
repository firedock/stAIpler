-- stAIpler database schema
-- Run this in your Supabase SQL editor to set up the tables.
-- Safe to re-run — all tables use IF NOT EXISTS and all policies are dropped
-- before recreation so the file is idempotent.

-- Projects
create table if not exists projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  readiness_score integer default 0,
  grade text default 'F',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table projects enable row level security;

drop policy if exists "Users can view own projects" on projects;
drop policy if exists "Users can create projects" on projects;
drop policy if exists "Users can update own projects" on projects;
drop policy if exists "Users can delete own projects" on projects;

create policy "Users can view own projects"
  on projects for select using (auth.uid() = user_id);
create policy "Users can create projects"
  on projects for insert with check (auth.uid() = user_id);
create policy "Users can update own projects"
  on projects for update using (auth.uid() = user_id);
create policy "Users can delete own projects"
  on projects for delete using (auth.uid() = user_id);

-- Snapshots (KPI history)
create table if not exists snapshots (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  readiness_score integer not null,
  grade text not null,
  layer_scores jsonb not null default '{}',
  action text not null check (action in ('scan', 'optimize', 'eval')),
  notes text,
  eval_score numeric,
  eval_improvement numeric,
  created_at timestamptz default now()
);

alter table snapshots enable row level security;

drop policy if exists "Users can view own snapshots" on snapshots;
drop policy if exists "Users can create snapshots" on snapshots;

create policy "Users can view own snapshots"
  on snapshots for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can create snapshots"
  on snapshots for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Project files (discovered instruction files)
create table if not exists project_files (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  file_name text not null,
  relative_path text not null,
  source_type text not null,
  inferred_kind text,
  inferred_confidence numeric,
  content_length integer default 0,
  content text,
  created_at timestamptz default now()
);

alter table project_files enable row level security;

drop policy if exists "Users can view own project files" on project_files;
drop policy if exists "Users can manage own project files" on project_files;

create policy "Users can view own project files"
  on project_files for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own project files"
  on project_files for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Data sources (consumer DB approach — connect external data to build context)
create table if not exists data_sources (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  name text not null,
  provider text not null check (provider in (
    'notedrawer', 'google-docs', 'notion', 'confluence', 'github', 'gitlab',
    'slack', 'linear', 'jira', 'airtable', 'hubspot',
    'salesforce', 'zendesk', 'intercom', 'file-upload', 'url'
  )),
  config jsonb not null default '{}',
  status text not null default 'pending' check (status in ('pending', 'connected', 'syncing', 'error', 'disconnected')),
  last_synced_at timestamptz,
  sync_error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table data_sources enable row level security;

drop policy if exists "Users can view own data sources" on data_sources;
drop policy if exists "Users can manage own data sources" on data_sources;

create policy "Users can view own data sources"
  on data_sources for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own data sources"
  on data_sources for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Extracted context (content pulled from data sources, mapped to layers)
create table if not exists extracted_context (
  id uuid default gen_random_uuid() primary key,
  data_source_id uuid references data_sources(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  source_title text not null,
  source_url text,
  extracted_content text not null,
  mapped_kind text,
  confidence numeric default 0,
  included_in_stack boolean default false,
  created_at timestamptz default now()
);

alter table extracted_context enable row level security;

drop policy if exists "Users can view own extracted context" on extracted_context;
drop policy if exists "Users can manage own extracted context" on extracted_context;

create policy "Users can view own extracted context"
  on extracted_context for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own extracted context"
  on extracted_context for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Source documents (normalized raw content from any connector)
create table if not exists source_documents (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  data_source_id uuid references data_sources(id) on delete set null,
  title text not null,
  source_url text,
  raw_content text not null,
  content_hash text not null,
  mime_type text default 'text/markdown',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists source_documents_project_idx on source_documents(project_id);
create index if not exists source_documents_hash_idx on source_documents(content_hash);

alter table source_documents enable row level security;

drop policy if exists "Users can view own source documents" on source_documents;
drop policy if exists "Users can manage own source documents" on source_documents;

create policy "Users can view own source documents"
  on source_documents for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own source documents"
  on source_documents for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Layer candidates (extracted spans mapped to instruction layers with provenance)
create table if not exists layer_candidates (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  source_document_id uuid references source_documents(id) on delete cascade not null,
  layer text not null,
  content text not null,
  confidence numeric default 0,
  rationale text,
  extraction_method text not null check (extraction_method in ('filename', 'filetype', 'heuristic', 'semantic')),
  provenance jsonb not null,
  span_start integer,
  span_end integer,
  status text default 'active' check (status in ('active', 'superseded', 'conflicted')),
  created_at timestamptz default now()
);

create index if not exists layer_candidates_project_idx on layer_candidates(project_id);
create index if not exists layer_candidates_layer_idx on layer_candidates(project_id, layer);

alter table layer_candidates enable row level security;

drop policy if exists "Users can view own layer candidates" on layer_candidates;
drop policy if exists "Users can manage own layer candidates" on layer_candidates;

create policy "Users can view own layer candidates"
  on layer_candidates for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own layer candidates"
  on layer_candidates for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Compiled bundles (cached instruction bundles with provenance)
create table if not exists compiled_bundles (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  system_prompt text not null,
  hash text not null,
  sections jsonb not null,
  provenance jsonb not null,
  conflicts jsonb default '[]',
  gaps jsonb default '[]',
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists compiled_bundles_project_idx on compiled_bundles(project_id);

alter table compiled_bundles enable row level security;

drop policy if exists "Users can view own compiled bundles" on compiled_bundles;
drop policy if exists "Users can manage own compiled bundles" on compiled_bundles;

create policy "Users can view own compiled bundles"
  on compiled_bundles for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own compiled bundles"
  on compiled_bundles for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Decision audit log (tracks every resolution, acceptance, and auto-decision)
create table if not exists decision_audit (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  decision_type text not null check (decision_type in (
    'conflict-resolution', 'candidate-accepted', 'candidate-rejected',
    'candidate-reassigned', 'auto-dedup', 'auto-conflict-resolution',
    'confidence-filter', 'handoff-resolved', 'handoff-superseded'
  )),
  actor text not null check (actor in ('user', 'system')),
  target_ids text[] not null default '{}',
  chosen_option text,
  alternatives jsonb default '[]',
  rationale text,
  context jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists decision_audit_project_idx on decision_audit(project_id);
create index if not exists decision_audit_type_idx on decision_audit(project_id, decision_type);

alter table decision_audit enable row level security;

drop policy if exists "Users can view own decisions" on decision_audit;
drop policy if exists "Users can manage own decisions" on decision_audit;

create policy "Users can view own decisions"
  on decision_audit for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own decisions"
  on decision_audit for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Session handoffs (agent-to-agent operational wisdom with decay)
create table if not exists session_handoffs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  classification text not null check (classification in ('fact', 'inference', 'heuristic', 'unresolved-question')),
  content text not null,
  initial_confidence numeric not null,
  effective_confidence numeric not null,
  provenance jsonb not null,
  reinforcement_count integer default 0,
  last_reinforced_at timestamptz default now(),
  status text default 'active' check (status in ('active', 'decayed', 'superseded', 'resolved')),
  created_at timestamptz default now()
);

create index if not exists session_handoffs_project_idx on session_handoffs(project_id);
create index if not exists session_handoffs_status_idx on session_handoffs(project_id, status);

alter table session_handoffs enable row level security;

drop policy if exists "Users can view own handoffs" on session_handoffs;
drop policy if exists "Users can manage own handoffs" on session_handoffs;

create policy "Users can view own handoffs"
  on session_handoffs for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own handoffs"
  on session_handoffs for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists projects_updated_at on projects;
create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

drop trigger if exists data_sources_updated_at on data_sources;
create trigger data_sources_updated_at
  before update on data_sources
  for each row execute function update_updated_at();

-- Public reports — anonymous, shareable snapshots of init reports
-- Anyone with a slug URL can view without registering.
create table if not exists public_reports (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  project_name text not null,
  html text not null,
  score integer default 0,
  grade text default 'F',
  present_layers integer default 0,
  missing_layers integer default 0,
  view_count integer default 0,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '30 days'),
  created_by_ip text
);

create index if not exists public_reports_slug_idx on public_reports(slug);
create index if not exists public_reports_expires_at_idx on public_reports(expires_at);

alter table public_reports enable row level security;

drop policy if exists "public read" on public_reports;
drop policy if exists "public insert" on public_reports;
drop policy if exists "public update view count" on public_reports;

-- Anyone (even anonymous) can read non-expired public reports
create policy "public read" on public_reports for select using (
  expires_at > now()
);

-- Anyone can insert (the endpoint validates and can be rate-limited)
create policy "public insert" on public_reports for insert with check (true);

-- Allow incrementing view_count from the public viewer route
create policy "public update view count" on public_reports for update using (true) with check (true);

-- Agent configs (persisted AI provider settings per project)
create table if not exists agent_configs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null unique,
  provider text not null check (provider in ('anthropic', 'openai', 'hosted')),
  model text not null,
  api_key_encrypted text,    -- AES-256-GCM encrypted, null for 'hosted'
  display_name text,         -- friendly name: "Acme Support Bot"
  widget_config jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table agent_configs enable row level security;

drop policy if exists "Users can view own agent configs" on agent_configs;
drop policy if exists "Users can manage own agent configs" on agent_configs;

create policy "Users can view own agent configs"
  on agent_configs for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own agent configs"
  on agent_configs for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

drop trigger if exists agent_configs_updated_at on agent_configs;
create trigger agent_configs_updated_at
  before update on agent_configs
  for each row execute function update_updated_at();

-- Usage events (token metering for hosted tier)
create table if not exists usage_events (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  input_tokens integer not null,
  output_tokens integer not null,
  model text not null,
  created_at timestamptz default now()
);

create index if not exists usage_events_project_created_idx
  on usage_events(project_id, created_at);

alter table usage_events enable row level security;

drop policy if exists "Users can view own usage events" on usage_events;
drop policy if exists "Users can insert own usage events" on usage_events;

create policy "Users can view own usage events"
  on usage_events for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can insert own usage events"
  on usage_events for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Deploy tokens (public authentication for embedded widgets)
create table if not exists deploy_tokens (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  token text unique not null,
  allowed_origins text[] default '{}',
  rate_limit_rpm integer default 20,
  enabled boolean default true,
  created_at timestamptz default now()
);

create index if not exists deploy_tokens_token_idx on deploy_tokens(token);

alter table deploy_tokens enable row level security;

drop policy if exists "Users can view own deploy tokens" on deploy_tokens;
drop policy if exists "Users can manage own deploy tokens" on deploy_tokens;

create policy "Users can view own deploy tokens"
  on deploy_tokens for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own deploy tokens"
  on deploy_tokens for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- Public read for widget endpoints (token lookup without auth)
drop policy if exists "Public token lookup" on deploy_tokens;
create policy "Public token lookup"
  on deploy_tokens for select using (enabled = true);

-- Project logs (every AI communication — prompts and responses, grouped by date)
create table if not exists project_logs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  mode text check (mode in ('staipler', 'control')),
  provider text,
  model text,
  token_estimate integer,
  metadata jsonb default '{}',
  created_at timestamptz default now()
);

create index if not exists project_logs_project_created_idx on project_logs(project_id, created_at desc);
create index if not exists project_logs_user_idx on project_logs(user_id);

alter table project_logs enable row level security;

drop policy if exists "Users can view own project logs" on project_logs;
drop policy if exists "Users can insert own project logs" on project_logs;

create policy "Users can view own project logs"
  on project_logs for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can insert own project logs"
  on project_logs for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- =====================================================================
-- Knowledge Pipeline v1
-- See packages/web/docs/knowledge-v1.md
--
-- Product law: no durable system effect without a visible artifact, a visible
-- reason, and a visible path back to source.
--
-- Stages (locked): extract → reconcile → review → promote → render → inject
-- Authority: assistant | user | source_document | mixed
-- Status (5 states; 'superseded' is not a status, it's a deprecation reason):
--   candidate | provisional | stable | deprecated | contradicted
-- =====================================================================

-- pgvector extension for atom embeddings (reconciler in Step 6)
create extension if not exists vector;

-- 1. Knowledge atoms — the durable compiler substrate
create table if not exists knowledge_atoms (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  concept_slug text not null,
  atom_type text not null check (atom_type in (
    'claim', 'heuristic', 'question', 'answer', 'decision_note'
  )),
  content text not null,
  status text not null default 'candidate' check (status in (
    'candidate', 'provisional', 'stable', 'deprecated', 'contradicted'
  )),
  source_authority text not null check (source_authority in (
    'assistant', 'user', 'source_document', 'mixed'
  )),
  -- Required when source_authority='mixed'; shape example:
  -- { "assistant": 0.6, "user": 0.4, "source_document": 0.0 }
  authority_breakdown jsonb,
  confidence numeric default 0.5,
  review_state text not null default 'pending' check (review_state in (
    'pending', 'approved', 'rejected', 'edited', 'deferred'
  )),
  is_pinned boolean not null default false,
  source_log_ids uuid[] not null default '{}',
  source_document_ids uuid[] not null default '{}',
  handoff_ids uuid[] not null default '{}',
  parent_atom_id uuid references knowledge_atoms(id) on delete set null,
  superseded_by uuid references knowledge_atoms(id) on delete set null,
  embedding vector(1536),
  reinforcement_count integer not null default 0,
  distinct_session_count integer not null default 0,
  created_at timestamptz default now(),
  last_reinforced_at timestamptz,
  promoted_at timestamptz,
  deprecated_at timestamptz,
  constraint mixed_requires_breakdown check (
    source_authority <> 'mixed' or authority_breakdown is not null
  )
);

create index if not exists knowledge_atoms_project_concept_idx
  on knowledge_atoms(project_id, concept_slug);
create index if not exists knowledge_atoms_project_status_idx
  on knowledge_atoms(project_id, status);
create index if not exists knowledge_atoms_project_review_idx
  on knowledge_atoms(project_id, review_state);
-- Note: ivfflat index added separately once atoms have been populated
-- (ivfflat requires data to train). Cosine ops used to match reconciler spec.

alter table knowledge_atoms enable row level security;

drop policy if exists "Users can view own knowledge atoms" on knowledge_atoms;
drop policy if exists "Users can manage own knowledge atoms" on knowledge_atoms;

create policy "Users can view own knowledge atoms"
  on knowledge_atoms for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own knowledge atoms"
  on knowledge_atoms for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 2. Knowledge atom events — append-only history per atom (visibility substrate)
create table if not exists knowledge_atom_events (
  id uuid default gen_random_uuid() primary key,
  atom_id uuid references knowledge_atoms(id) on delete cascade not null,
  project_id uuid references projects(id) on delete cascade not null,
  -- Free-form but documented. Examples:
  --   extracted, reinforced, similar_detected,
  --   auto_promoted, user_approved, user_rejected, user_edited,
  --   user_merged_into, superseded, contradicted, deprecated,
  --   injected, excluded, pinned, unpinned
  event_type text not null,
  actor text not null check (actor in ('system', 'user')),
  trigger_ref text,
  payload jsonb not null default '{}',
  created_at timestamptz default now()
);

create index if not exists knowledge_atom_events_atom_idx
  on knowledge_atom_events(atom_id, created_at desc);
create index if not exists knowledge_atom_events_project_idx
  on knowledge_atom_events(project_id, created_at desc);

alter table knowledge_atom_events enable row level security;

drop policy if exists "Users can view own atom events" on knowledge_atom_events;
drop policy if exists "Users can insert own atom events" on knowledge_atom_events;

create policy "Users can view own atom events"
  on knowledge_atom_events for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can insert own atom events"
  on knowledge_atom_events for insert with check (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 3. Pipeline runs — macro-history per stage
create table if not exists knowledge_pipeline_runs (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  stage text not null check (stage in (
    'extract', 'reconcile', 'review', 'promote', 'render', 'inject'
  )),
  session_id uuid,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  counts jsonb not null default '{}',
  error text,
  started_at timestamptz default now(),
  completed_at timestamptz
);

create index if not exists knowledge_pipeline_runs_project_stage_idx
  on knowledge_pipeline_runs(project_id, stage, started_at desc);

alter table knowledge_pipeline_runs enable row level security;

drop policy if exists "Users can view own pipeline runs" on knowledge_pipeline_runs;
drop policy if exists "Users can manage own pipeline runs" on knowledge_pipeline_runs;

create policy "Users can view own pipeline runs"
  on knowledge_pipeline_runs for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own pipeline runs"
  on knowledge_pipeline_runs for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 4. Knowledge articles — rendered markdown cache (regenerable)
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

create index if not exists knowledge_articles_project_idx
  on knowledge_articles(project_id);

alter table knowledge_articles enable row level security;

drop policy if exists "Users can view own articles" on knowledge_articles;
drop policy if exists "Users can manage own articles" on knowledge_articles;

create policy "Users can view own articles"
  on knowledge_articles for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own articles"
  on knowledge_articles for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 5. Prompt view — singleton per project, compact injection artifact
create table if not exists knowledge_prompt_view (
  project_id uuid primary key references projects(id) on delete cascade,
  body_md text not null default '',
  token_estimate integer not null default 0,
  atom_ids uuid[] not null default '{}',
  rendered_at timestamptz default now()
);

alter table knowledge_prompt_view enable row level security;

drop policy if exists "Users can view own prompt view" on knowledge_prompt_view;
drop policy if exists "Users can manage own prompt view" on knowledge_prompt_view;

create policy "Users can view own prompt view"
  on knowledge_prompt_view for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own prompt view"
  on knowledge_prompt_view for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );

-- 6. Injection decisions — per-compile inclusion/exclusion record
create table if not exists knowledge_injection_decisions (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  session_id uuid,
  -- Points to the knowledge_pipeline_runs row (stage='inject') for this compile.
  -- Prompt-view regeneration runs under stage='render' and does NOT populate this field.
  inject_run_id uuid references knowledge_pipeline_runs(id) on delete set null,
  atom_id uuid references knowledge_atoms(id) on delete cascade not null,
  decision text not null check (decision in ('included', 'excluded', 'pinned')),
  -- When decision='excluded', must be one of:
  --   low_authority | status_below_threshold | pending_review |
  --   contradicted | superseded | token_budget | source_override |
  --   manually_excluded
  reason text check (reason is null or reason in (
    'low_authority', 'status_below_threshold', 'pending_review',
    'contradicted', 'superseded', 'token_budget', 'source_override',
    'manually_excluded'
  )),
  token_cost integer not null default 0,
  compiled_at timestamptz default now(),
  constraint excluded_requires_reason check (
    decision <> 'excluded' or reason is not null
  )
);

create index if not exists knowledge_injection_decisions_project_time_idx
  on knowledge_injection_decisions(project_id, compiled_at desc);
create index if not exists knowledge_injection_decisions_atom_idx
  on knowledge_injection_decisions(atom_id);
create index if not exists knowledge_injection_decisions_run_idx
  on knowledge_injection_decisions(inject_run_id);

alter table knowledge_injection_decisions enable row level security;

drop policy if exists "Users can view own injection decisions" on knowledge_injection_decisions;
drop policy if exists "Users can manage own injection decisions" on knowledge_injection_decisions;

create policy "Users can view own injection decisions"
  on knowledge_injection_decisions for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own injection decisions"
  on knowledge_injection_decisions for all using (
    project_id in (select id from projects where user_id = auth.uid())
  );
