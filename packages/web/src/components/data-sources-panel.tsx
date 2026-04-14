'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface DataSource {
  id: string;
  name: string;
  provider: string;
  status: string;
  last_synced_at: string | null;
}

const PROVIDERS = [
  { id: 'notedrawer', name: 'NoteDrawer', desc: 'Import notes, drawers, and AI context', ready: true },
  { id: 'github', name: 'GitHub', desc: 'Import README, CLAUDE.md, AGENTS.md', ready: true },
  { id: 'file-upload', name: 'File Upload', desc: 'Upload markdown files directly', ready: true },
  { id: 'url', name: 'URL Import', desc: 'Import from any public URL', ready: true },
  { id: 'google-docs', name: 'Google Drive', desc: 'Import docs and files via OAuth', ready: true },
  { id: 'notion', name: 'Notion', desc: 'Import pages and databases', ready: false },
  { id: 'confluence', name: 'Confluence', desc: 'Import wiki pages and spaces', ready: false },
  { id: 'slack', name: 'Slack', desc: 'Import channel context and decisions', ready: false },
  { id: 'linear', name: 'Linear', desc: 'Import project context and priorities', ready: false },
  { id: 'hubspot', name: 'HubSpot', desc: 'Import CRM knowledge and processes', ready: false },
  { id: 'zendesk', name: 'Zendesk', desc: 'Import support knowledge base', ready: false },
];

