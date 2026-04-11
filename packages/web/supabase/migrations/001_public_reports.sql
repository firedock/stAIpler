-- Migration 001: Public shareable init reports
-- Run this against your live Supabase database to enable /api/r and /r/[slug]
-- Safe to re-run — uses IF NOT EXISTS and drops policies before recreating.

-- Table
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

-- Indexes
create index if not exists public_reports_slug_idx on public_reports(slug);
create index if not exists public_reports_expires_at_idx on public_reports(expires_at);

-- Enable RLS
alter table public_reports enable row level security;

-- Drop existing policies (safe no-op if they don't exist)
drop policy if exists "public read" on public_reports;
drop policy if exists "public insert" on public_reports;
drop policy if exists "public update view count" on public_reports;

-- Anyone (even anonymous) can read non-expired reports
create policy "public read" on public_reports for select using (
  expires_at > now()
);

-- Anyone can insert (the API endpoint validates and can be rate-limited)
create policy "public insert" on public_reports for insert with check (true);

-- Allow incrementing view_count from the public viewer route
create policy "public update view count" on public_reports for update using (true) with check (true);
