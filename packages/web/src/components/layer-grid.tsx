'use client';

import { useState } from 'react';

interface FileData {
  file_name: string;
  relative_path: string;
  source_type: string;
  content: string;
  content_length: number;
  inferred_confidence: number;
}

interface LayerData {
  kind: string;
  score: number;
  status: string;
  fileCount: number;
  files?: FileData[];
}

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  if (score > 0) return '#ef4444';
  return '#334155';
}

const IMPORTANCE: Record<string, string> = {
  identity: 'critical', constraints: 'critical',
  context: 'recommended', skills: 'recommended', goals: 'recommended',
  style: 'recommended', policies: 'recommended',
  examples: 'optional', tools: 'optional', evals: 'optional',
  prompts: 'optional', memory: 'optional',
};

const LAYER_INFO: Record<string, { title: string; description: string; guidance: string }> = {
  identity: {
    title: 'IDENTITY.md',
    description: 'Defines who the agent is, its role, and how it frames its purpose.',
    guidance: 'Create an IDENTITY.md that establishes the AI\'s name (if applicable), primary function, and personality traits. A strong identity layer makes responses consistent and recognizable.',
  },
  goals: {
    title: 'GOALS.md',
    description: 'Defines success criteria, priorities, and what matters most.',
    guidance: 'Create a GOALS.md with specific, measurable objectives. Good goals help the AI prioritize when handling ambiguous requests.',
  },
  context: {
    title: 'CONTEXT.md',
    description: 'Defines domain facts, business rules, terminology, and local knowledge.',
    guidance: 'Create a CONTEXT.md with domain-specific knowledge. This is usually the highest-value file because it stops the model from free-associating from general internet knowledge.',
  },
  policies: {
    title: 'POLICIES.md',
    description: 'Defines compliance, trust, legal, brand, or safety rules beyond ordinary constraints.',
    guidance: 'Create a POLICIES.md when you want organizational policy to remain inspectable as its own layer, separate from operational constraints.',
  },
  constraints: {
    title: 'CONSTRAINTS.md',
    description: 'Defines hard limits and non-negotiables.',
    guidance: 'Create a CONSTRAINTS.md with firm boundaries: "do not introduce dependencies," "never touch production secrets," "preserve backward compatibility."',
  },
  skills: {
    title: 'SKILLS.md',
    description: 'Defines procedural know-how, reusable workflows, and capabilities.',
    guidance: 'Create a SKILLS.md with step-by-step workflows and decision trees. Good skills make the AI reliable and predictable.',
  },
  style: {
    title: 'STYLE.md',
    description: 'Defines tone, formatting, response shape, and writing conventions.',
    guidance: 'Create a STYLE.md specifying formality level, formatting preferences, and how to match the user\'s emotional state.',
  },
  examples: {
    title: 'EXAMPLES.md',
    description: 'Defines few-shot examples, templates, or canonical transformations.',
    guidance: 'Create an EXAMPLES.md with concrete before/after examples. The most effective way to calibrate output quality.',
  },
  tools: {
    title: 'TOOLS.md',
    description: 'Defines available tools, their purpose, when to use them, and usage rules.',
    guidance: 'Create a TOOLS.md listing what tools exist, when to use them, and any invocation rules.',
  },
  prompts: {
    title: 'PROMPTS.md',
    description: 'Defines reusable prompt fragments, message templates, or tested instruction snippets.',
    guidance: 'Create a PROMPTS.md with tested prompt patterns and templates for common interactions.',
  },
  evals: {
    title: 'EVALS.md',
    description: 'Defines evaluation intent, test cases, assertions, or acceptance criteria.',
    guidance: 'Create an EVALS.md with test scenarios and expected outcomes. Lets you measure if your agent is actually following instructions.',
  },
  memory: {
    title: 'MEMORY.md',
    description: 'Defines placeholder or default memory — runtime-injectable by default.',
    guidance: 'Create a MEMORY.md with default context placeholders. stAIpler marks this as runtime-injectable for consumers to replace with actual session state.',
  },
};