function ProviderLogo({ id }: { id: string }) {
  const cls = "w-7 h-7";
  switch (id) {
    case 'notedrawer':
      return <svg className={cls} viewBox="0 0 28 28"><rect x="1" y="1" width="11.5" height="11.5" rx="2.5" fill="#1B2D4B"/><rect x="1" y="15.5" width="11.5" height="11.5" rx="2.5" fill="#1B2D4B"/><rect x="15.5" y="15.5" width="11.5" height="11.5" rx="2.5" fill="#1B2D4B"/><path d="M15.5 3.5a2.5 2.5 0 012.5-2.5h6.5A2.5 2.5 0 0127 3.5V10a2.5 2.5 0 01-2.5 2.5H18v3l-2.5-3V3.5z" fill="#34C759"/></svg>;
    case 'google-docs':
      return <svg className={cls} viewBox="0 0 24 24" fill="none"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" fill="#4285F4"/><path d="M14 2v6h6" fill="#A1C2FA"/><path d="M14 2L20 8h-6V2z" fill="#A1C2FA" opacity=".5"/><rect x="8" y="12" width="8" height="1.5" rx=".5" fill="#fff"/><rect x="8" y="15" width="6" height="1.5" rx=".5" fill="#fff"/></svg>;
    case 'notion':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L18.09 2.2c-.466-.373-.98-.746-2.054-.653L3.29 2.8c-.467.047-.56.28-.374.466l1.543 1.142zm.793 2.24v13.882c0 .746.373 1.026 1.213.98l14.523-.84c.84-.046.933-.56.933-1.166V5.654c0-.606-.233-.886-.746-.84l-15.177.84c-.56.046-.746.28-.746.793zm14.336.933c.093.42 0 .84-.42.886l-.7.14v10.264c-.606.327-1.166.514-1.633.514-.746 0-.933-.234-1.493-.933l-4.571-7.178v6.952l1.446.327s0 .84-1.166.84l-3.219.186c-.093-.186 0-.653.327-.746l.84-.233V8.95L7.57 8.81c-.093-.42.14-1.026.793-1.073l3.453-.233 4.757 7.271v-6.44l-1.213-.14c-.093-.513.28-.886.746-.933l3.28-.186z" fill="#fff"/></svg>;
    case 'github':
      return <svg className={cls} viewBox="0 0 24 24" fill="#fff"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>;
    case 'confluence':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M2.047 18.998c-.247.405-.553.891-.801 1.296-.139.227-.074.52.152.66l3.728 2.283a.48.48 0 00.658-.155c.22-.36.533-.876.862-1.427 2.157-3.556 4.316-3.052 8.178-1.2l3.827 1.833a.48.48 0 00.644-.214l1.93-3.958a.479.479 0 00-.214-.644C16.634 15.46 9.844 12.27 2.047 18.998z" fill="#1868DB"/><path d="M21.953 5.002c.247-.405.553-.891.801-1.296a.479.479 0 00-.152-.66L18.874.763a.48.48 0 00-.658.155c-.22.36-.533.876-.862 1.427-2.157 3.556-4.316 3.052-8.178 1.2L5.349 1.712a.48.48 0 00-.644.214L2.775 5.884a.479.479 0 00.214.644C7.366 8.54 14.156 11.73 21.953 5.002z" fill="#1868DB"/></svg>;
    case 'slack':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313z" fill="#E01E5A"/><path d="M8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312z" fill="#36C5F0"/><path d="M18.956 8.834a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 01-2.522 2.521 2.527 2.527 0 01-2.521-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.521 2.522v6.312z" fill="#2EB67D"/><path d="M15.165 18.956a2.528 2.528 0 012.521 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.521-2.522v-2.522h2.521zm0-1.27a2.527 2.527 0 01-2.521-2.522 2.527 2.527 0 012.521-2.521h6.313A2.528 2.528 0 0124 15.165a2.528 2.528 0 01-2.522 2.521h-6.313z" fill="#ECB22E"/></svg>;
    case 'linear':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M2.652 14.13a.555.555 0 01-.152-.534C3.67 8.752 8.071 4.572 13.617 3.618a.556.556 0 01.505.153l6.107 6.107a.555.555 0 01.153.505c-.954 5.546-5.134 9.947-9.978 11.117a.555.555 0 01-.534-.152L2.652 14.13z" fill="#5E6AD2"/><path d="M1.543 12.097a.555.555 0 01-.082-.63A11.93 11.93 0 015.56 7.169a.556.556 0 01.715.053l10.503 10.503a.556.556 0 01.053.715 11.93 11.93 0 01-4.298 4.1.555.555 0 01-.63-.083L1.543 12.097z" fill="#5E6AD2"/><path d="M.477 9.384a.555.555 0 01.029-.712 11.985 11.985 0 013.45-2.764.555.555 0 01.649.075l9.06 9.06c-2.08 1.91-4.853 3.18-7.864 3.56a.555.555 0 01-.527-.168L.477 9.384z" fill="#5E6AD2" opacity=".6"/></svg>;
    case 'hubspot':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M18.164 7.93V5.084a2.198 2.198 0 001.267-1.984v-.066A2.198 2.198 0 0017.232.835h-.065a2.198 2.198 0 00-2.199 2.199v.066c0 .87.51 1.621 1.246 1.976v2.856a5.92 5.92 0 00-2.88 1.465l-7.533-5.87a2.392 2.392 0 00.073-.558v-.066A2.405 2.405 0 003.47.498h-.066A2.405 2.405 0 001 2.903v.066a2.405 2.405 0 002.005 2.37l7.746 6.037a5.965 5.965 0 00-.28 1.8 5.97 5.97 0 001.467 3.924l-2.294 2.294a1.654 1.654 0 00-.487-.082h-.05a1.694 1.694 0 00-1.694 1.694v.05a1.694 1.694 0 001.694 1.694h.05a1.694 1.694 0 001.694-1.694v-.05c0-.18-.03-.353-.083-.515l2.262-2.262a5.97 5.97 0 009.362-4.893v-.066c0-2.85-2.005-5.236-4.678-5.834l-.35-.5z" fill="#FF7A59"/></svg>;
    case 'zendesk':
      return <svg className={cls} viewBox="0 0 24 24"><path d="M11.088 3.2v13.568L0 3.2h11.088zM11.088 20.8a5.544 5.544 0 110-11.088 5.544 5.544 0 010 11.088zM12.912 20.8V7.232L24 20.8H12.912zM12.912 3.2a5.544 5.544 0 110 11.088A5.544 5.544 0 0112.912 3.2z" fill="#03363D"/></svg>;
    case 'file-upload':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>;
    case 'url':
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>;
    default:
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 8v8M8 12h8"/></svg>;
  }
}

function statusBadge(status: string) {
  switch (status) {
    case 'connected': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Connected</span>;
    case 'syncing': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium animate-pulse">Syncing...</span>;
    case 'error': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Error</span>;
    default: return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-medium">Pending</span>;
  }
}

