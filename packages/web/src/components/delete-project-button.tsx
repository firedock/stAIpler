'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function DeleteProjectButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !busy) setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy]);

  function openModal() {
    setError(null);
    setConfirmText('');
    setOpen(true);
  }

  function closeModal() {
    if (busy) return;
    setOpen(false);
  }

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects?id=${encodeURIComponent(projectId)}`, { method: 'DELETE' });
      if (!res.ok) {
        const { error: msg } = await res.json().catch(() => ({ error: 'Delete failed' }));
        setError(msg ?? 'Delete failed');
        setBusy(false);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err?.message ?? 'Network error');
      setBusy(false);
    }
  }

  const canConfirm = confirmText.trim() === projectName.trim() && !busy;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        aria-label={`Delete project ${projectName}`}
        title="Delete project"
        className="flex items-center justify-center w-10 h-10 rounded-xl border border-white/[0.06] text-slate-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/[0.06] transition shrink-0"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-project-title"
          onClick={closeModal}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="relative bg-[#0d0d1a] border border-white/[0.08] rounded-2xl w-full max-w-md overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <h2 id="delete-project-title" className="text-base font-semibold">Delete project</h2>
                  <p className="text-sm text-slate-400 mt-1">
                    This permanently removes <span className="text-slate-200 font-medium">{projectName}</span>, including all snapshots, data sources, layer candidates, compiled bundles, and knowledge atoms. This cannot be undone.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label htmlFor="delete-confirm" className="block text-xs text-slate-500 mb-2">
                  Type <span className="text-slate-300 font-mono">{projectName}</span> to confirm
                </label>
                <input
                  id="delete-confirm"
                  type="text"
                  autoFocus
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  disabled={busy}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/[0.06] text-sm focus:outline-none focus:border-red-500/40 focus:bg-black/60 transition disabled:opacity-50"
                  placeholder={projectName}
                />
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-300">
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 bg-black/30 border-t border-white/[0.04]">
              <button
                type="button"
                onClick={closeModal}
                disabled={busy}
                className="px-4 py-2 rounded-lg text-sm text-slate-300 hover:bg-white/[0.04] transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={!canConfirm}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-sm font-semibold text-white hover:bg-red-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {busy && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path fill="currentColor" d="M4 12a8 8 0 018-8v3a5 5 0 00-5 5H4z" />
                  </svg>
                )}
                {busy ? 'Deleting…' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
