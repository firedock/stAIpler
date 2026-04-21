# stAIpler

**Turn any AI agent into a Subject Expert.**

Your AI agent is flying blind. It has no idea about your codebase, your business rules, or your coding conventions. stAIpler scans your project, finds what's missing, and builds an optimized instruction stack that transforms a generic AI into a domain expert.

Same model. Dramatically better results.

**https://staipler.com**

## What It Does

```
$ staipler watch

  stAIpler v0.1.0 — watching ~/my-project

  Empowerment: 72/100 (C)  ██████████░░░░  9/12 layers
  ▲ +8 since last change (added CONSTRAINTS.md)

  Missing: policies, examples, evals

  Press o to optimize · i inject · q quit
```

```
$ staipler ci --min-score 70

  stAIpler CI  ✓ PASS

  Score:    82/100 (B)
  Layers:   10 present, 1 weak, 1 missing

  All checks passed.
```

## How It Works

1. **Scan** — Discovers instruction files across 30+ formats (CLAUDE.md, AGENTS.md, .cursorrules, copilot-instructions.md, SKILL.md, GEMINI.md, and more)
2. **Analyze** — Maps files to 12 instruction layers and scores your coverage with an Empowerment Score
3. **Watch** — Live terminal dashboard updates as you edit, like `jest --watch` for your AI context
4. **Optimize** — AI generates missing layers using your existing project context
5. **Inject** — Writes your agent's blind spots directly into its config file — the agent literally knows what context it's missing
6. **Gate** — CI command enforces minimum scores and required layers in your pipeline

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

## CI/CD Integration

Add stAIpler to your pipeline like a test suite:

```yaml
# .github/workflows/staipler.yml
name: AI Context Check
on: [push, pull_request]
jobs:
  staipler:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npx staipler ci --min-score 70
```

Or as a pre-commit hook:

```bash
# .husky/pre-commit
npx staipler ci --min-score 60
```

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

### Step 1: Initialize

Open your terminal in any project and run:

```bash
npx staipler init
```

This will:
- Scan your project for existing instruction files (CLAUDE.md, .cursorrules, AGENTS.md, etc.)
- Score your agent's context coverage across 12 layers
- Create `.staipler.json` (your project config)
- Create `.staipler/kpi.json` (score history)

If you already have an agent config file like CLAUDE.md, stAIpler will auto-detect it and inject your empowerment status. If you don't have one yet:

```bash
npx staipler init --inject CLAUDE.md
```

### Step 2: See Where You Stand

After init, you'll see your layer coverage:

```
  ✓ identity       92/100
  ✓ constraints    85/100
  ✗ goals           0/100
  ✓ context        78/100
  ✗ policies        0/100
  ...
```

Each `✗` is a blind spot — something your agent doesn't know about your project.

### Step 3: Fill the Gaps

Let AI generate the missing layers based on your existing project context:

```bash
npx staipler optimize
```

Or do a dry run first to see the plan:

```bash
npx staipler optimize --dry-run
```

### Step 4: Watch as You Work

Leave this running in a terminal while you code:

```bash
npx staipler watch
```

Your empowerment score updates live every time you edit an instruction file. Press `o` to optimize, `i` to inject status, `q` to quit.

### Step 5: Tell Your Agent What It's Missing

This is the feature no other tool has. Run:

```bash
npx staipler inject
```

stAIpler writes a status block directly into your agent's config file:

```markdown
<!-- staipler:status -->

**Empowerment Score: 72/100 (C)**

Missing layers: policies, examples, evals

When working in this project, be aware of these gaps:
- No compliance/policy layer — flag any compliance decisions to the user.
- No goals defined — confirm priorities before starting multi-step tasks.

Coverage: 9 present, 0 weak, 3 missing out of 12 layers

<!-- /staipler:status -->
```

The agent literally reads this. It knows its own blind spots and adjusts its behavior — asking for clarification in areas where it has no context instead of hallucinating.

### Step 6: Gate Your CI/CD

Add quality checks to your pipeline so context quality never regresses:

```bash
npx staipler ci --min-score 70
```

Exits with code 1 if the score is below the threshold or required layers are missing. Add it to GitHub Actions, pre-commit hooks, or any CI system.

### Configuration

`.staipler.json` controls all behavior. It's created by `init` and you can edit it anytime:

```json
{
  "minScore": 70,
  "requiredLayers": ["identity", "constraints"],
  "inject": "CLAUDE.md"
}
```

| Field | What It Does | Default |
|-------|-------------|---------|
| `minScore` | Minimum score for `staipler ci` to pass | `70` |
| `requiredLayers` | Layers that must be present for CI to pass | `["identity", "constraints"]` |
| `inject` | Agent config file for status injection | auto-detected |
| `ignore` | Glob patterns to skip during scan | `[]` |
| `watchDebounce` | Debounce delay for watch mode (ms) | `300` |

### Web Dashboard

Create an account at **https://staipler.com** to:
- Track your Empowerment Score over time
- Connect data sources (GitHub, Notion, Google Docs, and more)
- Test your agent with the split-view chat interface
- Collaborate with your team

### All Commands

| Command | What It Does |
|---------|-------------|
| `staipler init` | Set up stAIpler in your project |
| `staipler watch` | Live score dashboard (like jest --watch) |
| `staipler optimize` | AI generates missing layers |
| `staipler inject` | Write agent status into config file |
| `staipler ci` | CI/CD quality gate |
| `staipler dashboard` | Generate HTML report |
| `staipler eval <stack>` | A/B test your stack vs control |
| `staipler build <stack>` | Compile a stack to a bundle |
| `staipler validate` | Validate stacks and contracts |

## Project Structure

```
staipler/
├── packages/
│   ├── core/                    # @staipler/core — scanner, analyzer, compiler, optimizer
│   ├── cli/                     # @staipler/cli — build, validate, optimize, eval, dashboard
│   ├── web/                     # Next.js web app with Supabase auth
│   └── adapters/claude-code/    # @staipler/adapter-claude-code — CLAUDE.md + .claude/skills/* target
├── benchmark/harbor/            # Paired baseline/staipler benchmark (see benchmark/harbor/README.md)
├── library/                     # Instruction assets
├── stacks/                      # Deployment recipes
├── contracts/                   # Structural constraints
└── site/                        # Landing page
```

## Benchmark

`staipler benchmark run` executes the 20-task suite under
`benchmark/harbor/datasets/staipler-core/` twice — once in baseline mode, once
with stAIpler-compiled Claude Code artifacts materialized into each task
workspace — and emits `run.json`, `summary.md`, and a paired `diff.md`.
Scoring is biased toward deterministic checks (git diff, regex, allowed-glob)
with judge-assisted checks reserved for subjective criteria. Full details:
[benchmark/harbor/README.md](benchmark/harbor/README.md).

## License

MIT — see [LICENSE](LICENSE) for details.

---

Built by [Firedock](https://firedock.com) | [GitHub](https://github.com/firedock/stAIpler) | [Web](https://staipler.com)