export function DataSourcesPanel({ projectId, dataSources, forceOpen }: { projectId: string; dataSources: DataSource[]; forceOpen?: boolean }) {
  const [showPicker, setShowPicker] = useState(forceOpen ?? false);
  const [activeFlow, setActiveFlow] = useState<string | null>(null);
  const [repoUrl, setRepoUrl] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ filesFound: number; readinessScore: number; grade: string } | null>(null);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Google Drive state
  const [driveFiles, setDriveFiles] = useState<{ id: string; name: string; mimeType: string; modifiedTime: string }[]>([]);
  const [selectedDriveFiles, setSelectedDriveFiles] = useState<Set<string>>(new Set());
  const [driveSourceId, setDriveSourceId] = useState<string | null>(null);
  const [drivePhase, setDrivePhase] = useState<'connect' | 'pick' | 'syncing'>('connect');

  async function handleGitHubImport() {
    if (!repoUrl) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/sources/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, repoUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('projectId', projectId);
      Array.from(files).forEach(f => formData.append('files', f));

      const res = await fetch('/api/sources/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setActiveFlow(null);
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleUrlImport() {
    if (!importUrl) return;
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch(importUrl);
      if (!res.ok) throw new Error('Failed to fetch URL');
      const content = await res.text();
      const filename = importUrl.split('/').pop() ?? 'imported.md';

      const formData = new FormData();
      formData.append('projectId', projectId);
      formData.append('files', new Blob([content], { type: 'text/markdown' }), filename);

      const uploadRes = await fetch('/api/sources/upload', { method: 'POST', body: formData });
      const data = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(data.error);
      setResult(data);
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleDriveConnect() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/sources/google-drive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Redirect to Google OAuth
      window.location.href = data.authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect Google Drive');
      setLoading(false);
    }
  }

  async function handleDriveListFiles(sourceId: string) {
    setLoading(true);
    setError('');
    setDriveSourceId(sourceId);
    try {
      const res = await fetch('/api/sources/google-drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.phase === 'pick') {
        setDriveFiles(data.files);
        setDrivePhase('pick');
        // Select all by default
        setSelectedDriveFiles(new Set(data.files.map((f: any) => f.id)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
    } finally {
      setLoading(false);
    }
  }

  async function handleDriveSync() {
    if (!driveSourceId || selectedDriveFiles.size === 0) return;
    setLoading(true);
    setError('');
    setDrivePhase('syncing');
    try {
      const res = await fetch('/api/sources/google-drive/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, sourceId: driveSourceId, fileIds: Array.from(selectedDriveFiles) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setActiveFlow(null);
      setDrivePhase('connect');
      setTimeout(() => router.refresh(), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
      setDrivePhase('pick');
    } finally {
      setLoading(false);
    }
  }

  // Check for Google Drive OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('source') === 'google-drive' && params.get('status') === 'connected') {
      const sourceId = params.get('sourceId');
      if (sourceId) {
        setActiveFlow('google-docs');
        setShowPicker(false);
        handleDriveListFiles(sourceId);
        // Clean up URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  function handleProviderClick(providerId: string) {
    const provider = PROVIDERS.find(p => p.id === providerId);
    if (!provider?.ready) {
      setActiveFlow(null);
      alert(`${provider?.name} integration coming soon!`);
      return;
    }

    if (providerId === 'file-upload') {
      fileInputRef.current?.click();
      return;
    }

    setActiveFlow(providerId);
    setResult(null);
    setError('');
  }

  return (
    <div>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.mdc,.txt"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      {/* Connected sources */}
      {dataSources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {dataSources.map(ds => (
            <div key={ds.id} className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4 flex items-center gap-3">
              <ProviderLogo id={ds.provider} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{ds.name}</div>
                <div className="text-xs text-slate-600">
                  {ds.last_synced_at ? `Synced ${new Date(ds.last_synced_at).toLocaleDateString()}` : 'Not synced yet'}
                </div>
              </div>
              {statusBadge(ds.status)}
            </div>
          ))}
        </div>
      )}

      {/* Success result */}
      {result && (
        <div className="mb-4 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-3">
            <div className="text-emerald-400 font-bold text-lg">{result.readinessScore}/100</div>
            <div className="text-sm text-emerald-300">
              {result.filesFound} files imported — Grade {result.grade}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Active flow: GitHub */}
      {activeFlow === 'github' && (
        <div className="mb-4 p-5 rounded-xl bg-[#0d0d1a] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <ProviderLogo id="github" />
            <div>
              <div className="font-semibold text-sm">Connect GitHub Repository</div>
              <div className="text-xs text-slate-500">Paste a repo URL to scan for instruction files</div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm"
            />
            <button
              onClick={handleGitHubImport}
              disabled={loading || !repoUrl}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Scanning...' : 'Import'}
            </button>
          </div>
          <button onClick={() => setActiveFlow(null)} className="text-xs text-slate-600 mt-3 hover:text-slate-400 transition">Cancel</button>
        </div>
      )}

      {/* Active flow: URL */}
      {activeFlow === 'url' && (
        <div className="mb-4 p-5 rounded-xl bg-[#0d0d1a] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <ProviderLogo id="url" />
            <div>
              <div className="font-semibold text-sm">Import from URL</div>
              <div className="text-xs text-slate-500">Paste a public URL to a markdown file</div>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              placeholder="https://example.com/CLAUDE.md"
              className="flex-1 px-3 py-2.5 rounded-lg bg-white/5 border border-white/10 focus:border-purple-500 focus:outline-none text-sm"
            />
            <button
              onClick={handleUrlImport}
              disabled={loading || !importUrl}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? 'Importing...' : 'Import'}
            </button>
          </div>
          <button onClick={() => setActiveFlow(null)} className="text-xs text-slate-600 mt-3 hover:text-slate-400 transition">Cancel</button>
        </div>
      )}

      {/* Active flow: NoteDrawer */}
      {activeFlow === 'notedrawer' && (
        <div className="mb-4 p-5 rounded-xl bg-[#0d0d1a] border border-[#34C759]/20">
          <div className="flex items-center gap-3 mb-3">
            <ProviderLogo id="notedrawer" />
            <div className="flex-1">
              <div className="font-semibold text-sm">Connect NoteDrawer</div>
              <div className="text-xs text-slate-500">Import notes, drawers, and knowledge from your workspace</div>
            </div>
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#34C759]/15 text-[#34C759] font-semibold uppercase tracking-wide">Featured</span>
          </div>
          <p className="text-sm text-slate-400 mb-4 leading-relaxed">
            NoteDrawer organizes your knowledge into drawers and notes — the perfect structure for building AI context.
            Connect your workspace to automatically import notes as instruction layers.
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="bg-white/[0.02] rounded-lg p-3 text-center">
              <div className="text-sm font-semibold text-[#34C759]">Notes</div>
              <div className="text-[10px] text-slate-600">Import as context, skills, or policies</div>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3 text-center">
              <div className="text-sm font-semibold text-[#34C759]">Drawers</div>
              <div className="text-[10px] text-slate-600">Map folders to instruction layers</div>
            </div>
            <div className="bg-white/[0.02] rounded-lg p-3 text-center">
              <div className="text-sm font-semibold text-[#34C759]">AI Context</div>
              <div className="text-[10px] text-slate-600">Pull existing AI prompts and rules</div>
            </div>
          </div>
          <button
            onClick={() => {
              window.open('https://notedrawer.com/connect/staipler', '_blank');
            }}
            className="w-full py-3 rounded-lg bg-gradient-to-r from-[#1B2D4B] to-[#34C759] text-sm font-semibold hover:opacity-90 transition"
          >
            Connect NoteDrawer Workspace
          </button>
          <div className="flex justify-between mt-3">
            <a href="https://notedrawer.com" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[#34C759]/60 hover:text-[#34C759] transition">
              Don&apos;t have NoteDrawer? Get started free &rarr;
            </a>
            <button onClick={() => setActiveFlow(null)} className="text-xs text-slate-600 hover:text-slate-400 transition">Cancel</button>
          </div>
        </div>
      )}

      {/* Active flow: Google Drive */}
      {activeFlow === 'google-docs' && (
        <div className="mb-4 p-5 rounded-xl bg-[#0d0d1a] border border-blue-500/20">
          <div className="flex items-center gap-3 mb-4">
            <ProviderLogo id="google-docs" />
            <div>
              <div className="font-semibold text-sm">Connect Google Drive</div>
              <div className="text-xs text-slate-500">
                {drivePhase === 'connect' && 'Sign in with Google to import your documents'}
                {drivePhase === 'pick' && `Found ${driveFiles.length} documents — select which to import`}
                {drivePhase === 'syncing' && 'Importing selected documents...'}
              </div>
            </div>
          </div>

          {drivePhase === 'connect' && (
            <button
              onClick={handleGoogleDriveConnect}
              disabled={loading}
              className="w-full py-3 rounded-lg bg-[#4285F4] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#fff"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              {loading ? 'Connecting...' : 'Sign in with Google'}
            </button>
          )}

          {drivePhase === 'pick' && (
            <>
              <div className="max-h-60 overflow-y-auto space-y-1 mb-4">
                {driveFiles.map(f => (
                  <label key={f.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.02] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDriveFiles.has(f.id)}
                      onChange={() => {
                        const next = new Set(selectedDriveFiles);
                        if (next.has(f.id)) next.delete(f.id);
                        else next.add(f.id);
                        setSelectedDriveFiles(next);
                      }}
                      className="rounded border-white/20 bg-white/5 text-purple-500 focus:ring-purple-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm truncate">{f.name}</div>
                      <div className="text-[10px] text-slate-600">{new Date(f.modifiedTime).toLocaleDateString()}</div>
                    </div>
                  </label>
                ))}
                {driveFiles.length === 0 && (
                  <div className="text-center text-sm text-slate-600 py-8">No documents found in your Google Drive.</div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    if (selectedDriveFiles.size === driveFiles.length) setSelectedDriveFiles(new Set());
                    else setSelectedDriveFiles(new Set(driveFiles.map(f => f.id)));
                  }}
                  className="px-3 py-2 rounded-lg bg-white/5 text-xs text-slate-400 hover:text-slate-300 transition"
                >
                  {selectedDriveFiles.size === driveFiles.length ? 'Deselect all' : 'Select all'}
                </button>
                <button
                  onClick={handleDriveSync}
                  disabled={selectedDriveFiles.size === 0}
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  Import {selectedDriveFiles.size} document{selectedDriveFiles.size !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {drivePhase === 'syncing' && (
            <div className="text-center py-6">
              <div className="animate-spin w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-3" />
              <div className="text-sm text-slate-400">Importing and classifying documents...</div>
            </div>
          )}

          <button onClick={() => { setActiveFlow(null); setDrivePhase('connect'); }} className="text-xs text-slate-600 mt-3 hover:text-slate-400 transition">Cancel</button>
        </div>
      )}

      {/* Add source button */}
      <button
        onClick={() => { setShowPicker(!showPicker); setActiveFlow(null); }}
        className="w-full py-3 rounded-xl border border-dashed border-white/10 text-sm text-slate-500 hover:text-slate-300 hover:border-purple-500/30 transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
        Connect a Data Source
      </button>

      {/* Provider picker */}
      {showPicker && !activeFlow && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {PROVIDERS.map((provider, i) => (
            <button
              key={provider.id}
              className={`bg-[#0d0d1a] border rounded-xl p-4 text-center transition group relative ${provider.id === 'notedrawer' ? 'border-[#34C759]/20 hover:border-[#34C759]/40' : 'border-white/[0.04] hover:border-purple-500/20'} ${!provider.ready ? 'opacity-60' : ''}`}
              onClick={() => handleProviderClick(provider.id)}
            >
              {provider.id === 'notedrawer' && <span className="absolute top-2 right-2 text-[8px] text-[#34C759] uppercase tracking-wide font-semibold">Featured</span>}
              {!provider.ready && <span className="absolute top-2 right-2 text-[8px] text-slate-600 uppercase tracking-wide">Soon</span>}
              <div className="mb-2 flex justify-center"><ProviderLogo id={provider.id} /></div>
              <div className="text-xs font-medium group-hover:text-purple-300 transition">{provider.name}</div>
              <div className="text-[10px] text-slate-600 mt-1">{provider.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
