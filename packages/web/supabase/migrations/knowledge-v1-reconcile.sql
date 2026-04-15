-- Knowledge v1 — reconcile stage helper
-- Apply this in Supabase SQL editor AFTER the knowledge v1 tables exist.
-- Safe to re-run (create or replace).

create or replace function match_knowledge_atoms(
  p_project_id uuid,
  p_query_embedding vector(1536),
  p_exclude_id uuid,
  p_threshold float default 0.85,
  p_limit int default 5
)
returns table (
  id uuid,
  content text,
  concept_slug text,
  status text,
  source_authority text,
  similarity float
)
language sql
stable
as $$
  select
    a.id,
    a.content,
    a.concept_slug,
    a.status,
    a.source_authority,
    1 - (a.embedding <=> p_query_embedding) as similarity
  from knowledge_atoms a
  where a.project_id = p_project_id
    and a.embedding is not null
    and (p_exclude_id is null or a.id <> p_exclude_id)
    and 1 - (a.embedding <=> p_query_embedding) >= p_threshold
  order by a.embedding <=> p_query_embedding
  limit p_limit;
$$;
