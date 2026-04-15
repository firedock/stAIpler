'use client';

import { useState, useEffect } from 'react';

interface DeployPanelProps {
  projectId: string;
  hasAgentConfig: boolean;
}

export function DeployPanel({ projectId, hasAgentConfig }: DeployPanelProps) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Widget customization
  const [accentColor, setAccentColor] = useState('#7c3aed');
  const [welcomeMessage, setWelcomeMessage] = useState('Hi! How can I help you today?');

  // Fetch existing deploy token
  useEffect(() => {
    if (!hasAgentConfig) return;
    fetch(`/api/widget/token?projectId=${projectId}`)
      .then(r => r.json())
      .then(data => { if (data.token) setToken(data.token); })
      .catch(err => { setError('Could not load deploy token'); });
  }, [projectId, hasAgentConfig]);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/widget/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, accentColor, welcomeMessage }),
      });
      const data = await res.json();
      if (data.token) setToken(data.token);
      else setError(data.error ?? 'Failed to generate deploy token');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to server');
    }
    setLoading(false);
  }

  function handleCopy() {
    if (!token) return;
    const baseUrl = window.location.origin;
    const snippet = `<script src="${baseUrl}/api/widget/embed/${token}"></script>`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!hasAgentConfig) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const snippet = token ? `<script src="${baseUrl}/api/widget/embed/${token}"></script>` : '';

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold mb-4 hover:text-purple-400 transition"
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Deploy
      </button>

      {expanded && (
        <div className="p-5 rounded-xl bg-[#0d0d1a] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75L22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3l-4.5 16.5" /></svg>
            </div>
            <div>
              <div className="text-sm font-semibold">Embed on your website</div>
              <div className="text-xs text-slate-500">Add a chat widget to any site with one line of code</div>
            </div>
          </div>

          {!token ? (
            <div className="space-y-4">
              {/* Customization */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Accent color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded border border-white/10 bg-transparent cursor-pointer"
                    />
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300 font-mono focus:outline-none focus:border-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Welcome message</label>
                  <input
                    type="text"
                    value={welcomeMessage}
                    onChange={(e) => setWelcomeMessage(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs text-slate-300 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-medium hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? 'Generating...' : 'Generate embed code'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Snippet */}
              <div className="relative">
                <pre className="px-4 py-3 rounded-lg bg-black/40 border border-white/[0.06] text-xs text-slate-300 font-mono overflow-x-auto">
                  {snippet}
                </pre>
                <button
                  onClick={handleCopy}
                  className={`absolute top-2 right-2 px-2.5 py-1 rounded-md text-[10px] font-medium transition ${
                    copied ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <p className="text-[11px] text-slate-600">
                Paste this before the closing <code className="text-slate-500">&lt;/body&gt;</code> tag on any page where you want the chat widget to appear.
              </p>

              {/* Preview indicator */}
              <div className="flex items-center gap-2 pt-2">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: accentColor }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="#fff"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
                </div>
                <div className="text-xs text-slate-500">This is how the chat bubble will look on your site</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
