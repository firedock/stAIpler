import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Knowledge layer — render stage.
 *
 * Two deterministic artifacts from the same atom set:
 *   1. knowledge_articles — per-concept sectioned markdown (Step 9)
 *   2. knowledge_prompt_view — singleton compact injection view (Step 10)
 *
 * Both regenerate from status='stable' atoms plus status='provisional'
 * atoms with is_pinned=true. Deterministic: atoms sorted by id, no
 * timestamps in body_md, so two consecutive runs with no atom changes
 * produce byte-identical output (Step 9 acceptance criterion).
 */

const PROMPT_VIEW_TOKEN_BUDGET = 800;

export interface RenderResult {
  runId: string | null;
  articlesUpserted: number;
  promptViewTokens: number;
  promptViewAtomCount: number;
  error?: string;
}

export interface EligibleAtom {
  id: string;
  concept_slug: string;
  atom_type: 'claim' | 'heuristic' | 'question' | 'answer' | 'decision_note';
  content: string;
  status: 'stable' | 'provisional';
  is_pinned: boolean;
  source_authority: string;
  source_log_ids: string[];
  source_document_ids: string[];
}

/** Section assignment driven by atom_type (not LLM freestyle). */
const SECTION_ORDER = [
  'Summary',
  'Why It Matters',
  'Current Understanding',
  'Key Decisions',
  'Known Heuristics',
  'Open Questions',
  'Evidence',
  'Change Log',
] as const;
type Section = typeof SECTION_ORDER[number];

function sectionForAtom(atom: EligibleAtom): Section {
  switch (atom.atom_type) {
    case 'claim':         return 'Summary';
    case 'answer':        return 'Current Understanding';
    case 'decision_note': return 'Key Decisions';
    case 'heuristic':     return 'Known Heuristics';
    case 'question':      return 'Open Questions';
  }
}

