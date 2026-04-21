import Link from 'next/link';
import { listReleases, listRunsForRelease } from '@/lib/benchmark/repo';

export const dynamic = 'force-dynamic';

export default async function BenchmarkHomePage() {
  const releases = listReleases();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8 pb-8 border-b border-white/[0.05]">
        <h1 className="text-3xl font-bold tracking-tight">Benchmark releases</h1>
        <p className="text-sm text-slate-500 mt-2">
          Every compiled release is visible here. The #1 rule of this codebase is total visibility —
          coverage, provenance, conflicts, and run results must be inspectable at a glance.
        </p>
      </div>

      {releases.length === 0 ? (
        <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-8 text-center">
          <p className="text-slate-400">
            No releases yet. Run{' '}
            <code className="px-1.5 py-0.5 rounded bg-white/[0.05] text-purple-300">staipler compile --target=claude-code</code>{' '}
            or{' '}
            <code className="px-1.5 py-0.5 rounded bg-white/[0.05] text-purple-300">staipler benchmark run</code>{' '}
            from the repo root.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {releases.map(release => {
            const runs = listRunsForRelease(release.release_id);
            return (
              <Link
                key={release.release_id}
                href={`/dashboard/benchmark/${release.release_id}`}
                className="block rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] transition-colors p-5"
              >
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <code className="text-sm font-bold text-purple-300">{release.release_id}</code>
                      <span className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
                        {release.coverage.grade} · {release.coverage.readinessScore}/100
                      </span>
                      {release.conflicts.filter(c => c.resolution === 'unresolved').length > 0 && (
                        <span className="text-[10px] uppercase tracking-widest font-bold text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1">
                          {release.conflicts.filter(c => c.resolution === 'unresolved').length} unresolved conflict
                        </span>
                      )}
                      {release.gaps.length > 0 && (
                        <span className="text-[10px] uppercase tracking-widest font-bold text-slate-400 bg-white/[0.03] border border-white/[0.05] rounded-md px-2 py-1">
                          {release.gaps.length} gap
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 mt-1.5 font-mono">
                      git {release.git_commit.slice(0, 10)} · adapter {release.adapter_version} · contract v{release.core_contract_version}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {runs.map(r => (
                      <span
                        key={r.mode}
                        className="text-[11px] uppercase tracking-widest font-bold rounded-md px-2 py-1 border border-white/[0.06] bg-white/[0.02] text-slate-300"
                      >
                        {r.mode} · {r.pass_rates.overall.rate}%
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
