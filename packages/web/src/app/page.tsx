import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-6 pt-20 pb-6 flex justify-between items-center bg-[#06060e]/80 backdrop-blur-xl border-b border-white/[0.04]">
        <img src="/staipler-logo.svg" alt="stAIpler" className="h-28 w-auto absolute left-1/2 -translate-x-1/2 top-12" />
        <div className="w-0" />
        <div className="flex items-center gap-6 ml-auto">
          <a href="#how-it-works" className="text-sm text-slate-400 hover:text-slate-200 transition hidden sm:block">How It Works</a>
          <a href="#taxonomy" className="text-sm text-slate-400 hover:text-slate-200 transition hidden sm:block">Taxonomy</a>
          <Link href="/login" className="text-sm text-slate-400 hover:text-slate-200 transition">Log in</Link>
          <Link href="/signup" className="text-sm px-4 py-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 font-medium hover:opacity-90 transition">Get Started</Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="min-h-screen flex flex-col items-center justify-center text-center px-6 pt-56 relative">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[radial-gradient(circle,rgba(124,58,237,0.08)_0%,transparent_70%)] pointer-events-none" />
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-purple-500/8 border border-purple-500/15 text-sm text-purple-400 mb-6 -translate-x-8">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Open Source
        </div>
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight max-w-3xl leading-[1.1] mb-5">
          Turn any AI agent into a{' '}
          <span className="bg-gradient-to-r from-purple-300 via-purple-500 to-indigo-600 bg-clip-text text-transparent">Subject Expert</span>
        </h1>
        <p className="text-lg text-slate-400 max-w-xl mb-10 font-light">
          stAIpler scans your project, finds missing instruction layers, and optimizes your agent&apos;s context. Same model, dramatically better results.
        </p>
        <div className="flex gap-4 flex-wrap justify-center">
          <Link href="/signup" className="px-8 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-semibold hover:shadow-lg hover:shadow-purple-500/20 hover:-translate-y-0.5 transition-all">Get Started Free</Link>
          <a href="#how-it-works" className="px-8 py-3.5 rounded-xl bg-white/[0.04] border border-white/[0.08] font-medium hover:bg-white/[0.08] transition">See How It Works</a>
        </div>

        {/* Terminal demo */}
        <div className="mt-16 bg-[#0d0d1a] border border-white/[0.06] rounded-xl p-6 sm:p-8 text-left max-w-xl w-full font-mono text-sm leading-8 relative z-10">
          <div><span className="text-slate-600">$</span> <span className="text-purple-400">staipler optimize --scan-only</span></div>
          <div className="text-slate-600">Scanning for instruction files...</div>
          <div className="text-slate-600">Found 22 instruction files</div>
          <div><span className="text-slate-600">Readiness:</span> <span className="text-red-400 font-semibold">51/100 (F)</span> <span className="text-slate-700">— 5 layers missing</span></div>
          <div className="h-4" />
          <div><span className="text-slate-600">$</span> <span className="text-purple-400">staipler optimize</span></div>
          <div className="text-slate-600">Generating skills layer... done</div>
          <div className="text-slate-600">Generating policies layer... done</div>
          <div><span className="text-slate-600">Readiness:</span> <span className="text-emerald-400 font-semibold">95/100 (A)</span> <span className="text-slate-700">— Agent is a Subject Expert</span></div>
        </div>
      </section>

      {/* Problem */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.15em] text-purple-500 font-semibold mb-3">The Problem</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Scattered context, generic output</h2>
          <p className="text-slate-500 max-w-xl mb-12">Every AI tool has its own instruction file. None of them talk to each other. Your agent gets fragments instead of a complete picture.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { title: 'No identity', desc: 'Without an identity layer, your agent doesn\'t know what role it plays.' },
              { title: 'No guardrails', desc: 'Without constraints, the agent has no safety boundaries or coding standards.' },
              { title: 'No measurement', desc: 'No way to know if your instruction files are complete or effective.' },
              { title: 'Fragmented ecosystem', desc: 'CLAUDE.md, AGENTS.md, .cursorrules — every tool expects a different file.' },
            ].map(card => (
              <div key={card.title} className="bg-[#0d0d1a] border border-white/[0.04] rounded-xl p-6">
                <h4 className="font-semibold mb-2">{card.title}</h4>
                <p className="text-sm text-slate-500">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.15em] text-purple-500 font-semibold mb-3">How It Works</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Four steps to a Subject Expert</h2>
          <p className="text-slate-500 max-w-xl mb-12">stAIpler takes your agent from blank slate to domain expert.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-white/[0.04] rounded-xl overflow-hidden">
            {[
              { num: '1', title: 'Scan', desc: 'Discovers all instruction files across 30+ formats automatically.', color: 'text-slate-400 bg-slate-500/10' },
              { num: '2', title: 'Analyze', desc: 'Maps files to layers and scores coverage. Shows you the gaps.', color: 'text-amber-400 bg-amber-500/10' },
              { num: '3', title: 'Optimize', desc: 'AI generates missing layers using your project context.', color: 'text-purple-400 bg-purple-500/10' },
              { num: '4', title: 'Measure', desc: 'A/B tests optimized stack vs control. Quantifies improvement.', color: 'text-emerald-400 bg-emerald-500/10' },
            ].map(step => (
              <div key={step.num} className="bg-[#0d0d1a] p-8 text-center">
                <div className={`w-10 h-10 rounded-full ${step.color} flex items-center justify-center font-bold text-sm mx-auto mb-4`}>{step.num}</div>
                <h4 className="font-semibold mb-2">{step.title}</h4>
                <p className="text-sm text-slate-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs uppercase tracking-[0.15em] text-purple-500 font-semibold mb-3">Real Results</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-12">From flying blind to Subject Expert</h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 bg-[#0d0d1a] rounded-2xl p-10 border border-white/[0.04]">
            <div className="text-center">
              <div className="text-5xl font-extrabold text-red-400">51</div>
              <div className="text-sm text-slate-500 mt-2">Before</div>
              <div className="text-lg font-bold text-red-400">F</div>
            </div>
            <div className="text-3xl text-slate-700 hidden sm:block">&rarr;</div>
            <div className="text-center">
              <div className="text-5xl font-extrabold text-purple-400">80</div>
              <div className="text-sm text-slate-500 mt-2">After Optimize</div>
              <div className="text-lg font-bold text-blue-400">B</div>
            </div>
            <div className="text-3xl text-slate-700 hidden sm:block">&rarr;</div>
            <div className="text-center">
              <div className="text-5xl font-extrabold text-emerald-400">95</div>
              <div className="text-sm text-slate-500 mt-2">Compiled Stack</div>
              <div className="text-lg font-bold text-emerald-400">A</div>
              <div className="text-xs text-slate-600 mt-1">Subject Expert</div>
            </div>
          </div>
        </div>
      </section>

      {/* Taxonomy */}
      <section id="taxonomy" className="py-24 px-6 bg-white/[0.01]">
        <div className="max-w-5xl mx-auto">
          <p className="text-xs uppercase tracking-[0.15em] text-purple-500 font-semibold mb-3">The Standard</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">One taxonomy for every AI tool</h2>
          <p className="text-slate-500 max-w-xl mb-12">Three classes of instruction files. Native assets stAIpler compiles, imported files it normalizes, and project docs it can reference.</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-[#0d0d1a] rounded-xl p-6 border border-purple-500/10">
              <h4 className="text-purple-400 font-semibold mb-1">Class 1: Native Assets</h4>
              <p className="text-xs text-slate-600 mb-4">The core stAIpler vocabulary</p>
              <div className="flex flex-wrap gap-1.5">
                {['IDENTITY', 'GOALS', 'CONTEXT', 'CONSTRAINTS', 'SKILLS', 'STYLE', 'EXAMPLES', 'TOOLS', 'MEMORY', 'POLICIES', 'EVALS'].map(f => (
                  <span key={f} className="text-[11px] px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 font-mono">{f}.md</span>
                ))}
              </div>
            </div>
            <div className="bg-[#0d0d1a] rounded-xl p-6 border border-blue-500/10">
              <h4 className="text-blue-400 font-semibold mb-1">Class 2: Imported Adapters</h4>
              <p className="text-xs text-slate-600 mb-4">External ecosystem files normalized</p>
              <div className="flex flex-wrap gap-1.5">
                {['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'SKILL.md', 'copilot-instructions', '.cursorrules', '.windsurfrules'].map(f => (
                  <span key={f} className="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono">{f}</span>
                ))}
              </div>
            </div>
            <div className="bg-[#0d0d1a] rounded-xl p-6 border border-white/[0.06]">
              <h4 className="text-slate-400 font-semibold mb-1">Class 3: Supporting Docs</h4>
              <p className="text-xs text-slate-600 mb-4">Project docs for optional context</p>
              <div className="flex flex-wrap gap-1.5">
                {['README', 'ARCHITECTURE', 'PLAN', 'API', 'SECURITY', 'TESTING', 'CHANGELOG', 'llms.txt'].map(f => (
                  <span key={f} className="text-[11px] px-2 py-0.5 rounded bg-white/5 text-slate-500 font-mono">{f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ecosystems */}
      <section className="py-24 px-6 text-center">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs uppercase tracking-[0.15em] text-purple-500 font-semibold mb-3">Ecosystem Support</p>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Works with every AI coding tool</h2>
          <p className="text-slate-500 max-w-lg mx-auto mb-10">stAIpler doesn&apos;t replace your tools. It makes them all better.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {['Claude Code', 'OpenAI Codex', 'GitHub Copilot', 'Gemini CLI', 'Cursor', 'Windsurf', 'Cline', 'Aider', 'skills.sh'].map(tool => (
              <div key={tool} className="px-5 py-2.5 rounded-lg bg-[#0d0d1a] border border-white/[0.06] text-sm text-slate-400 font-medium">{tool}</div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold tracking-tight mb-4">Make your AI a Subject Expert</h2>
        <p className="text-slate-500 max-w-md mx-auto mb-10">Free to start. Install the CLI or create an account to use the web dashboard.</p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <code className="px-6 py-3 rounded-xl bg-[#0d0d1a] border border-white/[0.08] text-purple-400 font-mono text-sm">
            <span className="text-slate-600">$ </span>npx staipler optimize --scan-only
          </code>
          <Link href="/signup" className="px-8 py-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 font-semibold hover:opacity-90 transition">Create Free Account</Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6 text-center">
        <p className="text-xs text-slate-700">Built by Firedock &middot; Open Source</p>
      </footer>
    </div>
  );
}
