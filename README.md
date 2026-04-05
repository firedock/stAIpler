# stAIpler

**Turn any AI agent into a Subject Expert.**

Your AI agent is flying blind. It has no idea about your codebase, your business rules, or your coding conventions. stAIpler scans your project, finds what's missing, and builds an optimized instruction stack that transforms a generic AI into a domain expert.

Same model. Dramatically better results.

**https://staipler.com**

## What It Does

```
$ staipler optimize --scan-only

Scanning for instruction files...
Found 22 instruction files
Readiness: 51/100 (F) — 5 layers missing

$ staipler optimize

Generating skills layer... done
Generating policies layer... done
Readiness: 95/100 (A) — Agent is a Subject Expert
```

## How It Works

1. **Scan** — Discovers instruction files across 30+ formats (CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions.md, SKILL.md, GEMINI.md, and more)
2. **Analyze** — Maps files to 12 instruction layers and scores your coverage with an Empowerment Score
3. **Optimize** — AI generates missing layers using your existing project context
4. **Measure** — A/B tests your optimized stack vs a control to quantify improvement

## The 12 Instruction Layers

| Layer | What It Does | Importance |
|-------|-------------|------------|
| **IDENTITY.md** | Who the agent is, its role and persona | Critical |
| **CONSTRAINTS.md** | Hard limits and non-negotiables | Critical |
| **GOALS.md** | Success criteria and priorities | Recommended |
| **CONTEXT.md** | Domain knowledge and business rules | Recommended |
| **SKILLS.md** | Workflows and decision trees | Recommended |
| **STYLE.md** | Tone, formatting, response shape | Recommended |
| **POLICIES.md** | Compliance, legal, brand rules | Recommended |
| **EXAMPLES.md** | Few-shot examples and templates | Optional |
| **TOOLS.md** | Available tools and usage rules | Optional |
| **PROMPTS.md** | Reusable prompt fragments | Optional |
| **EVALS.md** | Test cases and acceptance criteria | Optional |
| **MEMORY.md** | Runtime session context (injectable) | Optional |

## Works With Every AI Tool

stAIpler doesn't replace your tools — it makes them all better by ensuring your instruction context is complete.

| Your Tool | stAIpler Imports |
|-----------|-----------------|
| Claude Code | CLAUDE.md |
| OpenAI Codex | AGENTS.md, SKILL.md |
| GitHub Copilot | copilot-instructions.md, *.instructions.md |
| Gemini CLI | GEMINI.md |
| Cursor | .cursorrules, .cursor/rules/*.mdc |
| Windsurf | .windsurfrules |
| Cline | .clinerules |
| Aider | CONVENTIONS.md |

## Quick Start

### CLI

```bash
# Scan your project
npx staipler optimize --scan-only

# See the optimization plan
npx staipler optimize --dry-run

# Run full optimization
npx staipler optimize --report

# A/B test your stack
npx staipler eval customer-support

# View your dashboard
npx staipler dashboard
```

### Web Dashboard

Create an account at **https://staipler.com** to:
- Track your Empowerment Score over time
- Connect data sources (GitHub, Notion, Google Docs, and more)
- Test your agent with the split-view chat interface
- Collaborate with your team

### SDK

```typescript
import { buildStack, scan, analyze, optimize } from '@staipler/core';

// Scan a project
const scanResult = scan('/path/to/project');
const analysis = analyze(scanResult);
console.log(`Readiness: ${analysis.readinessScore}/100`);

// Compile a stack
const bundle = buildStack('customer-support', stacksDir, {
  libraryDir: '/path/to/library',
});
console.log(bundle.fullText); // optimized system prompt
```

## Project Structure

```
staipler/
├── packages/
│   ├── core/     # @staipler/core — scanner, analyzer, compiler, optimizer
│   ├── cli/      # @staipler/cli — build, validate, optimize, eval, dashboard
│   └── web/      # Next.js web app with Supabase auth
├── library/      # Instruction assets
├── stacks/       # Deployment recipes
├── contracts/    # Structural constraints
└── site/         # Landing page
```

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built by [Firedock](https://firedock.com) | [GitHub](https://github.com/firedock/stAIpler) | [Web](https://staipler.com)
