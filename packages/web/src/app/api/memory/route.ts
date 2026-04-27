import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/memory?projectId=xxx
 * Returns the memory graph for a project — nodes, links, clusters, stats.
 * Built from project_files, data_sources, and extracted_context.
 */
export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const url = new URL(request.url);
    const projectId = url.searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });

    // Fetch all project data
    const [filesRes, sourcesRes, contextRes, snapshotsRes, projectRes] = await Promise.all([
      supabase.from('project_files').select('*').eq('project_id', projectId),
      supabase.from('data_sources').select('*').eq('project_id', projectId),
      supabase.from('extracted_context').select('*, data_sources!inner(project_id)').eq('data_sources.project_id', projectId),
      supabase.from('snapshots').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(20),
      supabase.from('projects').select('name, readiness_score, grade').eq('id', projectId).single(),
    ]);

    const files = filesRes.data ?? [];
    const sources = sourcesRes.data ?? [];
    const contexts = contextRes.data ?? [];
    const snapshots = snapshotsRes.data ?? [];
    const project = projectRes.data;

    const LAYER_COLORS: Record<string, string> = {
      constraints: '#ef4444', context: '#3b82f6', continuity: '#84cc16',
      evals: '#6b7280', examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
      memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
      skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
    };

    const ALL_LAYERS = [
      'constraints', 'context', 'continuity', 'evals', 'examples',
      'goals', 'identity', 'memory', 'policies',
      'prompts', 'skills', 'style', 'tools',
    ];

    // ---- Build nodes ----
    const nodes: any[] = [];

    // Instruction files → nodes
    for (const file of files) {
      nodes.push({
        id: `file-${file.id}`,
        title: file.file_name,
        content: (file.content ?? '').slice(0, 500),
        sourceType: file.source_type === 'ai-generated' ? 'ai-generated' : 'instruction-file',
        sourcePath: file.relative_path,
        layer: file.inferred_kind,
        confidence: file.inferred_confidence ?? 0,
        size: file.content_length ?? 0,
        createdAt: file.created_at,
        updatedAt: file.created_at,
        lastUsedAt: null,
        useCount: 0,
        tags: [file.inferred_kind, file.source_type].filter(Boolean),
      });
    }

    // Extracted context from data sources → nodes
    for (const ctx of contexts) {
      nodes.push({
        id: `ctx-${ctx.id}`,
        title: ctx.source_title ?? 'Extracted context',
        content: (ctx.extracted_content ?? '').slice(0, 500),
        sourceType: 'data-source',
        sourcePath: ctx.source_url ?? '',
        layer: ctx.mapped_kind,
        confidence: ctx.mapped_kind ? 0.7 : 0.3,
        size: (ctx.extracted_content ?? '').length,
        createdAt: ctx.created_at,
        updatedAt: ctx.created_at,
        lastUsedAt: null,
        useCount: 0,
        tags: [ctx.mapped_kind, 'extracted'].filter(Boolean),
      });
    }

    // ---- Build links ----
    const links: any[] = [];

    // Same-layer reinforcement
    const byLayer = new Map<string, any[]>();
    for (const node of nodes) {
      if (node.layer) {
        if (!byLayer.has(node.layer)) byLayer.set(node.layer, []);
        byLayer.get(node.layer)!.push(node);
      }
    }
    for (const [, layerNodes] of byLayer) {
      for (let i = 0; i < layerNodes.length; i++) {
        for (let j = i + 1; j < layerNodes.length; j++) {
          links.push({
            from: layerNodes[i].id,
            to: layerNodes[j].id,
            relationship: 'reinforces',
            strength: 0.8,
          });
        }
      }
    }

    // Cross-layer dependencies
    const layerDeps: [string, string, string][] = [
      ['constraints', 'context', 'depends-on'],
      ['style', 'identity', 'extends'],
      ['skills', 'tools', 'depends-on'],
      ['evals', 'goals', 'depends-on'],
    ];
    for (const [from, to, rel] of layerDeps) {
      const fromNodes = nodes.filter(n => n.layer === from);
      const toNodes = nodes.filter(n => n.layer === to);
      for (const f of fromNodes) {
        for (const t of toNodes) {
          links.push({ from: f.id, to: t.id, relationship: rel, strength: 0.5 });
        }
      }
    }

    // ---- Build clusters ----
    const clusters: any[] = [];

    // Layer clusters
    for (const layer of ALL_LAYERS) {
      const layerNodes = nodes.filter(n => n.layer === layer);
      if (layerNodes.length > 0) {
        const avgConf = layerNodes.reduce((s: number, n: any) => s + n.confidence, 0) / layerNodes.length;
        clusters.push({
          id: `layer-${layer}`,
          name: layer.charAt(0).toUpperCase() + layer.slice(1),
          type: 'layer',
          nodeIds: layerNodes.map((n: any) => n.id),
          confidence: Math.round(avgConf * 100) / 100,
          color: LAYER_COLORS[layer] ?? '#6b7280',
          status: avgConf >= 0.5 ? 'present' : 'weak',
        });
      } else {
        // Empty cluster — show as missing
        clusters.push({
          id: `layer-${layer}`,
          name: layer.charAt(0).toUpperCase() + layer.slice(1),
          type: 'layer',
          nodeIds: [],
          confidence: 0,
          color: LAYER_COLORS[layer] ?? '#6b7280',
          status: 'missing',
        });
      }
    }

    // Source clusters
    const sourceGroups = new Map<string, any[]>();
    for (const node of nodes) {
      if (!sourceGroups.has(node.sourceType)) sourceGroups.set(node.sourceType, []);
      sourceGroups.get(node.sourceType)!.push(node);
    }
    const sourceLabels: Record<string, string> = {
      'instruction-file': 'Instruction Files',
      'ai-generated': 'AI Generated',
      'data-source': 'Data Sources',
      'knowledge-base': 'Knowledge Base',
    };
    for (const [source, sourceNodes] of sourceGroups) {
      clusters.push({
        id: `source-${source}`,
        name: sourceLabels[source] ?? source,
        type: 'source',
        nodeIds: sourceNodes.map((n: any) => n.id),
        confidence: 1.0,
        color: '#6b7280',
      });
    }

    // ---- Stats ----
    const coverageByLayer: Record<string, number> = {};
    const coverageBySource: Record<string, number> = {};
    for (const node of nodes) {
      const layer = node.layer ?? 'unclassified';
      coverageByLayer[layer] = (coverageByLayer[layer] ?? 0) + 1;
      coverageBySource[node.sourceType] = (coverageBySource[node.sourceType] ?? 0) + 1;
    }

    const stats = {
      totalNodes: nodes.length,
      totalLinks: links.length,
      totalClusters: clusters.length,
      totalRetrievals: 0,
      coverageByLayer,
      coverageBySource,
      lastUpdated: new Date().toISOString(),
      projectName: project?.name ?? 'Unknown',
      readinessScore: project?.readiness_score ?? 0,
      grade: project?.grade ?? 'F',
    };

    // ---- Score history for timeline ----
    const history = snapshots.map((s: any) => ({
      timestamp: s.created_at,
      score: s.readiness_score,
      grade: s.grade,
      action: s.action,
      layerScores: s.layer_scores,
    }));

    return NextResponse.json({
      nodes,
      links,
      clusters,
      stats,
      history,
      retrievals: [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to build memory graph' },
      { status: 500 },
    );
  }
}
