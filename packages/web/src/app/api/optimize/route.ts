import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const CANONICAL_ORDER = [
  'constraints', 'context', 'evals', 'examples',
  'goals', 'identity', 'memory', 'policies',
  'prompts', 'skills', 'style', 'tools',
];

const LAYER_GUIDANCE: Record<string, string> = {
  identity: 'Define who the AI is, its role, persona, and core character.',
  goals: 'Define success criteria, priorities, and what matters most.',
  context: 'Provide domain knowledge, business rules, terminology, and local context.',
  policies: 'Define compliance, trust, legal, brand, or safety rules.',
  constraints: 'Define hard limits and non-negotiables — what the AI must never do.',
  skills: 'Define procedural know-how, workflows, and decision trees.',
  style: 'Define tone, formatting, response shape, writing conventions, AND communication dynamics — should the AI push back when it disagrees? Ask clarifying questions vs assume? Lead with answers or explanations? These interaction patterns are the most impactful style choices.',
  examples: 'Provide few-shot examples and canonical before/after transformations.',
  tools: 'Define available tools, when to use them, and usage rules.',
  prompts: 'Define reusable prompt fragments and tested instruction snippets.',
  evals: 'Define test cases, assertions, and acceptance criteria.',
  memory: 'Define placeholder memory for runtime session/user context injection.',
};

const IMPORTANCE: Record<string, string> = {
  identity: 'critical', constraints: 'critical',
  context: 'recommended', skills: 'recommended', goals: 'recommended',
  style: 'recommended', policies: 'recommended',
  examples: 'optional', tools: 'optional', evals: 'optional',
  prompts: 'optional', memory: 'optional',
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { projectId } = await request.json();

    // Get existing files
    const { data: files } = await supabase
      .from('project_files')
      .select('*')
      .eq('project_id', projectId);

    const existingKinds = new Set((files ?? []).filter(f => f.inferred_kind).map(f => f.inferred_kind));

    // Find missing critical and recommended layers
    const missingLayers = CANONICAL_ORDER.filter(kind => {
      if (existingKinds.has(kind)) return false;
      const imp = IMPORTANCE[kind];
      return imp === 'critical' || imp === 'recommended';
    });

    if (missingLayers.length === 0) {
      return NextResponse.json({ message: 'All critical and recommended layers are present!', generated: [] });
    }

    // Build context from existing files for the AI
    const existingContext = (files ?? [])
      .filter(f => f.content)
      .slice(0, 5)
      .map(f => `--- ${f.file_name} (${f.inferred_kind ?? 'unknown'}) ---\n${(f.content ?? '').slice(0, 500)}`)
      .join('\n\n');

    // Get project info
    const { data: project } = await supabase
      .from('projects')
      .select('name, description')
      .eq('id', projectId)
      .single();

    const generated: { kind: string; content: string }[] = [];

    // Generate each missing layer using Claude CLI
    for (const kind of missingLayers) {
      const { execSync } = await import('child_process');
      const { writeFileSync, mkdirSync } = await import('fs');
      const { resolve } = await import('path');

      const tmpDir = '/tmp/staipler-optimize';
      mkdirSync(tmpDir, { recursive: true });

      const prompt = `You are an expert at writing AI instruction layers. Generate a high-quality "${kind}" layer for a project called "${project?.name ?? 'Unknown'}".

Project description: ${project?.description ?? 'No description'}

What a "${kind}" layer should contain:
${LAYER_GUIDANCE[kind]}

Existing project context:
${existingContext || 'No existing files.'}

Requirements:
- Output ONLY the raw markdown content (no code fences)
- Start with a clear heading
- Be specific and actionable, not generic
- 200-400 words
- Draw from the existing project context to make it relevant

Generate the ${kind} layer now:`;

      const promptFile = resolve(tmpDir, `prompt-${Date.now()}.txt`);
      writeFileSync(promptFile, prompt);

      try {
        const result = execSync(`cat '${promptFile}' | claude -p --model sonnet`, {
          encoding: 'utf-8',
          timeout: 120_000,
          maxBuffer: 2 * 1024 * 1024,
          shell: '/bin/bash',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();

        // Strip code fences if present
        let content = result;
        if (content.startsWith('```')) {
          content = content.replace(/^```(?:markdown|md)?\n?/, '').replace(/\n?```$/, '').trim();
        }

        generated.push({ kind, content });

        // Save to project_files
        await supabase.from('project_files').insert({
          project_id: projectId,
          file_name: `${kind.toUpperCase()}.md`,
          relative_path: `optimized/${kind.toUpperCase()}.md`,
          source_type: 'ai-generated',
          inferred_kind: kind,
          inferred_confidence: 0.95,
          content_length: content.length,
          content,
        });
      } catch (err) {
        // Skip this layer if generation fails
        console.error(`Failed to generate ${kind}:`, err);
      } finally {
        try { execSync(`rm -f '${promptFile}'`); } catch {}
      }
    }

    // Recalculate scores
    const { data: allFiles } = await supabase
      .from('project_files')
      .select('inferred_kind, inferred_confidence, content_length')
      .eq('project_id', projectId);

    const layerScores: Record<string, number> = {};
    for (const f of (allFiles ?? [])) {
      if (f.inferred_kind) {
        const current = layerScores[f.inferred_kind] ?? 0;
        const fileScore = Math.min(100, 30 + (f.content_length > 200 ? 15 : 0) + (f.content_length > 500 ? 10 : 0) + (f.content_length > 1000 ? 10 : 0) + Math.round((f.inferred_confidence ?? 0) * 20) + 15);
        layerScores[f.inferred_kind] = Math.max(current, fileScore);
      }
    }

    const weights: Record<string, number> = { identity: 3, constraints: 3, context: 2, skills: 2, goals: 2, style: 2, policies: 2, examples: 1, tools: 1, evals: 1, prompts: 1, memory: 1 };
    let totalWeight = 0, weightedScore = 0;
    for (const kind of CANONICAL_ORDER) {
      const w = weights[kind] ?? 1;
      totalWeight += w;
      weightedScore += (layerScores[kind] ?? 0) * w;
    }
    const readinessScore = Math.round(weightedScore / totalWeight);
    const grade = readinessScore >= 90 ? 'A' : readinessScore >= 80 ? 'B' : readinessScore >= 70 ? 'C' : readinessScore >= 60 ? 'D' : 'F';

    await supabase.from('projects').update({ readiness_score: readinessScore, grade }).eq('id', projectId);
    await supabase.from('snapshots').insert({
      project_id: projectId,
      readiness_score: readinessScore,
      grade,
      layer_scores: layerScores,
      action: 'optimize',
      notes: `AI generated ${generated.length} layers: ${generated.map(g => g.kind).join(', ')}`,
    });

    return NextResponse.json({
      success: true,
      generated: generated.map(g => g.kind),
      readinessScore,
      grade,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Optimize failed' }, { status: 500 });
  }
}
