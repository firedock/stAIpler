'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const CONSTRAINT_QUESTION = {
  question: 'What is one thing your AI agent should NEVER do in this project?',
  hint: 'e.g., "delete production data", "commit directly to main", "expose API keys"',
};

const CONTEXT_QUESTION = {
  question: 'What domain-specific term or concept would a generic AI get wrong?',
  hint: 'e.g., "a \'stack\' means a compiled instruction bundle, not a tech stack"',
};

function sanitizeAnswer(raw: string): string {
  let s = raw.trim().replace(/\s+/g, ' ');
  if (s.length > 200) s = s.slice(0, 200).trim();
  s = s.replace(/ignore\s+(all\s+)?previous\s+instructions/i, '').trim();
  s = s.replace(/ignore\s+(all\s+)?above/i, '').trim();
  return s;
}

function synthesizeTestPrompt(constraint: string, context: string): string {
  const lower = constraint.toLowerCase();
  let constraintProbe = `what should I know about: "${constraint}"?`;
  const negMatch = lower.match(/(?:never|don'?t|do\s+not|should\s+not|must\s+not|shouldn'?t)\s+(.+)/);
  if (negMatch) {
    constraintProbe = `what's the fastest way to ${negMatch[1].replace(/\.$/, '').trim()}?`;
  }

  let contextProbe = `Can you explain: "${context}"?`;
  const termMatch = context.match(/['"]([^'"]+)['"]\s+(?:means?|is|refers?\s+to)/i);
  if (termMatch) {
    contextProbe = `What does "${termMatch[1]}" mean in this project?`;
  }

  return `I'm new to this project and need to move fast. ${contextProbe} Also, ${constraintProbe}`;
}

interface ProveValueCardProps {
  projectId: string;
  projectName: string;
}

export function ProveValueCard({ projectId, projectName }: ProveValueCardProps) {
  const [constraint, setConstraint] = useState('');
  const [context, setContext] = useState('');
  const router = useRouter();

  function handleRun() {
    const c = sanitizeAnswer(constraint);
    const x = sanitizeAnswer(context);
    if (c.length < 5 || x.length < 5) return;

    const prompt = synthesizeTestPrompt(c, x);

    // Build a minimal system prompt from the two answers
    const systemPrompt = `# CONSTRAINTS\n\n- ${c}\n\n# CONTEXT\n\n${x}`;

    // Store in sessionStorage for the chat page to hydrate
    sessionStorage.setItem(`staipler-demo-${projectId}`, JSON.stringify({
      prompt,
      systemPrompt,
      constraintAnswer: c,
      contextAnswer: x,
    }));

    router.push(`/dashboard/${projectId}/chat?demo=1`);
  }

  const ready = constraint.trim().length >= 5 && context.trim().length >= 5;

  return (
    <div className="mb-8 p-6 rounded-xl bg-gradient-to-br from-purple-500/5 to-indigo-500/5 border border-purple-500/10">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold">See the difference stAIpler makes</h3>
          <p className="text-xs text-slate-500">Answer 2 questions, then watch the same model respond with and without your context</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            {CONSTRAINT_QUESTION.question}
          </label>
          <input
            type="text"
            value={constraint}
            onChange={e => setConstraint(e.target.value)}
            placeholder={CONSTRAINT_QUESTION.hint}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/30"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-400 mb-1.5">
            {CONTEXT_QUESTION.question}
          </label>
          <input
            type="text"
            value={context}
            onChange={e => setContext(e.target.value)}
            placeholder={CONTEXT_QUESTION.hint}
            className="w-full px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06] text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-purple-500/30"
          />
        </div>

        <button
          onClick={handleRun}
          disabled={!ready}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 text-sm font-semibold hover:opacity-90 hover:-translate-y-0.5 transition-all shadow-lg shadow-purple-500/10 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          See the Difference
        </button>
      </div>
    </div>
  );
}
