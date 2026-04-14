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

// Known instruction file patterns to look for in a repo
const INSTRUCTION_FILES = [
  'CLAUDE.md', 'AGENTS.md', 'GEMINI.md', 'README.md',
  'IDENTITY.md', 'GOALS.md', 'CONTEXT.md', 'CONSTRAINTS.md',
  'SKILLS.md', 'STYLE.md', 'EXAMPLES.md', 'TOOLS.md',
  'MEMORY.md', 'POLICIES.md', 'EVALS.md', 'PROMPTS.md',
  'CONVENTIONS.md', 'ARCHITECTURE.md', 'PLAN.md', 'API.md',
  'SECURITY.md', 'TESTING.md', 'CONTRIBUTING.md', 'CHANGELOG.md',
  'AIDER.md', '.cursorrules',
  '.github/copilot-instructions.md',
];

// Also scan these directories for .md files
const SCAN_DIRS = ['docs', 'library', '.github/instructions', '.cursor/rules'];

interface GitHubFile {
  name: string;
  path: string;
  type: string;
  download_url: string | null;
  size: number;
}

async function fetchGitHubFile(owner: string, repo: string, path: string): Promise<string | null> {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${path}`, {
      headers: { 'User-Agent': 'stAIpler/0.1' },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function listGitHubDir(owner: string, repo: string, path: string): Promise<GitHubFile[]> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      headers: { 'User-Agent': 'stAIpler/0.1', 'Accept': 'application/vnd.github.v3+json' },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId, repoUrl } = await request.json();

    // Parse owner/repo from URL
    const match = repoUrl.match(/github\.com\/([^/]+)\/([^/\s#?]+)/);
    if (!match) return NextResponse.json({ error: 'Invalid GitHub URL' }, { status: 400 });
    const [, owner, repo] = match;
    const repoName = repo.replace(/\.git$/, '');

    // Create data source record
    const { data: source, error: sourceError } = await supabase
      .from('data_sources')
      .insert({
        project_id: projectId,
        name: `${owner}/${repoName}`,
        provider: 'github',
        config: { owner, repo: repoName, url: repoUrl },
        status: 'syncing',
      })
      .select()
      .single();

    if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

    // ---- Fetch raw content (connector-specific) ----

    const rawFiles: { path: string; content: string }[] = [];

    for (const filename of INSTRUCTION_FILES) {
      const content = await fetchGitHubFile(owner, repoName, filename);
      if (content) rawFiles.push({ path: filename, content });
    }

    for (const dir of SCAN_DIRS) {
      const dirFiles = await listGitHubDir(owner, repoName, dir);
      for (const file of dirFiles) {
        if (file.type === 'file' && (file.name.endsWith('.md') || file.name.endsWith('.mdc'))) {
          if (!rawFiles.some(f => f.path === file.path)) {
            const content = await fetchGitHubFile(owner, repoName, file.path);
            if (content) rawFiles.push({ path: file.path, content });
          }
        }
      }
    }

    // ---- Stage 1: Ingestion ----

    const rawInputs: RawInput[] = rawFiles.map(f => ({
      title: f.path.split('/').pop() ?? f.path,
      content: f.content,
      sourceUrl: `https://github.com/${owner}/${repoName}/blob/HEAD/${f.path}`,
    }));

    const sourceDocs = normalizeToSourceDocuments(rawInputs, {
      projectId,
      dataSourceId: source.id,
      provider: 'github',
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
      .eq('id', source.id);

    const { readinessScore, grade, layerScores } = computeReadinessScore(result.resolvedLayers);
    const reviewItems = buildReviewItems(result.resolvedLayers, result.candidates);

    return NextResponse.json({
      success: true,
      filesFound: rawFiles.length,
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
