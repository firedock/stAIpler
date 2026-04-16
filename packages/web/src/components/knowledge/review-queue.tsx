'use client';

import { useCallback, useEffect, useState } from 'react';
import { ObjectCard } from '@/components/visible-object';
import { atomToVisible, type AtomRow, type AtomEventRow } from '@/lib/knowledge/to-visible';

interface SimilarPair {
  peerAtomId: string;
  similarity: number;
}

export function ReviewQueue({ projectId }: { projectId: string }) {
  const [atoms, setAtoms] = useState<AtomRow[] | null>(null);
  const [pairsByAtomId, setPairsByAtomId] = useState<Record<string, SimilarPair[]>>({});
  const [atomById, setAtomById] = useState<Record<string, AtomRow>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/knowledge/atoms?projectId=${projectId}&reviewState=pending`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Failed to load review queue');
        setLoading(false);
        return;
      }
      const pendingAtoms = (data.atoms ?? []) as AtomRow[];
      setAtoms(pendingAtoms);

      // Fetch similar_detected events for each pending atom to surface pairs.
      const pairs: Record<string, SimilarPair[]> = {};
      const peerIdSet = new Set<string>();

      await Promise.all(
        pendingAtoms.map(async atom => {
          try {
            const detailRes = await fetch(`/api/knowledge/atoms/${atom.id}`);
            if (!detailRes.ok) return;
            const detail = await detailRes.json();
            const events = (detail.events ?? []) as AtomEventRow[];
            const simEvents = events.filter(e => e.event_type === 'similar_detected');
            const peers: SimilarPair[] = [];
            for (const e of simEvents) {
              const peerId = (e.payload as { peer_atom_id?: string })?.peer_atom_id;
              const sim = Number((e.payload as { similarity?: number })?.similarity ?? 0);
              if (peerId) {
                peers.push({ peerAtomId: peerId, similarity: sim });
                peerIdSet.add(peerId);
              }
            }
            if (peers.length > 0) pairs[atom.id] = peers;
          } catch {
            /* ignore per-atom fetch failures */
          }
        }),
      );
      setPairsByAtomId(pairs);

      // Peers may live outside the pending list; fetch whatever is missing.
      const peerMap: Record<string, AtomRow> = {};
      for (const atom of pendingAtoms) peerMap[atom.id] = atom;
      const missingPeerIds = Array.from(peerIdSet).filter(id => !peerMap[id]);
      if (missingPeerIds.length > 0) {
        await Promise.all(
          missingPeerIds.map(async id => {
            try {
              const r = await fetch(`/api/knowledge/atoms/${id}`);
              if (!r.ok) return;
              const d = await r.json();
              if (d.atom) peerMap[id] = d.atom as AtomRow;
            } catch {
              /* ignore */
            }
          }),
        );
      }
      setAtomById(peerMap);
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

  async function runAction(
    atomId: string,
    action: 'approve' | 'reject' | 'edit' | 'promote' | 'demote' | 'merge',
    extra: Record<string, unknown> = {},
  ) {
    try {
      const res = await fetch(`/api/knowledge/atoms/${atomId}/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error ?? `Action '${action}' failed`);
        return;
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Action '${action}' failed`);
    }
  }

  function actionsFor(atomId: string, peerIds: string[]) {
    return [
      {
        id: 'approve',
        label: 'Approve',
        shortcut: 'a',
        onInvoke: () => runAction(atomId, 'approve'),
      },
      {
        id: 'merge',
        label: 'Merge',
        shortcut: 'm',
        onInvoke: () => {
          let peerId = peerIds[0];
          if (peerIds.length > 1) {
            const picked = prompt(
              `Merge this atom INTO which peer atom id?\nOptions:\n${peerIds.map(id => '  ' + id).join('\n')}`,
            );
            if (!picked) return;
            peerId = picked.trim();
          }
          if (!peerId) {
            alert('Merge requires a near-duplicate pair. Trigger Reconcile first.');
            return;
          }
          runAction(atomId, 'merge', { peerAtomId: peerId });
        },
      },
      {
        id: 'edit',
        label: 'Edit',
        shortcut: 'e',
        onInvoke: () => {
          const current = atomById[atomId]?.content ?? '';
          const next = prompt('Edit atom content:', current);
          if (next === null) return;
          const trimmed = next.trim();
          if (!trimmed || trimmed === current) return;
          runAction(atomId, 'edit', { content: trimmed });
        },
      },
      {
        id: 'reject',
        label: 'Reject',
        shortcut: 'r',
        destructive: true,
        onInvoke: () => runAction(atomId, 'reject'),
      },
    ];
  }

  return (
    <div className="space-y-4">
      <div className="text-[11px] text-slate-400">
        {atoms.length} atom{atoms.length === 1 ? '' : 's'} pending review · actions: a approve · m merge · e edit · r reject
      </div>

      {atoms.map(atom => {
        const pairs = pairsByAtomId[atom.id] ?? [];
        return (
          <div key={atom.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            {pairs.length === 0 ? (
              <ObjectCard
                object={atomToVisible(atom, { actions: actionsFor(atom.id, pairs.map(p => p.peerAtomId)) })}
              />
            ) : (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-amber-300 font-semibold mb-2">
                  Near-duplicate · {pairs.length} pair{pairs.length === 1 ? '' : 's'} detected
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <ObjectCard
                object={atomToVisible(atom, { actions: actionsFor(atom.id, pairs.map(p => p.peerAtomId)) })}
              />
                  {pairs.map(pair => {
                    const peer = atomById[pair.peerAtomId];
                    if (!peer) {
                      return (
                        <div
                          key={pair.peerAtomId}
                          className="rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[11px] text-slate-400"
                        >
                          Peer atom not found ({pair.peerAtomId.slice(0, 8)}…) · similarity {(pair.similarity * 100).toFixed(1)}%
                        </div>
                      );
                    }
                    const obj = atomToVisible(peer);
                    obj.status.badge = `similarity ${(pair.similarity * 100).toFixed(1)}%`;
                    return <ObjectCard key={pair.peerAtomId} object={obj} />;
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
