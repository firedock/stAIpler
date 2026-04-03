import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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
  'CONVENTIONS.md': 'constraints', 'SECURITY.md': 'constraints',
  'ARCHITECTURE.md': 'context', 'PLAN.md': 'goals', 'API.md': 'context',
  'TESTING.md': 'context', 'CONTRIBUTING.md': 'constraints',
  'CHANGELOG.md': 'context', 'README.md': 'context',
};

const SOURCE_TYPE_MAP: Record<string, string> = {
  'CLAUDE.md': 'claude-md', 'AGENTS.md': 'agents-md', 'GEMINI.md': 'gemini-md',
  'CONVENTIONS.md': 'conventions-md', '.cursorrules': 'cursor-rules',
  'copilot-instructions.md': 'copilot-instructions',
};

function inferKind(filename: string, content: string): { kind: string | null; confidence: number } {
  // Check filename first
  const basename = filename.split('/').pop() ?? filename;
  if (FILENAME_TO_KIND[basename]) {
    return { kind: FILENAME_TO_KIND[basename], confidence: 0.9 };
  }

  // Score by content keywords
  let bestKind: string | null = null;
  let bestScore = 0;
  for (const [kind, patterns] of Object.entries(KIND_SIGNALS)) {
    const score = patterns.filter(p => p.test(content)).length;
    if (score > bestScore) {
      bestScore = score;
      bestKind = kind;
    }
  }

  if (bestScore === 0) return { kind: null, confidence: 0 };
  const maxPatterns = KIND_SIGNALS[bestKind!].length;
  return { kind: bestKind, confidence: Math.min(0.95, 0.3 + (bestScore / maxPatterns) * 0.65) };
}

function getSourceType(filename: string): string {
  const basename = filename.split('/').pop() ?? filename;
  return SOURCE_TYPE_MAP[basename] ?? 'generic-md';
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

    // Fetch known instruction files from root
    const files: { path: string; content: string }[] = [];

    for (const filename of INSTRUCTION_FILES) {
      const content = await fetchGitHubFile(owner, repoName, filename);
      if (content) {
        files.push({ path: filename, content });
      }
    }

    // Scan known directories for additional .md files
    for (const dir of SCAN_DIRS) {
      const dirFiles = await listGitHubDir(owner, repoName, dir);
      for (const file of dirFiles) {
        if (file.type === 'file' && (file.name.endsWith('.md') || file.name.endsWith('.mdc'))) {
          const alreadyFound = files.some(f => f.path === file.path);
          if (!alreadyFound) {
            const content = await fetchGitHubFile(owner, repoName, file.path);
            if (content) {
              files.push({ path: file.path, content });
            }
          }
        }
      }
    }

    // Classify and save files
    const projectFiles = files.map(f => {
      const { kind, confidence } = inferKind(f.path, f.content);
      return {
        project_id: projectId,
        file_name: f.path.split('/').pop() ?? f.path,
        relative_path: f.path,
        source_type: getSourceType(f.path),
        inferred_kind: kind,
        inferred_confidence: confidence,
        content_length: f.content.length,
        content: f.content,
      };
    });

    if (projectFiles.length > 0) {
      await supabase.from('project_files').insert(projectFiles);
    }

    // Calculate layer scores
    const layerScores: Record<string, number> = {};
    for (const pf of projectFiles) {
      if (pf.inferred_kind) {
        const current = layerScores[pf.inferred_kind] ?? 0;
        const fileScore = Math.min(100, 30 + (pf.content_length > 200 ? 15 : 0) + (pf.content_length > 500 ? 10 : 0) + (pf.content_length > 1000 ? 10 : 0) + Math.round(pf.inferred_confidence * 20) + 15);
        layerScores[pf.inferred_kind] = Math.max(current, fileScore);
      }
    }

    // Calculate overall readiness
    const allKinds = ['identity', 'goals', 'context', 'policies', 'constraints', 'skills', 'style', 'examples', 'tools', 'prompts', 'evals', 'memory'];
    const weights: Record<string, number> = { identity: 3, constraints: 3, context: 2, skills: 2, goals: 2, style: 2, policies: 2, examples: 1, tools: 1, evals: 1, prompts: 1, memory: 1 };
    let totalWeight = 0;
    let weightedScore = 0;
    for (const kind of allKinds) {
      const w = weights[kind] ?? 1;
      totalWeight += w;
      weightedScore += (layerScores[kind] ?? 0) * w;
    }
    const readinessScore = Math.round(weightedScore / totalWeight);
    const grade = readinessScore >= 90 ? 'A' : readinessScore >= 80 ? 'B' : readinessScore >= 70 ? 'C' : readinessScore >= 60 ? 'D' : 'F';

    // Update project score
    await supabase
      .from('projects')
      .update({ readiness_score: readinessScore, grade })
      .eq('id', projectId);

    // Save snapshot
    await supabase.from('snapshots').insert({
      project_id: projectId,
      readiness_score: readinessScore,
      grade,
      layer_scores: layerScores,
      action: 'scan',
      notes: `GitHub import: ${owner}/${repoName} — ${files.length} files found`,
    });

    // Update data source status
    await supabase
      .from('data_sources')
      .update({ status: 'connected', last_synced_at: new Date().toISOString() })
      .eq('id', source.id);

    return NextResponse.json({
      success: true,
      filesFound: files.length,
      readinessScore,
      grade,
      layerScores,
    });

  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
