'use client';

interface Snapshot {
  id: string;
  readiness_score: number;
  grade: string;
  action: string;
  notes: string | null;
  created_at: string;
}

function actionColor(action: string) {
  if (action === 'optimize') return { dot: 'bg-purple-500', text: 'text-purple-400' };
  if (action === 'eval') return { dot: 'bg-emerald-500', text: 'text-emerald-400' };
  return { dot: 'bg-slate-600', text: 'text-slate-500' };
}

export function Timeline({ snapshots }: { snapshots: Snapshot[] }) {
  const reversed = [...snapshots].reverse();

  return (
    <div className="relative pl-8">
      <div className="absolute left-[11px] top-0 bottom-0 w-0.5 bg-white/[0.04]" />

      {reversed.map((snap, i) => {
        const prev = i < reversed.length - 1 ? reversed[i + 1] : null;
        const delta = prev ? snap.readiness_score - prev.readiness_score : 0;
        const colors = actionColor(snap.action);

        return (
          <div key={snap.id} className="relative pb-6">
            <div className={`absolute -left-[21px] top-4 w-3.5 h-3.5 rounded-full border-2 border-[#0d0d1a] ${colors.dot}`} />
            <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4">
              <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>
                  {snap.action}
                </span>
                <span className="text-xs text-slate-700">
                  {new Date(snap.created_at).toLocaleDateString()} {new Date(snap.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-xl font-bold" style={{ color: snap.readiness_score >= 80 ? '#10b981' : snap.readiness_score >= 60 ? '#f59e0b' : '#ef4444' }}>
                  {snap.readiness_score}/100
                </span>
                {delta !== 0 && (
                  <span className={`text-sm font-semibold px-2 py-0.5 rounded-md ${delta > 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                    {delta > 0 ? '+' : ''}{delta}
                  </span>
                )}
                {snap.notes && <span className="text-xs text-slate-600">{snap.notes}</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
