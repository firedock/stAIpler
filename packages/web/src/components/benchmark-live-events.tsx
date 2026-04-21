'use client';

import { useEffect, useRef, useState } from 'react';

type EventLine = {
  t: number;
  elapsed_ms: number;
  stage: string;
  kind?: string;
  task_id?: string;
  mode?: string;
  detail?: string;
  path?: string;
  layer?: string;
};

export function BenchmarkLiveEvents({ releaseId }: { releaseId: string }) {
  const [events, setEvents] = useState<EventLine[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const es = new EventSource(`/dashboard/benchmark/${releaseId}/events`);
    esRef.current = es;
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.onmessage = e => {
      try {
        const parsed = JSON.parse(e.data) as EventLine;
        setEvents(prev => {
          const next = [...prev, parsed];
          if (next.length > 500) next.splice(0, next.length - 500);
          return next;
        });
      } catch {
        /* ignore malformed */
      }
    };
    return () => {
      es.close();
    };
  }, [releaseId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <section className="mb-8">
      <div className="flex items-center gap-3 mb-3">
        <h2 className="text-xs uppercase tracking-widest text-purple-300 font-bold">Live events</h2>
        <span className={`text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-md border ${
          connected
            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
            : 'border-slate-500/20 bg-slate-500/10 text-slate-400'
        }`}>
          {connected ? 'streaming' : 'disconnected'}
        </span>
        <span className="text-[11px] text-slate-500">{events.length} events</span>
      </div>
      <div
        ref={scrollRef}
        className="rounded-xl border border-white/[0.05] bg-black/30 p-4 font-mono text-[11px] leading-relaxed text-slate-300 overflow-auto max-h-[420px]"
      >
        {events.length === 0 ? (
          <div className="text-slate-500">Waiting for events… run <code className="text-purple-300">staipler benchmark run</code> to populate.</div>
        ) : (
          events.map((ev, i) => (
            <div key={i} className="whitespace-pre">
              <span className="text-slate-500">+{String(ev.elapsed_ms).padStart(6, ' ')}ms</span>{' '}
              <span className="text-purple-300">{ev.stage}/{ev.kind ?? ''}</span>
              {ev.mode ? <> <span className="text-amber-300">[{ev.mode}]</span></> : null}
              {ev.task_id ? <> <span className="text-slate-200">{ev.task_id}</span></> : null}
              {ev.layer ? <> <span className="text-slate-400">{ev.layer}</span></> : null}
              {ev.path ? <> <span className="text-slate-400">{ev.path}</span></> : null}
              {ev.detail ? <> <span className="text-slate-500">— {ev.detail}</span></> : null}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
