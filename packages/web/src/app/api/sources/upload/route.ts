import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const KIND_SIGNALS: Record<string, RegExp[]> = {
  identity: [/you are\b/i, /your role/i, /act as/i, /persona/i],
  goals: [/\bgoals?\b/i, /\bobjective/i, /\bpurpose\b/i],
  context: [/\bcontext\b/i, /\bdomain\b/i, /\bbackground\b/i, /tech stack/i],
  constraints: [/\bnever\b/i, /\bdo not\b/i, /\bmust not\b/i, /\bavoid\b/i, /\brule/i],
  skills: [/\bskill/i, /\bcapabilit/i, /\bworkflow/i, /\bstep\s*\d/i],
  style: [/\bstyle\b/i, /\btone\b/i, /\bformat/i, /\bvoice\b/i],
  examples: [/\bexample/i, /\bsample/i, /\bfor instance/i],
  tools: [/\btool/i, /\bfunction call/i, /\bapi\b/i, /\bcommand\b/i],
  policies: [/\bpolic/i, /\bcompliance/i, /\blegal\b/i, /\bbrand\b/i],
  memory: [/\bmemory\b/i, /\bremember\b/i, /\bsession/i],
};

const FILENAME_TO_KIND: Record<string, string> = {
  'IDENTITY.md': 'identity', 'GOALS.md': 'goals', 'CONTEXT.md': 'context',
  'CONSTRAINTS.md': 'constraints', 'SKILLS.md': 'skills', 'STYLE.md': 'style',
  'EXAMPLES.md': 'examples', 'TOOLS.md': 'tools', 'MEMORY.md': 'memory',
  'POLICIES.md': 'policies', 'EVALS.md': 'evals', 'PROMPTS.md': 'prompts',
  'CLAUDE.md': 'context', 'AGENTS.md': 'context', 'GEMINI.md': 'context',
  'CONVENTIONS.md': 'constraints', 'README.md': 'context',
};

function inferKind(filename: string, content: string): { kind: string | null; confidence: number } {
  if (FILENAME_TO_KIND[filename]) {
    return { kind: FILENAME_TO_KIND[filename], confidence: 0.9 };
  }
  let bestKind: string | null = null;
  let bestScore = 0;
  for (const [kind, patterns] of Object.entries(KIND_SIGNALS)) {
    const score = patterns.filter(p => p.test(content)).length;
    if (score > bestScore) { bestScore = score; bestKind = kind; }
  }
  if (bestScore === 0) return { kind: null, confidence: 0 };
  return { kind: bestKind, confidence: Math.min(0.95, 0.3 + (bestScore / KIND_SIGNALS[bestKind!].length) * 0.65) };
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const formData = await request.formData();
    const projectId = formData.get('projectId') as string;
    const files = formData.getAll('files') as File[];

    if (!projectId || files.length === 0) {
      return NextResponse.json({ error: 'Missing projectId or files' }, { status: 400 });
    }

    // Create data source record
    const { data: source } = await supabase
      .from('data_sources')
      .insert({
        project_id: projectId,
        name: `File upload (${files.length} files)`,
        provider: 'file-upload',
        config: { fileCount: files.length },
        status: 'syncing',
      })
      .select()
      .single();

    // Process each file
    const projectFiles = [];
    for (const file of files) {
      const content = await file.text();
      const { kind, confidence } = inferKind(file.name, content);
      projectFiles.push({
        project_id: projectId,
        file_name: file.name,
        relative_path: file.name,
        source_type: 'file-upload',
        inferred_kind: kind,
        inferred_confidence: confidence,
        content_length: content.length,
        content,
      });
    }

    if (projectFiles.length > 0) {
      await supabase.from('project_files').insert(projectFiles);
    }

    // Calculate scores (same logic as GitHub route)
    const layerScores: Record<string, number> = {};
    for (const pf of projectFiles) {
      if (pf.inferred_kind) {
        const current = layerScores[pf.inferred_kind] ?? 0;
        const fileScore = Math.min(100, 30 + (pf.content_length > 200 ? 15 : 0) + (pf.content_length > 500 ? 10 : 0) + (pf.content_length > 1000 ? 10 : 0) + Math.round(pf.inferred_confidence * 20) + 15);
        layerScores[pf.inferred_kind] = Math.max(current, fileScore);
      }
    }

    // Merge with existing scores
    const { data: existingFiles } = await supabase
      .from('project_files')
      .select('inferred_kind, inferred_confidence, content_length')
      .eq('project_id', projectId);

    if (existingFiles) {
      for (const ef of existingFiles) {
        if (ef.inferred_kind) {
          const current = layerScores[ef.inferred_kind] ?? 0;
          const fileScore = Math.min(100, 30 + (ef.content_length > 200 ? 15 : 0) + (ef.content_length > 500 ? 10 : 0) + (ef.content_length > 1000 ? 10 : 0) + Math.round((ef.inferred_confidence ?? 0) * 20) + 15);
          layerScores[ef.inferred_kind] = Math.max(current, fileScore);
        }
      }
    }

    const allKinds = ['constraints', 'context', 'evals', 'examples', 'goals', 'identity', 'memory', 'policies', 'prompts', 'skills', 'style', 'tools'];
    const weights: Record<string, number> = { identity: 3, constraints: 3, context: 2, skills: 2, goals: 2, style: 2, policies: 2, examples: 1, tools: 1, evals: 1, prompts: 1, memory: 1 };
    let totalWeight = 0, weightedScore = 0;
    for (const kind of allKinds) {
      const w = weights[kind] ?? 1;
      totalWeight += w;
      weightedScore += (layerScores[kind] ?? 0) * w;
    }
    const readinessScore = Math.round(weightedScore / totalWeight);
    const grade = readinessScore >= 90 ? 'A' : readinessScore >= 80 ? 'B' : readinessScore >= 70 ? 'C' : readinessScore >= 60 ? 'D' : 'F';

    await supabase.from('projects').update({ readiness_score: readinessScore, grade }).eq('id', projectId);
    await supabase.from('snapshots').insert({
      project_id: projectId, readiness_score: readinessScore, grade,
      layer_scores: layerScores, action: 'scan',
      notes: `File upload: ${files.length} files`,
    });
    await supabase.from('data_sources').update({ status: 'connected', last_synced_at: new Date().toISOString() }).eq('id', source?.id);

    return NextResponse.json({ success: true, filesFound: files.length, readinessScore, grade, layerScores });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
