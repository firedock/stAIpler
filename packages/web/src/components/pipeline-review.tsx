'use client';

import { useState } from 'react';

/**
 * Pipeline Review — surfaces items that need human judgment before
 * the pipeline finalizes compilation.
 *
 * Three types:
 * - Conflicts: two sources disagree on the same layer
 * - Uncertain: low-confidence extraction, may be misclassified
 * - Clarification: ambiguous content needing user intent
 */

interface ReviewOption {
  id: string;
  label: string;
  description?: string;
}

interface ReviewItem {
  id: string;
  type: 'conflict' | 'uncertain' | 'clarification';
  title: string;
  description: string;
  context: string;
  sourceTitle: string;
  options: ReviewOption[];
  defaultOption: string;
  candidateIds: string[];
}

interface PipelineReviewProps {
  projectId: string;
  reviewItems: ReviewItem[];
  onResolved: () => void;
  readinessScore: number;
  grade: string;
  candidateCount: number;
}

function typeIcon(type: ReviewItem['type']) {
  switch (type) {
    case 'conflict':
      return <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>;
    case 'uncertain':
      return <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    case 'clarification':
      return <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>;
  }
}

function typeBadge(type: ReviewItem['type']) {
  switch (type) {
    case 'conflict':
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium uppercase tracking-wide">Conflict</span>;
    case 'uncertain':
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-medium uppercase tracking-wide">Needs confirmation</span>;
    case 'clarification':
      return <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-medium uppercase tracking-wide">Clarification</span>;
  }
}

export function PipelineReview({ projectId, reviewItems, onResolved, readinessScore, grade, candidateCount }: PipelineReviewProps) {
  const [decisions, setDecisions] = useState<Record<string, string>>(() => {
    // Pre-fill with defaults
    const defaults: Record<string, string> = {};
    for (const item of reviewItems) {
      defaults[item.id] = item.defaultOption;
    }
    return defaults;
  });
  const [resolving, setResolving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const autoAccepted = reviewItems.length; // All items shown for review
  const itemsToShow = showAll ? reviewItems : reviewItems;

  async function handleResolve() {
    setResolving(true);
    try {
      const res = await fetch('/api/pipeline/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          decisions: Object.entries(decisions).map(([itemId, selectedOptionId]) => ({
            itemId,
            selectedOptionId,
          })),
        }),
      });
      if (res.ok) {
        onResolved();
      }
    } catch {}
    setResolving(false);
  }

  function setDecision(itemId: string, optionId: string) {
    setDecisions(prev => ({ ...prev, [itemId]: optionId }));
  }

  return (
    <div className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-sm font-semibold">Review Your Agent&apos;s Knowledge</h3>
        </div>
        <p className="text-[11px] text-slate-500">
          We found {candidateCount} items across your documents. {reviewItems.length > 0
            ? `${reviewItems.length} need${reviewItems.length === 1 ? 's' : ''} your input before we finalize.`
            : 'Everything looks good!'}
        </p>
      </div>

      {/* Review items */}
      <div className="divide-y divide-white/[0.04]">
        {itemsToShow.map((item) => (
          <div key={item.id} className="px-5 py-4">
            <div className="flex items-start gap-2 mb-2">
              {typeIcon(item.type)}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-sm font-medium">{item.title}</span>
                  {typeBadge(item.type)}
                </div>
                <p className="text-[11px] text-slate-500">{item.description}</p>
              </div>
            </div>

            {/* Context preview */}
            <div className="ml-6 mb-3 px-3 py-2 rounded bg-white/[0.02] border border-white/[0.04]">
              <p className="text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed">
                {item.context.slice(0, 300)}{item.context.length > 300 ? '...' : ''}
              </p>
              <p className="text-[9px] text-slate-700 mt-1">From: {item.sourceTitle}</p>
            </div>

            {/* Options */}
            <div className="ml-6 space-y-1.5">
              {item.options.map((option) => (
                <label
                  key={option.id}
                  className={`flex items-start gap-2.5 px-3 py-2 rounded cursor-pointer transition ${
                    decisions[item.id] === option.id
                      ? 'bg-purple-500/10 border border-purple-500/20'
                      : 'bg-white/[0.01] border border-transparent hover:bg-white/[0.03]'
                  }`}
                >
                  <input
                    type="radio"
                    name={item.id}
                    value={option.id}
                    checked={decisions[item.id] === option.id}
                    onChange={() => setDecision(item.id, option.id)}
                    className="mt-0.5 accent-purple-500"
                  />
                  <div>
                    <span className="text-[12px] font-medium">{option.label}</span>
                    {option.description && (
                      <p className="text-[10px] text-slate-600 mt-0.5">{option.description}</p>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-white/[0.04] flex items-center justify-between">
        <div className="text-[11px] text-slate-600">
          Score after review: <span className="text-slate-400 font-medium">{readinessScore}/100 ({grade})</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleResolve}
            disabled={resolving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-xs font-semibold hover:opacity-90 transition disabled:opacity-50"
          >
            {resolving ? 'Finalizing...' : 'Looks good, compile my agent'}
          </button>
        </div>
      </div>
    </div>
  );
}