function LayerModal({ layer, onClose }: { layer: LayerData; onClose: () => void }) {
  const [activeFileIndex, setActiveFileIndex] = useState(0);
  const info = LAYER_INFO[layer.kind];
  const color = scoreColor(layer.score);
  const importance = IMPORTANCE[layer.kind] ?? 'optional';
  const files = layer.files ?? [];
  const hasFiles = files.length > 0;
  const activeFile = hasFiles ? files[activeFileIndex] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative bg-[#0d0d1a] border border-white/[0.08] rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.04] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-lg font-bold capitalize">{layer.kind}</span>
                <span className="text-2xl font-bold" style={{ color }}>{layer.score}</span>
                <span className="text-xs text-slate-600">/100</span>
              </div>
              <span className="text-xs text-slate-500">{info?.title} &middot; {importance}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-300 transition text-xl leading-none">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Layer description */}
          <div className="px-6 py-4 border-b border-white/[0.04]">
            <p className="text-sm text-slate-300">{info?.description}</p>
            {layer.status === 'missing' && (
              <div className="mt-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                <div className="text-xs font-semibold text-amber-400 mb-1">How to create this layer</div>
                <p className="text-xs text-slate-400 leading-relaxed">{info?.guidance}</p>
              </div>
            )}
          </div>

          {/* Files */}
          {hasFiles ? (
            <>
              {files.length > 1 && (
                <div className="px-6 pt-3 flex gap-2 flex-wrap">
                  {files.map((f, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveFileIndex(i)}
                      className={`px-3 py-1 rounded-md text-xs font-mono transition ${
                        i === activeFileIndex
                          ? 'bg-purple-500/15 text-purple-400 border border-purple-500/20'
                          : 'bg-white/[0.03] text-slate-500 border border-white/[0.04] hover:text-slate-300'
                      }`}
                    >
                      {f.file_name}
                    </button>
                  ))}
                </div>
              )}

              {activeFile && (
                <div className="px-6 py-4">
                  <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
                    <span className="text-xs font-mono text-slate-400">{activeFile.relative_path}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] text-slate-600">{activeFile.content_length?.toLocaleString()} chars</span>
                      <span className="text-[10px] text-slate-600">{Math.round((activeFile.inferred_confidence ?? 0) * 100)}% confidence</span>
                      <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 text-slate-500">{activeFile.source_type}</span>
                    </div>
                  </div>
                  <pre className="bg-[#06060e] border border-white/[0.04] rounded-xl p-4 text-xs text-slate-300 leading-relaxed overflow-x-auto whitespace-pre-wrap font-mono max-h-[400px] overflow-y-auto">
                    {activeFile.content}
                  </pre>
                </div>
              )}
            </>
          ) : (
            <div className="px-6 py-10 text-center">
              <div className="text-3xl mb-3 opacity-30">&#128196;</div>
              <div className="text-sm text-slate-500 mb-1">No files for this layer</div>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                Import files via a data source or upload a <span className="font-mono text-purple-400">{info?.title}</span> file to populate this layer.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/[0.04] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: color }} />
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color }}>{layer.status}</span>
          </div>
          <span className="text-[10px] text-slate-600">{layer.fileCount} file{layer.fileCount !== 1 ? 's' : ''} contributing</span>
        </div>
      </div>
    </div>
  );
}

export function LayerGrid({ layers }: { layers: LayerData[] }) {
  const [selectedLayer, setSelectedLayer] = useState<LayerData | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {layers.map(layer => {
          const color = scoreColor(layer.score);
          const importance = IMPORTANCE[layer.kind] ?? 'optional';

          return (
            <button
              key={layer.kind}
              onClick={() => setSelectedLayer(layer)}
              className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4 relative overflow-hidden text-left hover:border-purple-500/20 hover:bg-white/[0.01] transition-all cursor-pointer group"
            >
              <div className="absolute top-0 left-0 right-0 h-[3px]" style={{ background: color }} />
              <div className="text-[10px] text-slate-600 absolute top-2.5 right-3">{importance}</div>
              <div className="text-sm font-semibold capitalize mt-1 mb-1 group-hover:text-purple-300 transition">{layer.kind}</div>
              <div className="text-2xl font-bold" style={{ color }}>{layer.score}</div>
              <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${layer.score}%`, background: color }} />
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>{layer.status}</span>
                {layer.fileCount > 0 && <span className="text-[10px] text-slate-600">{layer.fileCount} files</span>}
              </div>
            </button>
          );
        })}
      </div>

      {selectedLayer && (
        <LayerModal layer={selectedLayer} onClose={() => setSelectedLayer(null)} />
      )}
    </>
  );
}
