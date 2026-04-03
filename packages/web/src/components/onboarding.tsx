'use client';

import { useState } from 'react';

interface OnboardingProps {
  projectName: string;
  onDismiss: () => void;
  onConnectSource: () => void;
}

const STEPS = [
  {
    number: 1,
    title: 'Your agent starts here — flying blind',
    description: 'Right now your AI agent has zero project context. It relies entirely on general training data, which means generic responses, hallucinated patterns, and no awareness of your codebase, rules, or domain.',
    visual: 'score-zero',
    cta: null,
  },
  {
    number: 2,
    title: 'stAIpler maps 12 instruction layers',
    description: 'Every effective AI agent needs Identity (who it is), Context (domain knowledge), Constraints (guardrails), Skills (how-to), and more. stAIpler tracks all 12 layers so you can see exactly what your agent knows — and what it\'s missing.',
    visual: 'layers',
    cta: null,
  },
  {
    number: 3,
    title: 'Connect your data to build context',
    description: 'Import your existing instruction files from GitHub, upload markdown files directly, or connect data sources like Notion or Google Docs. stAIpler scans everything, classifies it by layer type, and scores your coverage.',
    visual: 'connect',
    cta: 'connect',
  },
  {
    number: 4,
    title: 'AI fills the gaps, you review',
    description: 'stAIpler\'s optimizer analyzes what\'s missing and generates project-specific instruction layers using AI. It doesn\'t replace what you have — it fills the gaps. You review and approve everything.',
    visual: 'optimize',
    cta: null,
  },
  {
    number: 5,
    title: 'Your agent becomes a Subject Expert',
    description: 'With a complete instruction stack, your AI agent transforms from a generic assistant into a domain expert that knows your codebase, follows your rules, and produces consistently better output. Track the improvement over time.',
    visual: 'expert',
    cta: 'connect',
  },
];

const LAYER_LABELS = [
  { name: 'Identity', importance: 'critical', color: '#ef4444' },
  { name: 'Goals', importance: 'recommended', color: '#f97316' },
  { name: 'Context', importance: 'recommended', color: '#3b82f6' },
  { name: 'Policies', importance: 'recommended', color: '#dc2626' },
  { name: 'Constraints', importance: 'critical', color: '#ef4444' },
  { name: 'Skills', importance: 'recommended', color: '#10b981' },
  { name: 'Style', importance: 'recommended', color: '#a855f7' },
  { name: 'Examples', importance: 'optional', color: '#eab308' },
  { name: 'Tools', importance: 'optional', color: '#6b7280' },
  { name: 'Prompts', importance: 'optional', color: '#8b5cf6' },
  { name: 'Evals', importance: 'optional', color: '#0ea5e9' },
  { name: 'Memory', importance: 'optional', color: '#06b6d4' },
];