function titleForConcept(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

export function renderArticle(slug: string, atoms: EligibleAtom[]): { title: string; body: string; atomIds: string[] } {
  // Deterministic sort — never by timestamp.
  const sorted = [...atoms].sort((a, b) => a.id.localeCompare(b.id));

  const sections = new Map<Section, string[]>();
  for (const section of SECTION_ORDER) sections.set(section, []);

  for (const atom of sorted) {
    const section = sectionForAtom(atom);
    const pinFlag = atom.is_pinned && atom.status === 'provisional' ? ' (pinned provisional)' : '';
    sections.get(section)!.push(`- ${atom.content}${pinFlag}`);
  }

  // Evidence section — links to source logs and documents, deduped and sorted.
  const logIds = new Set<string>();
  const docIds = new Set<string>();
  for (const atom of sorted) {
    for (const id of atom.source_log_ids ?? []) logIds.add(id);
    for (const id of atom.source_document_ids ?? []) docIds.add(id);
  }
  const evidenceLines: string[] = [];
  if (docIds.size > 0) {
    evidenceLines.push(`- Source documents: ${[...docIds].sort().join(', ')}`);
  }
  if (logIds.size > 0) {
    evidenceLines.push(`- Source logs: ${[...logIds].sort().join(', ')}`);
  }
  if (evidenceLines.length > 0) sections.set('Evidence', evidenceLines);

  const title = titleForConcept(slug);
  const parts: string[] = [`# Concept: ${title}`];
  for (const section of SECTION_ORDER) {
    const lines = sections.get(section)!;
    if (lines.length === 0) continue;
    parts.push(`## ${section}\n\n${lines.join('\n')}`);
  }

  return {
    title,
    body: parts.join('\n\n') + '\n',
    atomIds: sorted.map(a => a.id),
  };
}

export function renderPromptView(atoms: EligibleAtom[]): { body: string; tokens: number; atomIds: string[] } {
  if (atoms.length === 0) {
    return { body: '', tokens: 0, atomIds: [] };
  }

  // Group by concept; stable sort by id within group; concept order is slug-sorted.
  const byConcept = new Map<string, EligibleAtom[]>();
  for (const atom of atoms) {
    if (!byConcept.has(atom.concept_slug)) byConcept.set(atom.concept_slug, []);
    byConcept.get(atom.concept_slug)!.push(atom);
  }
  const slugs = [...byConcept.keys()].sort();

  const lines: string[] = ['Known project knowledge:'];
  const includedIds: string[] = [];

  for (const slug of slugs) {
    const atomsInConcept = [...byConcept.get(slug)!].sort((a, b) => a.id.localeCompare(b.id));
    lines.push(''); // blank line between concepts
    lines.push(`[${titleForConcept(slug)}]`);
    for (const atom of atomsInConcept) {
      lines.push(`- ${atom.content}`);
      includedIds.push(atom.id);
    }
  }

  // Drop from the tail until we fit the token budget.
  let body = lines.join('\n');
  let tokens = Math.ceil(body.length / 4);
  while (tokens > PROMPT_VIEW_TOKEN_BUDGET && includedIds.length > 0) {
    includedIds.pop();
    lines.pop();
    body = lines.join('\n');
    tokens = Math.ceil(body.length / 4);
    // Also drop trailing concept headers if the concept became empty.
    while (lines.length > 0 && lines[lines.length - 1].startsWith('[')) {
      lines.pop();
      body = lines.join('\n');
      tokens = Math.ceil(body.length / 4);
    }
  }

  // If nothing fit, return empty so the inject stage writes source_override /
  // status_below_threshold reasons for every atom rather than an oversized view.
  if (includedIds.length === 0) return { body: '', tokens: 0, atomIds: [] };

  return { body: body + '\n', tokens, atomIds: includedIds };
}

export async function renderKnowledge(
  supabase: SupabaseClient,
  projectId: string,
): Promise<RenderResult> {
  const { data: runRow } = await supabase
    .from('knowledge_pipeline_runs')
    .insert({
      project_id: projectId,
      stage: 'render',
      status: 'running',
      counts: {},
    })
    .select('id')
    .single();

  const runId = runRow?.id as string | undefined;

  async function closeRun(counts: Record<string, unknown>, error?: string) {
    if (!runId) return;
    await supabase
      .from('knowledge_pipeline_runs')
      .update({
        status: error ? 'failed' : 'succeeded',
        completed_at: new Date().toISOString(),
        counts,
        error: error ?? null,
      })
      .eq('id', runId);
  }

  try {
    // Eligible atoms: stable, OR provisional with is_pinned=true.
    // (Two queries + merge keeps the RLS policy and index usage simple.)
    const [{ data: stableRows }, { data: pinnedRows }] = await Promise.all([
      supabase
        .from('knowledge_atoms')
        .select('id, concept_slug, atom_type, content, status, is_pinned, source_authority, source_log_ids, source_document_ids')
        .eq('project_id', projectId)
        .eq('status', 'stable'),
      supabase
        .from('knowledge_atoms')
        .select('id, concept_slug, atom_type, content, status, is_pinned, source_authority, source_log_ids, source_document_ids')
        .eq('project_id', projectId)
        .eq('status', 'provisional')
        .eq('is_pinned', true),
    ]);

    const atoms = [...(stableRows ?? []), ...(pinnedRows ?? [])] as EligibleAtom[];

    // === 1. Articles (per concept) ===
    const byConcept = new Map<string, EligibleAtom[]>();
    for (const atom of atoms) {
      if (!byConcept.has(atom.concept_slug)) byConcept.set(atom.concept_slug, []);
      byConcept.get(atom.concept_slug)!.push(atom);
    }

    let articlesUpserted = 0;
    const renderedConceptSlugs = new Set<string>();

    for (const [slug, conceptAtoms] of byConcept) {
      const { title, body, atomIds } = renderArticle(slug, conceptAtoms);
      renderedConceptSlugs.add(slug);
      const { error } = await supabase
        .from('knowledge_articles')
        .upsert(
          {
            project_id: projectId,
            concept_slug: slug,
            title,
            body_md: body,
            atom_ids: atomIds,
            rendered_at: new Date().toISOString(),
          },
          { onConflict: 'project_id,concept_slug' },
        );
      if (!error) articlesUpserted++;
    }

    // Remove articles for concepts that no longer have eligible atoms.
    const { data: existing } = await supabase
      .from('knowledge_articles')
      .select('concept_slug')
      .eq('project_id', projectId);
    const stale = (existing ?? [])
      .map(r => r.concept_slug as string)
      .filter(slug => !renderedConceptSlugs.has(slug));
    if (stale.length > 0) {
      await supabase
        .from('knowledge_articles')
        .delete()
        .eq('project_id', projectId)
        .in('concept_slug', stale);
    }

    // === 2. Compact prompt view (singleton) ===
    const { body, tokens, atomIds } = renderPromptView(atoms);
    await supabase
      .from('knowledge_prompt_view')
      .upsert(
        {
          project_id: projectId,
          body_md: body,
          token_estimate: tokens,
          atom_ids: atomIds,
          rendered_at: new Date().toISOString(),
        },
        { onConflict: 'project_id' },
      );

    await closeRun({
      articles: articlesUpserted,
      stale_articles_removed: stale.length,
      prompt_view_tokens: tokens,
      prompt_view_atoms: atomIds.length,
    });

    return {
      runId: runId ?? null,
      articlesUpserted,
      promptViewTokens: tokens,
      promptViewAtomCount: atomIds.length,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await closeRun({}, msg);
    return {
      runId: runId ?? null,
      articlesUpserted: 0,
      promptViewTokens: 0,
      promptViewAtomCount: 0,
      error: msg,
    };
  }
}
