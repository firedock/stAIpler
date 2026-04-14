import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  normalizeToSourceDocuments,
  runPipeline,
  computeReadinessScore,
  buildReviewItems,
} from '@staipler/core';
import type { RawInput } from '@staipler/core';
import {
  storeSourceDocuments,
  storeLayerCandidates,
  storeCompiledBundle,
  backfillProjectFiles,
  logTransformations,
} from '@/lib/pipeline/store';

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

    // ---- Stage 1: Ingestion ----

    const rawInputs: RawInput[] = [];
    for (const file of files) {
      const content = await file.text();
      rawInputs.push({
        title: file.name,
        content,
      });
    }

    const sourceDocs = normalizeToSourceDocuments(rawInputs, {
      projectId,
      dataSourceId: source?.id,
      provider: 'file-upload',
    });

    // ---- Stages 2-4: Extract → Organize → Compile ----

    const result = await runPipeline(sourceDocs);

    // ---- Persist results ----

    await storeSourceDocuments(supabase, result.sourceDocuments);
    await storeLayerCandidates(supabase, result.candidates);
    await storeCompiledBundle(supabase, projectId, result.bundle, result.resolvedLayers);
    await backfillProjectFiles(supabase, projectId, result.sourceDocuments, result.candidates);
    await logTransformations(supabase, projectId, result.transformations);

    // Update data source status
    if (source?.id) {
      await supabase
        .from('data_sources')
        .update({ status: 'connected', last_synced_at: new Date().toISOString() })
        .eq('id', source.id);
    }

    const { readinessScore, grade, layerScores } = computeReadinessScore(result.resolvedLayers);
    const reviewItems = buildReviewItems(result.resolvedLayers, result.candidates);

    return NextResponse.json({
      success: true,
      filesFound: files.length,
      candidateCount: result.candidates.length,
      conflictCount: result.bundle.conflicts.length,
      populatedLayers: result.bundle.sections.map(s => s.layer),
      gaps: result.bundle.gaps,
      needsReview: reviewItems.length > 0,
      reviewItems,
      readinessScore,
      grade,
      layerScores,
      transformations: {
        deduplicatedCount: result.transformations.mergedCandidates.length,
        autoResolvedCount: result.transformations.autoResolutions.length,
        gapReasons: result.transformations.gapReasons,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