function StepVisual({ type }: { type: string }) {
  if (type === 'score-zero') {
    return (
      <div className="flex items-center justify-center py-6">
        <div className="relative w-28 h-28">
          <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
            <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
            <circle cx="56" cy="56" r="48" fill="none" stroke="#ef4444" strokeWidth="6" strokeDasharray={2 * Math.PI * 48} strokeDashoffset={2 * Math.PI * 48} strokeLinecap="round" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold text-red-400">0</span>
            <span className="text-[8px] text-slate-600 uppercase tracking-widest">Empowerment</span>
          </div>
        </div>
        <div className="ml-6 text-left">
          <div className="text-red-400 font-bold text-lg">Flying Blind</div>
          <div className="text-xs text-slate-600">0 of 12 layers</div>
          <div className="text-xs text-slate-600">No project context</div>
        </div>
      </div>
    );
  }

  if (type === 'layers') {
    return (
      <div className="grid grid-cols-4 gap-1.5 py-4 max-w-sm mx-auto">
        {LAYER_LABELS.map(l => (
          <div key={l.name} className="bg-white/[0.02] border border-white/[0.04] rounded-md px-2 py-1.5 text-center">
            <div className="text-[10px] font-medium" style={{ color: l.color }}>{l.name}</div>
            <div className="text-[9px] text-slate-700">{l.importance}</div>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'connect') {
    return (
      <div className="flex justify-center gap-4 py-6">
        {[
          { icon: '🐙', name: 'GitHub' },
          { icon: '📁', name: 'Upload' },
          { icon: '📓', name: 'Notion' },
          { icon: '📄', name: 'Docs' },
        ].map(s => (
          <div key={s.name} className="w-16 h-16 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col items-center justify-center gap-1">
            <span className="text-lg">{s.icon}</span>
            <span className="text-[9px] text-slate-500">{s.name}</span>
          </div>
        ))}
      </div>
    );
  }

  if (type === 'optimize') {
    return (
      <div className="flex items-center justify-center gap-6 py-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-400">51</div>
          <div className="text-[10px] text-slate-600">Before</div>
        </div>
        <div className="text-slate-700 text-xl">&rarr;</div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-400">80</div>
          <div className="text-[10px] text-slate-600">After AI</div>
        </div>
        <div className="text-slate-700 text-xl">&rarr;</div>
        <div className="text-center">
          <div className="text-2xl font-bold text-emerald-400">95</div>
          <div className="text-[10px] text-slate-600">Compiled</div>
        </div>
      </div>
    );
  }

  // expert
  return (
    <div className="flex items-center justify-center py-6">
      <div className="relative w-28 h-28">
        <svg width="112" height="112" viewBox="0 0 112 112" className="-rotate-90">
          <circle cx="56" cy="56" r="48" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="6" />
          <circle cx="56" cy="56" r="48" fill="none" stroke="#10b981" strokeWidth="6"
            strokeDasharray={2 * Math.PI * 48}
            strokeDashoffset={2 * Math.PI * 48 * 0.05}
            strokeLinecap="round"
            style={{ filter: 'drop-shadow(0 0 8px rgba(16,185,129,0.3))' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-emerald-400">95</span>
          <span className="text-[8px] text-slate-600 uppercase tracking-widest">Empowerment</span>
        </div>
      </div>
      <div className="ml-6 text-left">
        <div className="text-emerald-400 font-bold text-lg">Subject Expert</div>
        <div className="text-xs text-slate-600">12 of 12 layers</div>
        <div className="text-xs text-slate-600">Full project context</div>
      </div>
    </div>
  );
}

export function Onboarding({ projectName, onDismiss, onConnectSource }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="bg-[#0d0d1a] border border-purple-500/15 rounded-2xl p-8 mb-10 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-[radial-gradient(circle,rgba(124,58,237,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Dismiss */}
      <button onClick={onDismiss} className="absolute top-4 right-4 text-slate-700 hover:text-slate-400 transition text-sm">
        Skip tour
      </button>

      {/* Step indicator */}
      <div className="flex gap-1.5 mb-6">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-8 bg-purple-500' : i < step ? 'w-4 bg-purple-500/40' : 'w-4 bg-white/[0.06]'}`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="max-w-lg mx-auto text-center">
        <div className="text-xs text-purple-400 font-semibold uppercase tracking-wider mb-3">
          Step {current.number} of {STEPS.length}
        </div>
        <h3 className="text-xl font-bold mb-3">{current.title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed mb-4">{current.description}</p>

        <StepVisual type={current.visual} />

        {/* Navigation */}
        <div className="flex justify-center gap-3 mt-6">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-5 py-2 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-400 hover:bg-white/[0.08] transition"
            >
              Back
            </button>
          )}

          {isLast ? (
            <button
              onClick={onConnectSource}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 transition"
            >
              Connect Your First Data Source
            </button>
          ) : current.cta === 'connect' ? (
            <div className="flex gap-3">
              <button
                onClick={onConnectSource}
                className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 transition"
              >
                Connect Now
              </button>
              <button
                onClick={() => setStep(step + 1)}
                className="px-5 py-2.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-400 hover:bg-white/[0.08] transition"
              >
                Continue Tour
              </button>
            </div>
          ) : (
            <button
              onClick={() => setStep(step + 1)}
              className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-sm font-semibold hover:opacity-90 transition"
            >
              Next
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
