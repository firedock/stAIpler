import Link from 'next/link';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10 border-emerald-500/20';
  if (score >= 60) return 'bg-amber-500/10 border-amber-500/20';
  if (score >= 40) return 'bg-orange-500/10 border-orange-500/20';
  return 'bg-red-500/10 border-red-500/20';
}

function scoreRing(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function gradeLabel(score: number): string {
  if (score >= 80) return 'Subject Expert';
  if (score >= 60) return 'Good Foundations';
  if (score >= 40) return 'Needs Context';
  return 'Flying Blind';
}

export function ProjectCard({ project }: { project: any }) {
  const score = project.readiness_score ?? 0;
  const grade = project.grade ?? 'F';
  const snapshotCount = project.snapshots?.[0]?.count ?? 0;

  const circumference = 2 * Math.PI * 20;
  const offset = circumference - (score / 100) * circumference;

  return (
    <Link href={`/dashboard/${project.id}`} className="block group">
      <div className="relative bg-gradient-to-br from-[#0d0d1a] to-[#0a0a14] border border-white/[0.05] rounded-2xl p-5 hover:border-purple-500/30 transition-all group-hover:shadow-xl group-hover:shadow-purple-500/10 group-hover:-translate-y-0.5 overflow-hidden">
        {/* Subtle gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-500/0 to-indigo-500/0 group-hover:from-purple-500/[0.03] group-hover:to-indigo-500/[0.03] transition-all pointer-events-none" />

        <div className="relative flex justify-between items-start gap-3 mb-5">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold group-hover:text-purple-200 transition truncate">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-slate-500 mt-1 line-clamp-1">{project.description}</p>
            )}
          </div>
          {/* Mini score ring with grade letter */}
          <div className={`shrink-0 relative w-12 h-12 rounded-xl border ${scoreBg(score)} flex items-center justify-center`}>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-white/[0.04]" />
              <circle
                cx="24" cy="24" r="20" fill="none"
                stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                className={scoreRing(score)}
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                style={{ transition: 'stroke-dashoffset 0.5s ease-out' }}
              />
            </svg>
            <span className={`relative text-base font-bold ${scoreColor(score)}`}>{grade}</span>
          </div>
        </div>

        <div className="relative flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className={`text-3xl font-bold tabular-nums ${scoreColor(score)}`}>{score}</span>
              <span className="text-xs text-slate-600">/100</span>
            </div>
            <p className="text-[11px] uppercase tracking-wider text-slate-500 mt-1 font-semibold">{gradeLabel(score)}</p>
          </div>
          <div className="text-right shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 justify-end">
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{snapshotCount} {snapshotCount === 1 ? 'snapshot' : 'snapshots'}</span>
            </div>
            <p className="text-[11px] text-slate-600 mt-1">
              {new Date(project.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className="relative mt-4 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-purple-500 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
