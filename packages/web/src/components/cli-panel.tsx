'use client';

import { useState } from 'react';

interface CliPanelProps {
  projectId: string;
}

export function CliPanel({ projectId }: CliPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedTarget, setCopiedTarget] = useState<string | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/cli/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'CLI token' }),
      });
      const data = await res.json();
      if (data.token) setToken(data.token);
      else setError(data.error ?? 'Failed to generate token');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not connect to server');
    }
    setGenerating(false);
  }

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedTarget(key);
    setTimeout(() => setCopiedTarget(null), 2000);
  }

  const loginCommand = token ? `staipler login --token ${token}` : 'staipler login --token <your-token>';
  const pullCommand = `staipler pull ${projectId}`;

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold mb-4 hover:text-purple-400 transition"
      >
        <svg className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
        Sync with your codebase
      </button>

      {expanded && (
        <div className="p-5 rounded-xl bg-[#0d0d1a] border border-white/[0.06]">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z" /></svg>
            </div>
            <div>
              <div className="text-sm font-semibold">Sync this stack to your local repo</div>
              <div className="text-xs text-slate-500">The CLI writes the compiled instruction files into your working tree — you review and commit</div>
            </div>
          </div>

          <ol className="space-y-4">
            {/* Step 1: Generate token */}
            <li>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Step 1 — Generate a CLI token</div>
              {!token ? (
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-xs font-medium hover:opacity-90 transition disabled:opacity-50"
                >
                  {generating ? 'Generating...' : 'Generate token'}
                </button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <pre className="px-3 py-2.5 rounded-lg bg-black/40 border border-emerald-500/20 text-xs text-emerald-300 font-mono overflow-x-auto pr-16">
                      {token}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(token, 'token')}
                      className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${copiedTarget === 'token' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}
                    >
                      {copiedTarget === 'token' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <p className="text-[10px] text-amber-400/80">Save this token now — it won&apos;t be shown again. Anyone with this token can read your projects.</p>
                </div>
              )}
              {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
            </li>

            {/* Step 2: Login */}
            <li>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Step 2 — Authenticate the CLI</div>
              <p className="text-xs text-slate-500 mb-2">In your terminal, run:</p>
              <div className="relative">
                <pre className="px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs text-slate-300 font-mono overflow-x-auto pr-16">
                  {loginCommand}
                </pre>
                <button
                  onClick={() => copyToClipboard(loginCommand, 'login')}
                  className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${copiedTarget === 'login' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}
                >
                  {copiedTarget === 'login' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </li>

            {/* Step 3: Pull */}
            <li>
              <div className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-2">Step 3 — Pull this project into your repo</div>
              <p className="text-xs text-slate-500 mb-2">From the root of your repo, run:</p>
              <div className="relative">
                <pre className="px-3 py-2.5 rounded-lg bg-black/40 border border-white/[0.06] text-xs text-slate-300 font-mono overflow-x-auto pr-16">
                  {pullCommand}
                </pre>
                <button
                  onClick={() => copyToClipboard(pullCommand, 'pull')}
                  className={`absolute top-2 right-2 px-2.5 py-0.5 rounded-md text-[10px] font-medium transition ${copiedTarget === 'pull' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-slate-300'}`}
                >
                  {copiedTarget === 'pull' ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <p className="text-[11px] text-slate-600 mt-2">
                The CLI will show a diff of every file before writing. Review with <code className="text-slate-500">git diff</code> and commit when ready.
              </p>
            </li>
          </ol>

          <div className="mt-5 pt-4 border-t border-white/[0.04]">
            <p className="text-[11px] text-slate-600">
              Don&apos;t have the CLI? Install with <code className="text-slate-500">npm install -g @staipler/cli</code> or run via <code className="text-slate-500">npx @staipler/cli pull {projectId}</code>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
