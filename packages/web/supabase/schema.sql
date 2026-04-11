-- stAIpler database schema
-- Run this in your Supabase SQL editor to set up the tables

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

create policy "Users can view own extracted context"
  on extracted_context for select using (
    project_id in (select id from projects where user_id = auth.uid())
  );
create policy "Users can manage own extracted context"
  on extracted_context for all using (
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

create trigger projects_updated_at
  before update on projects
  for each row execute function update_updated_at();

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

-- Anyone (even anonymous) can read public reports
create policy "public read" on public_reports for select using (
  expires_at > now()
);

-- Anyone can insert (the endpoint validates and rate-limits)
create policy "public insert" on public_reports for insert with check (true);

-- Allow incrementing view_count for public reports
create policy "public update view count" on public_reports for update using (true) with check (true);
