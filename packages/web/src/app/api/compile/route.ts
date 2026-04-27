import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getLatestBundle } from '@/lib/pipeline/store';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await request.json();

    // Try to read from cached compiled bundle first
    const bundle = await getLatestBundle(supabase, projectId);

    if (bundle) {
      return NextResponse.json({
        systemPrompt: bundle.systemPrompt,
        layers: bundle.sections.map(s => s.layer),
        fileCount: bundle.metadata.layerCandidateCount,
        tokenEstimate: bundle.metadata.tokenEstimate,
        // New fields from the evidence pipeline
        sections: bundle.sections,
        provenance: bundle.provenance,
        conflicts: bundle.conflicts,
        gaps: bundle.gaps,
      });
    }

    // Fallback: read from project_files (backward compatibility)
    const { data: files } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId)
      .order('inferred_confidence', { ascending: false });

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files imported yet' }, { status: 400 });
    }

    const CANONICAL_ORDER = [
      'constraints', 'context', 'continuity', 'evals', 'examples',
      'goals', 'identity', 'memory', 'policies',
      'prompts', 'skills', 'style', 'tools',
    ];

    const KIND_TITLES: Record<string, string> = {
      identity: 'Identity', goals: 'Goals', context: 'Context',
      policies: 'Policies', constraints: 'Constraints', skills: 'Skills',
      style: 'Style', examples: 'Examples', tools: 'Tools',
      prompts: 'Prompts', evals: 'Evals', memory: 'Memory',
      continuity: 'Continuity',
    };

    const byKind: Record<string, typeof files[0][]> = {};
    for (const file of files) {
      if (!file.inferred_kind) continue;
      if (!byKind[file.inferred_kind]) byKind[file.inferred_kind] = [];
      byKind[file.inferred_kind].push(file);
    }

    const sections: string[] = [];
    const includedKinds: string[] = [];

    for (const kind of CANONICAL_ORDER) {
      const kindFiles = byKind[kind];
      if (!kindFiles || kindFiles.length === 0) continue;

      includedKinds.push(kind);
      const title = KIND_TITLES[kind] ?? kind;

      if (kind === 'identity' || kind === 'style') {
        const best = kindFiles[0];
        sections.push(`## ${title}\n\n${best.content}`);
      } else {
        const combined = kindFiles.map(f => f.content).join('\n\n');
        sections.push(`## ${title}\n\n${combined}`);
      }
    }

    const systemPrompt = sections.join('\n\n');

    return NextResponse.json({
      systemPrompt,
      layers: includedKinds,
      fileCount: files.filter(f => f.inferred_kind).length,
      tokenEstimate: Math.ceil(systemPrompt.length / 4),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Compile failed' }, { status: 500 });
  }
}
