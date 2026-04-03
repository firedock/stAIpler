import Link from 'next/link';

function scoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 40) return 'text-orange-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-emerald-500/10';
  if (score >= 60) return 'bg-amber-500/10';
  if (score >= 40) return 'bg-orange-500/10';
  return 'bg-red-500/10';
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

  return (
    <Link href={`/dashboard/${project.id}`} className="block group">
      <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-5 hover:border-purple-500/20 transition-all group-hover:shadow-lg group-hover:shadow-purple-500/5">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="font-semibold group-hover:text-purple-300 transition">{project.name}</h3>
            {project.description && (
              <p className="text-xs text-slate-600 mt-1 line-clamp-1">{project.description}</p>
            )}
          </div>
          <div className={`w-12 h-12 rounded-lg ${scoreBg(score)} flex items-center justify-center`}>
            <span className={`text-lg font-bold ${scoreColor(score)}`}>{grade}</span>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className={`text-2xl font-bold ${scoreColor(score)}`}>{score}</span>
              <span className="text-xs text-slate-600">/100</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{gradeLabel(score)}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600">{snapshotCount} snapshots</p>
            <p className="text-xs text-slate-700 mt-0.5">
              {new Date(project.updated_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Score bar */}
        <div className="mt-4 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-purple-500 transition-all duration-500"
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </Link>
  );
}
