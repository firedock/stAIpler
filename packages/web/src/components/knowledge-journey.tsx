'use client';

/**
 * Knowledge Journey — three-column view showing how raw documents
 * become agent expertise through the evidence pipeline.
 *
 * Column 1: Your Sources (grouped by provider)
 * Column 2: What We Found (extracted candidates grouped by layer)
 * Column 3: Agent Expertise (compiled layers with authority status)
 */

const LAYER_COLORS: Record<string, string> = {
  constraints: '#ef4444', context: '#3b82f6', evals: '#6b7280',
  examples: '#f59e0b', goals: '#10b981', identity: '#8b5cf6',
  memory: '#ec4899', policies: '#f97316', prompts: '#06b6d4',
  skills: '#14b8a6', style: '#a855f7', tools: '#64748b',
};

const PROVIDER_LABELS: Record<string, string> = {
  github: 'GitHub',
  'google-docs': 'Google Drive',
  'file-upload': 'File Upload',
  url: 'URL Import',
  notion: 'Notion',
  'ai-generated': 'AI Generated',
};

const METHOD_LABELS: Record<string, string> = {
  filename: 'Matched by filename',
  filetype: 'Known file type',
  heuristic: 'Found by content analysis',
  semantic: 'Identified by AI',
};

function confidenceLabel(confidence: number): { text: string; color: string } {
  if (confidence >= 0.7) return { text: 'High', color: 'text-emerald-400' };
  if (confidence >= 0.4) return { text: 'Medium', color: 'text-amber-400' };
  return { text: 'Low', color: 'text-red-400' };
}

function statusBadge(status: string) {
  switch (status) {
    case 'source-grounded':
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">From your docs</span>;
    case 'ai-generated':
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 font-medium">AI-generated</span>;
    case 'mixed':
      return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Mixed</span>;
    default:
      return null;
  }
}

interface KnowledgeJourneyProps {
  sourceDocuments: any[];
  layerCandidates: any[];
  compiledBundle: any;
}

export function KnowledgeJourney({ sourceDocuments, layerCandidates, compiledBundle }: KnowledgeJourneyProps) {
  // Group sources by provider
  const sourcesByProvider = new Map<string, any[]>();
  for (const doc of sourceDocuments) {
    const provider = doc.metadata?.provider ?? 'unknown';
    if (!sourcesByProvider.has(provider)) sourcesByProvider.set(provider, []);
    sourcesByProvider.get(provider)!.push(doc);
  }

  // Group candidates by layer
  const candidatesByLayer = new Map<string, any[]>();
  for (const candidate of layerCandidates) {
    if (!candidatesByLayer.has(candidate.layer)) candidatesByLayer.set(candidate.layer, []);
    candidatesByLayer.get(candidate.layer)!.push(candidate);
  }

  const sections = compiledBundle?.sections ?? [];
  const gaps = compiledBundle?.gaps ?? [];
  const conflicts = compiledBundle?.conflicts ?? [];

  const hasPipelineData = sourceDocuments.length > 0;

  if (!hasPipelineData) {
    return (
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-8 text-center">
        <p className="text-sm text-slate-500">
          Connect a data source to see how your documents become agent expertise.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Column 1: Your Sources */}
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-blue-500" />
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Your Sources</h4>
        </div>
        <p className="text-[10px] text-slate-600 mb-3">{sourceDocuments.length} documents imported</p>

        <div className="space-y-3">
          {Array.from(sourcesByProvider.entries()).map(([provider, docs]) => (
            <div key={provider}>
              <div className="text-[11px] font-medium text-slate-400 mb-1">
                {PROVIDER_LABELS[provider] ?? provider}
              </div>
              <div className="space-y-1">
                {docs.map((doc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02] hover:bg-white/[0.04] transition">
                    <span className="text-[11px] text-slate-300 truncate flex-1 mr-2">{doc.title}</span>
                    <span className="text-[10px] text-slate-600 shrink-0">
                      {((doc.raw_content?.length ?? 0) / 1000).toFixed(1)}K
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Column 2: What We Found */}
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-purple-500" />
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">What We Found</h4>
        </div>
        <p className="text-[10px] text-slate-600 mb-3">
          {layerCandidates.length} knowledge extractions
          {conflicts.length > 0 && <span className="text-amber-400 ml-1">· {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''}</span>}
        </p>

        <div className="space-y-2">
          {Array.from(candidatesByLayer.entries())
            .sort(([, a], [, b]) => b.length - a.length)
            .map(([layer, candidates]) => (
            <div key={layer} className="px-2 py-2 rounded bg-white/[0.02]">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[layer] ?? '#64748b' }} />
                  <span className="text-[11px] font-medium text-slate-300 capitalize">{layer}</span>
                </div>
                <span className="text-[10px] text-slate-600">{candidates.length} found</span>
              </div>
              {candidates.slice(0, 2).map((c: any, i: number) => {
                const conf = confidenceLabel(c.confidence);
                return (
                  <div key={i} className="ml-3 mt-1">
                    <p className="text-[10px] text-slate-500 truncate">{(c.content ?? '').slice(0, 80)}...</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-[9px] ${conf.color}`}>{conf.text}</span>
                      <span className="text-[9px] text-slate-700">{METHOD_LABELS[c.extraction_method] ?? c.extraction_method}</span>
                    </div>
                  </div>
                );
              })}
              {candidates.length > 2 && (
                <p className="text-[9px] text-slate-700 ml-3 mt-1">+{candidates.length - 2} more</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Column 3: Agent Expertise */}
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Agent Expertise</h4>
        </div>
        <p className="text-[10px] text-slate-600 mb-3">
          {sections.length} layers compiled · {gaps.length} gaps
        </p>

        <div className="space-y-1.5">
          {sections.map((section: any, i: number) => (
            <div key={i} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02]">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: LAYER_COLORS[section.layer] ?? '#64748b' }} />
                <span className="text-[11px] text-slate-300 capitalize">{section.layer}</span>
              </div>
              {statusBadge(section.status)}
            </div>
          ))}
          {gaps.map((gap: string, i: number) => (
            <div key={`gap-${i}`} className="flex items-center justify-between px-2 py-1.5 rounded bg-white/[0.02] opacity-40">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full border border-slate-700" />
                <span className="text-[11px] text-slate-600 capitalize">{gap}</span>
              </div>
              <span className="text-[10px] text-slate-700">Not covered</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
