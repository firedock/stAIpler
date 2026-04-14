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
