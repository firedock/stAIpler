import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

type DataSourceRow = {
  id: string;
  project_id: string;
  name: string;
  provider: string;
  status: 'pending' | 'connected' | 'syncing' | 'error' | 'disconnected';
  last_synced_at: string | null;
  sync_error: string | null;
  created_at: string;
  projects: { id: string; name: string } | null;
};

type SourceDocRow = {
  id: string;
  project_id: string;
  data_source_id: string | null;
  title: string;
  source_url: string | null;
  mime_type: string | null;
  created_at: string;
  projects: { id: string; name: string } | null;
};

const statusStyles: Record<DataSourceRow['status'], string> = {
  connected: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  syncing: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  pending: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
  error: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
  disconnected: 'bg-slate-700/30 text-slate-400 border-slate-700/40',
};

function formatDate(value: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default async function SourcesPage() {
  const supabase = await createClient();

  const [{ data: sources }, { data: documents }] = await Promise.all([
    supabase
      .from('data_sources')
      .select('id, project_id, name, provider, status, last_synced_at, sync_error, created_at, projects(id, name)')
      .order('updated_at', { ascending: false }),
    supabase
      .from('source_documents')
      .select('id, project_id, data_source_id, title, source_url, mime_type, created_at, projects(id, name)')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const rows = (sources ?? []) as unknown as DataSourceRow[];
  const docs = (documents ?? []) as unknown as SourceDocRow[];

  const docsBySource = new Map<string, SourceDocRow[]>();
  const orphanDocs: SourceDocRow[] = [];
  for (const doc of docs) {
    if (doc.data_source_id) {
      const list = docsBySource.get(doc.data_source_id) ?? [];
      list.push(doc);
      docsBySource.set(doc.data_source_id, list);
    } else {
      orphanDocs.push(doc);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">Data Sources</h1>
        <p className="text-sm text-slate-500 mt-1">
          Evidence pipelines feeding your agents. Ingestion, provenance, and sync status across every project.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="border border-white/[0.06] rounded-xl p-10 text-center bg-white/[0.02]">
          <p className="text-slate-300 font-medium">No data sources connected yet</p>
          <p className="text-sm text-slate-500 mt-2">
            Connect a source from inside a project to start building evidence-backed context.
          </p>
          <Link
            href="/dashboard"
            className="inline-block mt-5 px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition"
          >
            Go to Projects
          </Link>
        </div>
      ) : (
        <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.02]">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.03] text-slate-400 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Source</th>
                <th className="text-left px-4 py-3 font-medium">Project</th>
                <th className="text-left px-4 py-3 font-medium">Provider</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Documents</th>
                <th className="text-left px-4 py-3 font-medium">Last Synced</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {rows.map((row) => {
                const count = docsBySource.get(row.id)?.length ?? 0;
                return (
                  <tr key={row.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-200">{row.name}</div>
                      {row.sync_error && (
                        <div className="text-xs text-rose-400 mt-1 truncate max-w-xs" title={row.sync_error}>
                          {row.sync_error}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {row.projects ? (
                        <Link href={`/dashboard/${row.projects.id}`} className="text-indigo-300 hover:text-indigo-200">
                          {row.projects.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{row.provider}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-md border text-xs ${statusStyles[row.status]}`}>
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{count}</td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(row.last_synced_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {docs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Recent Ingested Documents</h2>
          <p className="text-xs text-slate-500 mb-4">
            Latest {docs.length} SourceDocument rows across the ingestion stage of the evidence pipeline.
          </p>
          <div className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.02]">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] text-slate-400 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Title</th>
                  <th className="text-left px-4 py-3 font-medium">Project</th>
                  <th className="text-left px-4 py-3 font-medium">Type</th>
                  <th className="text-left px-4 py-3 font-medium">Source URL</th>
                  <th className="text-left px-4 py-3 font-medium">Ingested</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.04]">
                {docs.map((doc) => (
                  <tr key={doc.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 text-slate-200">{doc.title}</td>
                    <td className="px-4 py-3">
                      {doc.projects ? (
                        <Link
                          href={`/dashboard/${doc.projects.id}`}
                          className="inline-flex items-center gap-1.5 text-indigo-300 hover:text-indigo-200"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-400/60" />
                          {doc.projects.name}
                        </Link>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{doc.mime_type ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                      {doc.source_url ? (
                        <a href={doc.source_url} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">
                          {doc.source_url}
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-400">{formatDate(doc.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {orphanDocs.length > 0 && (
            <p className="text-xs text-slate-500 mt-3">
              {orphanDocs.length} document{orphanDocs.length === 1 ? '' : 's'} not linked to a data source (direct upload or URL ingestion).
            </p>
          )}
        </div>
      )}
    </div>
  );
}
