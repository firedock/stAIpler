'use client';

import { useState } from 'react';

interface ScenarioResult {
  name: string;
  requirements: string[];
  beforeSummary: string;
  afterSummary: string;
  beforeReqsMet: number;
  afterReqsMet: number;
  totalReqs: number;
}

interface QuickProofResult {
  empBefore: number;
  empAfter: number;
  benchBefore: number;
  benchAfter: number;
  gradeBefore: string;
  gradeAfter: string;
  scenarios: ScenarioResult[];
  improved: number;
  totalReqsMet: number;
  totalReqs: number;
}

interface StepStatus {
  step: number;
  label: string;
  status: 'pending' | 'running' | 'done';
  detail?: string;
}

const STEPS: { step: number; label: string }[] = [
  { step: 1, label: 'Reading your project' },
  { step: 2, label: 'Writing the test' },
  { step: 3, label: 'Agent takes the test (no instruction stack)' },
  { step: 4, label: 'Generating instruction layers' },
  { step: 5, label: 'Agent retakes the same test (with stAIpler)' },
  { step: 6, label: 'AI grades both runs blind' },
  { step: 7, label: 'Results' },
];

interface QuickProofCardProps {
  projectId: string;
  projectName: string;
}

export function QuickProofCard({ projectId, projectName }: QuickProofCardProps) {
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<StepStatus[]>(STEPS.map(s => ({ ...s, status: 'pending' })));
  const [result, setResult] = useState<QuickProofResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRun() {
    setRunning(true);
    setError(null);
    setResult(null);
    setSteps(STEPS.map(s => ({ ...s, status: 'pending' })));

    try {
      const res = await fetch('/api/quick-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error ?? 'Quick proof failed');
        setRunning(false);
        return;
      }

      // Stream SSE progress
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;

            try {
              const msg = JSON.parse(data);
              if (msg.type === 'step') {
                setSteps(prev => prev.map(s =>
                  s.step === msg.step ? { ...s, status: msg.status, detail: msg.detail } :
                  s.step < msg.step ? { ...s, status: 'done' } : s
                ));
              } else if (msg.type === 'result') {
                setResult(msg.data);
                setSteps(STEPS.map(s => ({ ...s, status: 'done' })));
              } else if (msg.type === 'error') {
                setError(msg.message);
              }
            } catch {
              // Partial SSE chunk during streaming — expected, not an error
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Quick proof failed');
    }

    setRunning(false);
  }

  // Already have results — show them
  if (result) {
    return (
      <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/10">
        <h3 className="text-sm font-semibold mb-4">Quick Proof — {projectName}</h3>

        {/* Score bars */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Instruction coverage</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                <div className="h-full bg-red-500/50 rounded-full" style={{ width: `${result.empBefore}%` }} />
              </div>
              <span className="text-xs text-red-400">{result.empBefore}/100</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${result.empAfter}%` }} />
              </div>
              <span className="text-xs text-emerald-400">{result.empAfter}/100 ({result.gradeAfter})</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] text-slate-600 uppercase tracking-wide mb-1">Benchmark performance</div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                <div className="h-full bg-red-500/50 rounded-full" style={{ width: `${(result.benchBefore / 5) * 100}%` }} />
              </div>
              <span className="text-xs text-red-400">{result.benchBefore.toFixed(1)}/5</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 bg-white/[0.03] rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(result.benchAfter / 5) * 100}%` }} />
              </div>
              <span className="text-xs text-emerald-400">{result.benchAfter.toFixed(1)}/5</span>
            </div>
          </div>
        </div>

        {/* Scenario results */}
        <div className="space-y-3">
          {result.scenarios.map((s, i) => (
            <div key={i} className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="text-sm font-medium mb-2">"{s.name}"</div>
              <div className="text-xs text-red-400 mb-1">
                <span className="mr-1">✗</span> Before: {s.beforeSummary} <span className="text-slate-600">({s.beforeReqsMet}/{s.totalReqs} requirements)</span>
              </div>
              <div className="text-xs text-emerald-400">
                <span className="mr-1">✓</span> After: {s.afterSummary} <span className="text-slate-600">({s.afterReqsMet}/{s.totalReqs} requirements)</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-slate-500">
          {result.improved}/{result.scenarios.length} scenarios improved. {result.totalReqsMet}/{result.totalReqs} requirements met.
        </div>
      </div>
    );
  }

  return (
    <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/10">
      {/* Cold-start message */}
      {!running && (
        <>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-semibold">See the difference stAIpler makes</h3>
              <p className="text-xs text-slate-500">
                Without stAIpler, every agent session starts cold — scanning your codebase,
                guessing conventions. Run a quick proof to see the before and after.
              </p>
            </div>
          </div>
          <button
            onClick={handleRun}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Run Quick Proof (~90 sec)
          </button>
        </>
      )}

      {/* Progress */}
      {running && (
        <div>
          <h3 className="text-sm font-semibold mb-4">Quick Proof — running...</h3>
          <div className="space-y-2">
            {steps.map(s => (
              <div key={s.step} className="flex items-center gap-3 text-xs">
                <span className="w-5 text-right text-slate-600">{s.step}.</span>
                {s.status === 'done' && <span className="text-emerald-400 w-4">✓</span>}
                {s.status === 'running' && <span className="text-purple-400 w-4 animate-pulse">●</span>}
                {s.status === 'pending' && <span className="text-slate-700 w-4">○</span>}
                <span className={s.status === 'pending' ? 'text-slate-700' : s.status === 'running' ? 'text-slate-300' : 'text-slate-400'}>
                  {s.label}
                </span>
                {s.detail && <span className="text-slate-600 ml-auto">{s.detail}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
