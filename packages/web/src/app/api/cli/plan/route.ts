import { NextResponse } from 'next/server';
import { authenticateCliRequest } from '@/lib/cli-auth';
import { createServiceClient } from '@/lib/supabase/service';
import { getLatestBundle } from '@/lib/pipeline/store';

/**
 * GET /api/cli/plan?projectId=<id>
 *
 * Returns the latest compiled instruction bundle for a project, in a shape
 * the CLI can write to disk as instruction files. Each section is a single
 * file the CLI should create or update.
 *
 * Auth: Bearer <stp_...> CLI token. Token must belong to a user who owns
 * the project.
 */
export async function GET(request: Request) {
  const userId = await authenticateCliRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Invalid or expired CLI token' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const projectId = searchParams.get('projectId');
  if (!projectId) {
    return NextResponse.json({ error: 'projectId query param required' }, { status: 400 });
  }

  const supabase = createServiceClient();

  // Verify the user owns this project (RLS doesn't apply to service client)
  const { data: project } = await supabase
    .from('projects')
    .select('id, name, readiness_score, grade, user_id')
    .eq('id', projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }
  if (project.user_id !== userId) {
    return NextResponse.json({ error: 'You do not have access to this project' }, { status: 403 });
  }

  // Get the compiled bundle (richest data — has provenance + status)
  const bundle = await getLatestBundle(supabase, projectId);

  if (bundle && bundle.sections.length > 0) {
    // Map bundle sections → file plan entries
    const files = bundle.sections.map((section: any) => ({
      layer: section.layer,
      filename: `${section.layer.toUpperCase()}.md`,
      content: section.content,
      status: section.status, // 'source-grounded' | 'ai-generated' | 'mixed'
      sourceCount: section.sourceDocumentIds?.length ?? 0,
    }));

    return NextResponse.json({
      project: {
        id: project.id,
        name: project.name,
        readinessScore: project.readiness_score,
        grade: project.grade,
      },
      files,
      gaps: bundle.gaps ?? [],
      conflicts: bundle.conflicts ?? [],
      systemPrompt: bundle.systemPrompt,
      bundleHash: bundle.hash,
    });
  }

  // Fallback: no bundle yet, use raw project_files
  const { data: projectFiles } = await supabase
    .from('project_files')
    .select('inferred_kind, content, file_name, source_type')
    .eq('project_id', projectId)
    .not('inferred_kind', 'is', null);

  if (!projectFiles || projectFiles.length === 0) {
    return NextResponse.json({
      project: { id: project.id, name: project.name, readinessScore: 0, grade: 'F' },
      files: [],
      gaps: [],
      conflicts: [],
      systemPrompt: '',
      bundleHash: null,
      message: 'This project has no source material yet. Connect a data source on staipler.com first.',
    });
  }

  // Group by layer (last-wins; the bundle handles this better but we fall back gracefully)
  const byLayer: Record<string, { content: string; sourceCount: number }> = {};
  for (const f of projectFiles) {
    const k = f.inferred_kind!;
    if (!byLayer[k]) byLayer[k] = { content: f.content || '', sourceCount: 1 };
    else {
      byLayer[k].content += `\n\n${f.content || ''}`;
      byLayer[k].sourceCount++;
    }
  }

  const files = Object.entries(byLayer).map(([layer, data]) => ({
    layer,
    filename: `${layer.toUpperCase()}.md`,
    content: data.content,
    status: 'source-grounded' as const,
    sourceCount: data.sourceCount,
  }));

  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      readinessScore: project.readiness_score,
      grade: project.grade,
    },
    files,
    gaps: [],
    conflicts: [],
    systemPrompt: '',
    bundleHash: null,
  });
}
