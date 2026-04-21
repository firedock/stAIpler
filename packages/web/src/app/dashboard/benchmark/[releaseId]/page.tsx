import Link from 'next/link';
import { notFound } from 'next/navigation';
import { listRunsForRelease, readRelease } from '@/lib/benchmark/repo';
import { BenchmarkLiveEvents } from '@/components/benchmark-live-events';

export const dynamic = 'force-dynamic';

export default async function ReleasePage({
  params,
}: {
  params: Promise<{ releaseId: string }>;
}) {
  const { releaseId } = await params;
  const release = readRelease(releaseId);
  if (!release) notFound();

  const runs = listRunsForRelease(releaseId);
  const unresolvedConflicts = release.conflicts.filter(c => c.resolution === 'unresolved').length;

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-6">
        <Link href="/dashboard/benchmark" className="text-xs text-purple-300 hover:text-purple-200">
          ← All releases
        </Link>
      </div>

      <div className="mb-8 pb-8 border-b border-white/[0.05]">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-3xl font-bold tracking-tight font-mono">{release.release_id}</h1>
          <span className="text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md border border-purple-500/20 bg-purple-500/10 text-purple-300">
            {release.coverage.grade} · {release.coverage.readinessScore}/100
          </span>
        </div>
        <dl className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          <InfoCell label="Bundle hash" value={`${release.bundle_hash.slice(0, 12)}…`} mono />
          <InfoCell label="Adapter" value={release.adapter_version} />
          <InfoCell label="Core contract" value={`v${release.core_contract_version}`} />
          <InfoCell label="Git commit" value={release.git_commit.slice(0, 10)} mono />
          <InfoCell label="Built at" value={release.built_at} />
          <InfoCell label="Determinism hash" value={`${release.determinism_hash.slice(0, 12)}…`} mono />
        </dl>
      </div>

      {unresolvedConflicts > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/[0.05] p-4">
          <div className="text-amber-200 font-semibold text-sm">
            ⚠ {unresolvedConflicts} unresolved conflict{unresolvedConflicts > 1 ? 's' : ''} in this release
          </div>
          <div className="text-xs text-amber-200/70 mt-1">
            Runs against this release may reflect contradictory guidance. Resolve before shipping.
          </div>
        </div>
      )}

      <Section title="Coverage">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <CoverageList label="Present" layers={release.coverage.present} tone="good" />
          <CoverageList label="Weak" layers={release.coverage.weak} tone="warn" />
          <CoverageList label="Missing (gaps)" layers={release.coverage.missing} tone="miss" />
        </div>
      </Section>

      <Section title="Provenance">
        {release.provenance.length === 0 ? (
          <EmptyNote>No layers in bundle.</EmptyNote>
        ) : (
          <div className="rounded-xl border border-white/[0.05] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Layer</th>
                  <th className="text-left px-4 py-2 font-semibold">Status</th>
                  <th className="text-left px-4 py-2 font-semibold">Sources</th>
                </tr>
              </thead>
              <tbody>
                {release.provenance.map(p => (
                  <tr key={p.layer} className="border-t border-white/[0.05]">
                    <td className="px-4 py-2 font-mono text-purple-300">{p.layer}</td>
                    <td className="px-4 py-2 text-slate-400">{p.status}</td>
                    <td className="px-4 py-2">
                      <ul className="space-y-0.5">
                        {p.sources.length === 0 ? (
                          <li className="text-slate-500">—</li>
                        ) : (
                          p.sources.map((s, i) => (
                            <li key={i} className="font-mono text-xs text-slate-300">
                              {s.sourceTitle} <span className="text-slate-500">({s.provider})</span>
                            </li>
                          ))
                        )}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Skills">
        {release.skill_sources.length === 0 ? (
          <EmptyNote>No skills extracted from this release.</EmptyNote>
        ) : (
          <div className="rounded-xl border border-white/[0.05] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Slug</th>
                  <th className="text-left px-4 py-2 font-semibold">Path</th>
                  <th className="text-left px-4 py-2 font-semibold">Sources</th>
                </tr>
              </thead>
              <tbody>
                {release.skill_sources.map(s => (
                  <tr key={s.slug} className="border-t border-white/[0.05]">
                    <td className="px-4 py-2 font-mono text-purple-300">{s.slug}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-300">{s.path}</td>
                    <td className="px-4 py-2 text-xs text-slate-400">
                      {s.sources.length === 0 ? '—' : s.sources.map(ss => ss.sourceTitle).join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Conflicts">
        {release.conflicts.length === 0 ? (
          <EmptyNote>No bundle conflicts recorded.</EmptyNote>
        ) : (
          <div className="rounded-xl border border-white/[0.05] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-400">
                <tr>
                  <th className="text-left px-4 py-2 font-semibold">Description</th>
                  <th className="text-left px-4 py-2 font-semibold">Resolution</th>
                  <th className="text-left px-4 py-2 font-semibold">Resolved by</th>
                </tr>
              </thead>
              <tbody>
                {release.conflicts.map((c, i) => (
                  <tr key={i} className="border-t border-white/[0.05]">
                    <td className="px-4 py-2 text-slate-200">{c.description}</td>
                    <td className={`px-4 py-2 ${c.resolution === 'unresolved' ? 'text-amber-300' : 'text-slate-400'}`}>
                      {c.resolution}
                    </td>
                    <td className="px-4 py-2 text-slate-400">{c.resolvedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <BenchmarkLiveEvents releaseId={releaseId} />

      <Section title="Benchmark runs">
        {runs.length === 0 ? (
          <EmptyNote>
            No benchmark runs for this release. Run{' '}
            <code className="px-1 py-0.5 rounded bg-white/[0.05] text-purple-300">staipler benchmark run</code>.
          </EmptyNote>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {runs.map(run => (
              <Link
                key={run.mode}
                href={`/dashboard/benchmark/${releaseId}/${run.mode}`}
                className="rounded-xl border border-white/[0.05] bg-white/[0.02] hover:bg-white/[0.04] transition-colors p-5 block"
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs uppercase tracking-widest font-bold text-purple-300">{run.mode}</div>
                  <div className="text-xs text-slate-500 font-mono">{run.model}</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <RateBadge label="Deterministic" rate={run.pass_rates.deterministic} />
                  <RateBadge label="Judge" rate={run.pass_rates.judge_assisted} />
                  <RateBadge label="Overall" rate={run.pass_rates.overall} />
                </div>
                <div className="mt-3 text-[11px] text-slate-500">
                  {run.results.length} task(s) · task-set hash {run.task_set_hash.slice(0, 10)}…
                </div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function InfoCell({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-lg border border-white/[0.05] bg-white/[0.02] px-3 py-2">
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className={`text-sm ${mono ? 'font-mono' : ''} text-slate-200 mt-0.5 truncate`}>{value}</div>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.02] p-4 text-sm text-slate-400">
      {children}
    </div>
  );
}

function CoverageList({ label, layers, tone }: { label: string; layers: string[]; tone: 'good' | 'warn' | 'miss' }) {
  const toneClasses =
    tone === 'good' ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
    : tone === 'warn' ? 'border-amber-500/20 bg-amber-500/[0.05]'
    : 'border-red-500/20 bg-red-500/[0.05]';
  return (
    <div className={`rounded-xl border ${toneClasses} p-4`}>
      <div className="text-[10px] uppercase tracking-widest font-semibold text-slate-400">{label}</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {layers.length === 0 ? (
          <span className="text-xs text-slate-500">—</span>
        ) : (
          layers.map(l => (
            <span key={l} className="font-mono text-xs px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.05]">
              {l}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function RateBadge({ label, rate }: { label: string; rate: { passed: number; total: number; rate: number } }) {
  const empty = rate.total === 0;
  return (
    <div className="rounded-md border border-white/[0.05] bg-white/[0.02] px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-slate-500 font-semibold">{label}</div>
      <div className="text-sm font-bold tabular-nums mt-0.5">
        {empty ? 'n/a' : `${rate.rate}%`}
      </div>
      <div className="text-[10px] text-slate-500">{empty ? 'no reqs' : `${rate.passed}/${rate.total}`}</div>
    </div>
  );
}
