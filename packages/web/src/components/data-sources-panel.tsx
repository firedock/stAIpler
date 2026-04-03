'use client';

import { useState } from 'react';

interface DataSource {
  id: string;
  name: string;
  provider: string;
  status: string;
  last_synced_at: string | null;
}

const PROVIDERS = [
  { id: 'google-docs', name: 'Google Docs', icon: '📄', desc: 'Import docs, sheets, and slides' },
  { id: 'notion', name: 'Notion', icon: '📓', desc: 'Import pages and databases' },
  { id: 'github', name: 'GitHub', icon: '🐙', desc: 'Import README, CLAUDE.md, AGENTS.md' },
  { id: 'confluence', name: 'Confluence', icon: '📘', desc: 'Import wiki pages and spaces' },
  { id: 'slack', name: 'Slack', icon: '💬', desc: 'Import channel context and decisions' },
  { id: 'linear', name: 'Linear', icon: '📐', desc: 'Import project context and priorities' },
  { id: 'hubspot', name: 'HubSpot', icon: '🟠', desc: 'Import CRM knowledge and processes' },
  { id: 'zendesk', name: 'Zendesk', icon: '🎧', desc: 'Import support knowledge base' },
  { id: 'file-upload', name: 'File Upload', icon: '📁', desc: 'Upload markdown files directly' },
  { id: 'url', name: 'URL Import', icon: '🔗', desc: 'Import from any public URL' },
];

function statusBadge(status: string) {
  switch (status) {
    case 'connected': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">Connected</span>;
    case 'syncing': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">Syncing</span>;
    case 'error': return <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-medium">Error</span>;
    default: return <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 font-medium">Pending</span>;
  }
}

export function DataSourcesPanel({ projectId, dataSources }: { projectId: string; dataSources: DataSource[] }) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div>
      {/* Connected sources */}
      {dataSources.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {dataSources.map(ds => (
            <div key={ds.id} className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4 flex items-center gap-3">
              <span className="text-xl">{PROVIDERS.find(p => p.id === ds.provider)?.icon ?? '📦'}</span>
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

      {/* Add source button */}
      <button
        onClick={() => setShowPicker(!showPicker)}
        className="w-full py-3 rounded-xl border border-dashed border-white/10 text-sm text-slate-500 hover:text-slate-300 hover:border-purple-500/30 transition flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
        Connect a Data Source
      </button>

      {/* Provider picker */}
      {showPicker && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {PROVIDERS.map(provider => (
            <button
              key={provider.id}
              className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-4 text-center hover:border-purple-500/20 transition group"
              onClick={() => {
                // TODO: Open provider-specific connection flow
                alert(`${provider.name} integration coming soon!`);
              }}
            >
              <div className="text-2xl mb-2">{provider.icon}</div>
              <div className="text-xs font-medium group-hover:text-purple-300 transition">{provider.name}</div>
              <div className="text-[10px] text-slate-600 mt-1">{provider.desc}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
