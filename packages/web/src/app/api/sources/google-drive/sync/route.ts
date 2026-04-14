import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { decrypt, encrypt } from '@/lib/crypto';
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

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
}

async function refreshAccessToken(refreshTokenEncrypted: string): Promise<{ access_token: string; expires_in: number } | null> {
  const refreshToken = decrypt(refreshTokenEncrypted);
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) return null;
  return await res.json();
}

async function getAccessToken(config: any, supabase: any, sourceId: string): Promise<string | null> {
  // Check if current token is still valid
  if (config.token_expiry && Date.now() < config.token_expiry - 60000) {
    try {
      return decrypt(config.access_token_encrypted);
    } catch {
      // Token decryption failed, try refresh
    }
  }

  // Refresh the token
  if (config.refresh_token_encrypted) {
    const refreshed = await refreshAccessToken(config.refresh_token_encrypted);
    if (refreshed) {
      await supabase
        .from('data_sources')
        .update({
          config: {
            ...config,
            access_token_encrypted: encrypt(refreshed.access_token),
            token_expiry: Date.now() + refreshed.expires_in * 1000,
          },
        })
        .eq('id', sourceId);
      return refreshed.access_token;
    }
  }

  // Try the stored token as a last resort
  try {
    return decrypt(config.access_token_encrypted);
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, sourceId, fileIds } = await request.json();

    // Get data source with tokens
    const { data: source } = await supabase
      .from('data_sources')
      .select('*')
      .eq('id', sourceId)
      .single();

    if (!source) return NextResponse.json({ error: 'Data source not found' }, { status: 404 });

    const accessToken = await getAccessToken(source.config, supabase, sourceId);
    if (!accessToken) {
      return NextResponse.json({ error: 'Google Drive token expired. Please reconnect.' }, { status: 401 });
    }

    // If no fileIds specified, list files for the user to pick
    if (!fileIds) {
      const listRes = await fetch(
        'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
          q: "mimeType='application/vnd.google-apps.document' or mimeType='text/plain' or mimeType='text/markdown'",
          fields: 'files(id,name,mimeType,modifiedTime)',
          orderBy: 'modifiedTime desc',
          pageSize: '100',
        }),
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (!listRes.ok) {
        return NextResponse.json({ error: 'Failed to list Google Drive files' }, { status: 500 });
      }

      const { files } = await listRes.json();
      return NextResponse.json({ files: files ?? [], phase: 'pick' });
    }

    // ---- Sync selected files (connector-specific fetching) ----

    await supabase
      .from('data_sources')
      .update({ status: 'syncing' })
      .eq('id', sourceId);

    const importedFiles: { name: string; content: string; driveUrl: string }[] = [];

    for (const fileId of fileIds as string[]) {
      const exportRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      if (exportRes.ok) {
        const content = await exportRes.text();
        const metaRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );
        const meta = metaRes.ok ? await metaRes.json() : { name: fileId };
        importedFiles.push({
          name: meta.name,
          content,
          driveUrl: `https://docs.google.com/document/d/${fileId}`,
        });
      }
    }

    // ---- Stage 1: Ingestion ----

    const rawInputs: RawInput[] = importedFiles.map(f => ({
      title: f.name,
      content: f.content,
      sourceUrl: f.driveUrl,
    }));

    const sourceDocs = normalizeToSourceDocuments(rawInputs, {
      projectId,
      dataSourceId: sourceId,
      provider: 'google-docs',
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
    await supabase
      .from('data_sources')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', sourceId);

    const { readinessScore, grade, layerScores } = computeReadinessScore(result.resolvedLayers);
    const reviewItems = buildReviewItems(result.resolvedLayers, result.candidates);

    return NextResponse.json({
      success: true,
      filesFound: importedFiles.length,
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
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Sync failed' }, { status: 500 });
  }
}
