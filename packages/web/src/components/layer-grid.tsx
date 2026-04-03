'use client';

interface LayerData {
  kind: string;
  score: number;
  status: string;
  fileCount: number;
}

function scoreColor(score: number): string {
  if (score >= 80) return '#10b981';
  if (score >= 60) return '#f59e0b';
  if (score >= 40) return '#f97316';
  if (score > 0) return '#ef4444';
  return '#334155';
}

const IMPORTANCE: Record<string, string> = {
  identity: 'critical',
  constraints: 'critical',
  context: 'recommended',
  skills: 'recommended',
  goals: 'recommended',
  style: 'recommended',
  policies: 'recommended',
  examples: 'optional',
  tools: 'optional',
  evals: 'optional',
  prompts: 'optional',
  memory: 'optional',
};

export function LayerGrid({ layers }: { layers: LayerData[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
      {layers.map(layer => {
        const color = scoreColor(layer.score);
        const importance = IMPORTANCE[layer.kind] ?? 'optional';

        return (
          <div
            key={layer.kind}
            className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4 relative overflow-hidden"
          >
            {/* Top accent bar */}
            <div
              className="absolute top-0 left-0 right-0 h-[3px]"
              style={{ background: color }}
            />

            <div className="text-[10px] text-slate-600 absolute top-2.5 right-3">{importance}</div>

            <div className="text-sm font-semibold capitalize mt-1 mb-1">{layer.kind}</div>
            <div className="text-2xl font-bold" style={{ color }}>{layer.score}</div>

            {/* Bar */}
            <div className="mt-2 h-1 bg-white/[0.04] rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${layer.score}%`, background: color }}
              />
            </div>

            <div className="mt-2 flex justify-between items-center">
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color }}>
                {layer.status}
              </span>
              {layer.fileCount > 0 && (
                <span className="text-[10px] text-slate-600">{layer.fileCount} files</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
