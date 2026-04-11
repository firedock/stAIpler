import { createClient } from '@/lib/supabase/server';
import { generateInitReport } from '@staipler/core';
import type { AnalysisResult, ScanResult } from '@staipler/core';

/**
 * GET /api/init-report?projectId=xxx
 * Returns the same self-contained HTML report that `staipler init` generates,
 * built from project data in Supabase. Works on any device — no CLI required.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response('Unauthorized', { status: 401 });
    }

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) {
      return new Response('projectId required', { status: 400 });
    }

    // Fetch project data
    const [projectRes, filesRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', projectId).single(),
      supabase.from('project_files').select('*').eq('project_id', projectId),
    ]);

    if (!projectRes.data) {
      return new Response('Project not found', { status: 404 });
    }

    const project = projectRes.data;
    const files = filesRes.data ?? [];

    // ---- Reconstruct ScanResult and AnalysisResult from Supabase data ----

    const ALL_LAYERS = [
      'constraints', 'context', 'evals', 'examples',
      'goals', 'identity', 'memory', 'policies',
      'prompts', 'skills', 'style', 'tools',
    ];

    const LAYER_HINTS: Record<string, string> = {
      identity: 'Define who the AI is, its role and persona',
      goals: 'Success criteria and priorities',
      context: 'Domain knowledge and business rules',
      constraints: 'Hard limits and non-negotiables',
      skills: 'Workflows and decision trees',
      style: 'Tone, formatting, response shape',
      examples: 'Few-shot examples and templates',
      tools: 'Available tools and usage rules',
      policies: 'Compliance, legal, brand rules',
      evals: 'Test cases and acceptance criteria',
      prompts: 'Reusable prompt fragments',
      memory: 'Runtime session context',
    };

    const IMPORTANCE: Record<string, 'critical' | 'recommended' | 'optional'> = {
      identity: 'critical', constraints: 'critical',
      context: 'recommended', skills: 'recommended', goals: 'recommended',
      style: 'recommended', policies: 'recommended',
      examples: 'optional', tools: 'optional', evals: 'optional',
      prompts: 'optional', memory: 'optional',
    };

    // Build ScannedFiles from project_files
    const scannedFiles = files.map((f: any) => ({
      path: f.relative_path,
      relativePath: f.relative_path,
      name: f.file_name,
      content: f.content ?? '',
      sourceType: f.source_type,
      parsedAsset: null,
      inferredKind: f.inferred_kind,
      inferredConfidence: f.inferred_confidence ?? 0,
      contentLength: f.content_length ?? 0,
    }));

    // Group by layer
    const byKind: Record<string, any[]> = {};
    for (const f of scannedFiles) {
      if (f.inferredKind) {
        if (!byKind[f.inferredKind]) byKind[f.inferredKind] = [];
        byKind[f.inferredKind].push(f);
      }
    }

    const presentKinds = ALL_LAYERS.filter(k => byKind[k]?.length);
    const missingKinds = ALL_LAYERS.filter(k => !byKind[k]?.length);

    const scanResult: ScanResult = {
      scanRoot: project.name,
      files: scannedFiles as any,
      byKind: byKind as any,
      presentKinds: presentKinds as any,
      missingKinds: missingKinds as any,
      totalContentLength: scannedFiles.reduce((s, f) => s + f.contentLength, 0),
      knowledgeBase: [],
      memoryProvider: null,
      suggestions: [],
    };

    // Build LayerAnalysis for each layer
    const layers = ALL_LAYERS.map(kind => {
      const layerFiles = byKind[kind] ?? [];
      const fileScore = layerFiles.length === 0 ? 0 :
        Math.min(100, 30 +
          (layerFiles[0].contentLength > 200 ? 15 : 0) +
          (layerFiles[0].contentLength > 500 ? 10 : 0) +
          (layerFiles[0].contentLength > 1000 ? 10 : 0) +
          15 +
          Math.round((layerFiles[0].inferredConfidence ?? 0) * 20));

      const status = layerFiles.length === 0 ? 'missing' as const :
        fileScore < 40 ? 'weak' as const : 'present' as const;

      return {
        kind: kind as any,
        status,
        importance: IMPORTANCE[kind] ?? 'optional',
        files: layerFiles,
        diagnosis: status === 'missing' ? 'Not yet defined' : `${layerFiles.length} file(s) found`,
        recommendation: LAYER_HINTS[kind] ?? '',
        qualityScore: fileScore,
      };
    });

    const analysis: AnalysisResult = {
      readinessScore: project.readiness_score ?? 0,
      grade: project.grade ?? 'F',
      layers,
      criticalIssues: [],
      recommendations: [],
      summary: '',
      scan: scanResult,
    };

    // Generate the HTML using the same core function as the CLI
    const html = generateInitReport({
      projectName: project.name,
      analysis,
      scanResult,
      injectTarget: 'CLAUDE.md',
    });

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (err) {
    return new Response(
      `Error generating report: ${err instanceof Error ? err.message : 'Unknown error'}`,
      { status: 500 },
    );
  }
}
