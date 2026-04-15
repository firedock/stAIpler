'use client';

import { useCallback, useEffect, useState } from 'react';
import { ObjectCard } from '@/components/visible-object';
import { atomToVisible, type AtomRow } from '@/lib/knowledge/to-visible';

export function ReviewQueue({ projectId }: { projectId: string }) {
  const [atoms, setAtoms] = useState<AtomRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/atoms?projectId=${projectId}&reviewState=pending`);
      const data = await res.json();
      if (!res.ok) setError(data.error ?? 'Failed to load review queue');
      else setAtoms(data.atoms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load queue');
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <p className="text-sm text-slate-400 animate-pulse">Loading review queue…</p>;
  }
  if (error) {
    return <p className="text-sm text-rose-300">{error}</p>;
  }
  if (!atoms || atoms.length === 0) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-8 text-center">
        <p className="text-slate-200 font-medium">The review queue is empty.</p>
        <p className="text-sm text-slate-400 mt-1">
          When sessions close, extracted candidates land here for your approval.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-[11px] text-slate-400 mb-2">
        {atoms.length} atom{atoms.length === 1 ? '' : 's'} pending · actions become live in Step 7
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {atoms.map(atom => (
          <ObjectCard
            key={atom.id}
            object={atomToVisible(atom, {
              actions: [
                // Step 7 wires these to real API calls. For now they're placeholders
                // so the keyboard shortcut contract is visible from day one.
                { id: 'approve', label: 'Approve', shortcut: 'a', onInvoke: () => alert('Wired in Step 7') },
                { id: 'merge', label: 'Merge', shortcut: 'm', onInvoke: () => alert('Wired in Step 7') },
                { id: 'edit', label: 'Edit', shortcut: 'e', onInvoke: () => alert('Wired in Step 7') },
                { id: 'reject', label: 'Reject', shortcut: 'r', destructive: true, onInvoke: () => alert('Wired in Step 7') },
              ],
            })}
          />
        ))}
      </div>
    </div>
  );
}
