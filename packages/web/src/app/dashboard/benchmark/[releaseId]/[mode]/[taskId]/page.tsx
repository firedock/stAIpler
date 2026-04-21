import Link from 'next/link';
import { notFound } from 'next/navigation';
import { readTaskArtifacts } from '@/lib/benchmark/repo';

export const dynamic = 'force-dynamic';

export default async function TaskDrilldownPage({
  params,
}: {
  params: Promise<{ releaseId: string; mode: string; taskId: string }>;
}) {
  const { releaseId, mode, taskId } = await params;
  if (mode !== 'baseline' && mode !== 'staipler') notFound();

  const artifacts = readTaskArtifacts(releaseId, mode, taskId);
  if (!artifacts) notFound();

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-6">
        <Link href={`/dashboard/benchmark/${releaseId}/${mode}`} className="text-xs text-purple-300 hover:text-purple-200">
          ← Back to run
        </Link>
      </div>

      <div className="mb-8 pb-8 border-b border-white/[0.05]">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md border border-purple-500/20 bg-purple-500/10 text-purple-300">
            {mode}
          </span>
          <h1 className="text-2xl font-bold tracking-tight font-mono">{taskId}</h1>
        </div>
        <div className="text-xs text-slate-500 mt-2 font-mono">release {releaseId}</div>
      </div>

      <section className="mb-8">
        <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">Requirements</h2>
        <div className="rounded-xl border border-white/[0.05] overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.02] text-[11px] uppercase tracking-widest text-slate-400">
              <tr>
                <th className="text-left px-4 py-2 font-semibold">ID</th>
                <th className="text-left px-4 py-2 font-semibold">Type</th>
                <th className="text-left px-4 py-2 font-semibold">Scoring</th>
                <th className="text-left px-4 py-2 font-semibold">Result</th>
                <th className="text-left px-4 py-2 font-semibold">Detail</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.requirements.map(r => (
                <tr key={r.requirement_id} className="border-t border-white/[0.05]">
                  <td className="px-4 py-2 font-mono text-purple-300">{r.requirement_id}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-400">{r.requirement_type}</td>
                  <td className="px-4 py-2 text-xs">
                    <span className={`px-2 py-0.5 rounded border text-[10px] uppercase tracking-widest font-bold ${
                      r.scoring === 'deterministic'
                        ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                        : 'border-amber-500/20 bg-amber-500/10 text-amber-300'
                    }`}>
                      {r.scoring}
                    </span>
                  </td>
                  <td className={`px-4 py-2 ${r.passed ? 'text-emerald-300' : 'text-red-300'}`}>
                    {r.passed ? 'pass' : 'fail'}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">{r.detail ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Artifact title="Workspace diff" body={artifacts.workspace_diff || '(no changes)'} language="diff" />
      <Artifact title="stdout" body={artifacts.stdout || '(empty)'} />
      <Artifact title="stderr" body={artifacts.stderr || '(empty)'} />
    </div>
  );
}

function Artifact({ title, body, language }: { title: string; body: string; language?: string }) {
  return (
    <section className="mb-8">
      <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold mb-3">{title}</h2>
      <pre
        className={`rounded-xl border border-white/[0.05] bg-black/30 p-4 text-[11px] leading-relaxed text-slate-300 overflow-auto max-h-[480px]${language === 'diff' ? '' : ''}`}
      >
        <code>{body}</code>
      </pre>
    </section>
  );
}
