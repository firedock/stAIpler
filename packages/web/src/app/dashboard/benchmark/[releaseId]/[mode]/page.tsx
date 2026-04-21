import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRunsForRelease, readRelease, readRunEvents } from '@/lib/benchmark/repo';

export const dynamic = 'force-dynamic';

export default async function RunPage({
  params,
}: {
  params: Promise<{ releaseId: string; mode: string }>;
}) {
  const { releaseId, mode } = await params;
  if (mode !== 'baseline' && mode !== 'staipler') notFound();

  const release = readRelease(releaseId);
  if (!release) notFound();

  const runs = listRunsForRelease(releaseId);
  const run = runs.find(r => r.mode === mode);
  if (!run) notFound();

  const events = readRunEvents(releaseId)
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l) as {
      t: number;
      elapsed_ms: number;
      stage: string;
      kind?: string;
      task_id?: string;
      mode?: string;
    })
    .filter(ev => !ev.mode || ev.mode === mode || ev.stage === 'scan' || ev.stage === 'analyze' || ev.stage === 'bundle' || ev.stage === 'render' || ev.stage === 'release');

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-6">
        <Link href={`/dashboard/benchmark/${releaseId}`} className="text-xs text-purple-300 hover:text-purple-200">
          ← Back to release
        </Link>
      </div>

      <div className="mb-8 pb-8 border-b border-white/[0.05]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md border border-purple-500/20 bg-purple-500/10 text-purple-300">
            {mode}
          </span>
          <h1 className="text-2xl font-bold tracking-tight font-mono">{releaseId}</h1>
          <span className="text-xs text-slate-500 font-mono">{run.model}</span>
        </div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Deterministic</div>
            <div className="text-lg font-bold tabular-nums">
              {run.pass_rates.deterministic.total === 0 ? 'n/a' : `${run.pass_rates.deterministic.rate}%`}
            </div>
            <div className="text-[10px] text-slate-500">
              {run.pass_rates.deterministic.passed}/{run.pass_rates.deterministic.total}
            </div>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Judge-assisted</div>
            <div className="text-lg font-bold tabular-nums">
              {run.pass_rates.judge_assisted.total === 0 ? 'n/a' : `${run.pass_rates.judge_assisted.rate}%`}
            </div>
            <div className="text-[10px] text-slate-500">
              {run.pass_rates.judge_assisted.passed}/{run.pass_rates.judge_assisted.total}
            </div>
          </div>
          <div className="rounded-md border border-white/[0.05] bg-white/[0.02] p-2.5">
            <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">Overall</div>
            <div className="text-lg font-bold tabular-nums">{run.pass_rates.overall.rate}%</div>
            <div className="text-[10px] text-slate-500">
              {run.pass_rates.overall.passed}/{run.pass_rates.overall.total}
            </div>
          </div>
        </div>
        <div className="mt-2 text-[11px] text-slate-500">
          Started {run.started_at} · Finished {run.finished_at} · task-set hash {run.task_set_hash.slice(0, 12)}…
        </div>
      </div>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">Tasks</h2>
        <div className="rounded-xl border border-white/[0.05] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">Task</th>
                <th className="text-left px-4 py-2 font-semibold">Category</th>
                <th className="text-left px-4 py-2 font-semibold">Pass</th>
                <th className="text-left px-4 py-2 font-semibold">Det</th>
                <th className="text-left px-4 py-2 font-semibold">Judge</th>
                <th className="text-left px-4 py-2 font-semibold">Elapsed</th>
                <th className="text-left px-4 py-2 font-semibold">Failure</th>
              </tr>
            </thead>
            <tbody>
              {run.results.map(r => (
                <tr key={r.task_id} className="border-t border-white/[0.05] hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <Link
                      href={`/dashboard/benchmark/${releaseId}/${mode}/${r.task_id}`}
                      className="font-mono text-purple-300 hover:text-purple-200"
                    >
                      {r.task_id}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.category}</td>
                  <td className={`px-4 py-2 ${r.pass ? 'text-emerald-300' : 'text-red-300'}`}>{r.pass ? 'pass' : 'fail'}</td>
                  <td className={`px-4 py-2 ${r.deterministic_pass ? 'text-emerald-300' : 'text-red-300'}`}>
                    {r.deterministic_pass ? 'pass' : 'fail'}
                  </td>
                  <td className="px-4 py-2">
                    {r.judge_assisted_pass === null ? '—' : r.judge_assisted_pass ? (
                      <span className="text-emerald-300">pass</span>
                    ) : (
                      <span className="text-red-300">fail</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.elapsed_ms}ms</td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.failure_category ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">
          Event stream ({events.length})
        </h2>
        <div className="rounded-xl border border-white/[0.05] bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-x-auto max-h-[480px] overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-slate-500">No events recorded for this run.</div>
          ) : (
            events.map((ev, i) => (
              <div key={i} className="whitespace-pre">
                <span className="text-slate-500">+{String(ev.elapsed_ms).padStart(6, ' ')}ms</span>{' '}
                <span className="text-purple-300">{ev.stage}/{ev.kind ?? ''}</span>
                {ev.task_id ? <> <span className="text-slate-400">{ev.task_id}</span></> : null}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
