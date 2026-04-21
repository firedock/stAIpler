# stAIpler benchmark — Claude Code

Reproducible, paired benchmark that measures Claude Code on a fixed task suite
in two modes:

- `baseline` — Claude Code with no stAIpler artifacts.
- `staipler` — Claude Code with `CLAUDE.md` plus `.claude/skills/*/SKILL.md`
  materialized into the task workspace from the current release.

Every run is designed to be defensible under scrutiny:

- Scoring is **deterministic by default** (file diffs, regex, allowed-glob
  enforcement). `llm_judge` is reserved for genuinely subjective handoff
  checks. Reports surface **deterministic pass rate** and **judge-assisted
  pass rate** as separate numbers — never combined.
- Edit-scope checks (`no_edit_outside`, `workspace_diff_matches`) are computed
  from the **actual git diff** of the task workspace, not from transcript text.
- Each run emits a reproducibility envelope: Claude CLI version, Node version,
  OS, git commit, env allowlist, network policy, task-set hash, and more.
- The compiler target is deterministic: same bundle + git commit + adapter
  version → byte-identical artifacts.

## One-command run

```
pnpm exec staipler benchmark run
```

This compiles the current project state to Claude Code artifacts, runs all 20
tasks twice (baseline + staipler), and writes:

- `.staipler/releases/<release_id>.json` — release manifest
- `benchmark/runs/<release_id>/baseline/run.json`
- `benchmark/runs/<release_id>/baseline/summary.md`
- `benchmark/runs/<release_id>/staipler/run.json`
- `benchmark/runs/<release_id>/staipler/summary.md`
- `benchmark/runs/<release_id>/diff.md` — paired per-task deltas
- `benchmark/runs/<release_id>/<mode>/tasks/<task_id>/{stdout.txt,stderr.txt,transcript.txt,workspace.diff}`

## Useful flags

| Flag | Default | Purpose |
| --- | --- | --- |
| `--mode baseline\|staipler\|both` | `both` | pick which modes to run |
| `--dataset <path>` | `benchmark/harbor/datasets/staipler-core` | dataset directory |
| `--out <path>` | `benchmark/runs` | output root |
| `--model <name>` | `sonnet` | model passed to `claude -p` |
| `--timeout <seconds>` | `180` | per-task timeout |
| `--env-allowlist <csv>` | `PATH,HOME,USER` | env vars forwarded to the subprocess |
| `--network <policy>` | `none` | `none` or `allowlist` |
| `--network-allowlist <csv>` | `` | hosts allowed when `--network=allowlist` |
| `--allow-dirty` | `false` | allow snapshot tasks with a dirty working tree |
| `--limit <n>` | _(all)_ | run only the first N tasks |

## Running against a mock claude

Set `STAIPLER_CLAUDE_BIN` to point at a stand-in binary to exercise the full
pipeline without burning tokens:

```
STAIPLER_CLAUDE_BIN=$PWD/benchmark/harbor/fixtures/mock-claude/claude \
pnpm exec staipler benchmark run --limit 3
```

## Adding a task

Drop a YAML file under
`benchmark/harbor/datasets/staipler-core/tasks/<category>/<id>.yml`. Required
fields:

```yaml
id: con-006
title: ...
category: constraint-obedience
workspace_source: fixture  # or current_repo_snapshot
description: ...
input:
  prompt: |
    ...
  files: []   # optional seed files
requirements:
  - id: r1
    type: no_edit_outside
    description: ...
    allowed_globs: ['src/**']
timeout_seconds: 120
```

Available requirement types (scoring defaults in parentheses):

- `text_contains` / `text_absent` / `text_matches` (deterministic) — stdout,
  stderr, or transcript content.
- `file_exists` / `file_absent` / `file_contains` (deterministic) — post-run
  workspace state.
- `no_edit_outside` / `allowed_edit_globs` (deterministic) — evaluated against
  the real workspace git diff.
- `workspace_diff_matches` / `workspace_diff_absent` (deterministic) — regex
  checks against the unified diff.
- `llm_judge` (judge-assisted) — rubric plus pass threshold. Only use when the
  criterion is genuinely subjective.

### `workspace_source`

- `fixture` — task runs in `benchmark/harbor/fixtures/base-repo/` plus any
  seed files declared in `input.files`.
- `current_repo_snapshot` — task runs in a fresh `git worktree` at the release
  commit. Tests that depend on real repo conventions (commander pattern, ESM
  import style, `packages/adapters/` layout) should use this mode.

## Regenerating reports

```
pnpm exec staipler benchmark summarize benchmark/runs/<release_id>/baseline
pnpm exec staipler benchmark diff \
  benchmark/runs/<release_id>/baseline \
  benchmark/runs/<release_id>/staipler
```

## Inspecting the compiled release

```
pnpm exec staipler compile --target=claude-code --out /tmp/staipler-check
```

The command writes CLAUDE.md, `.claude/skills/*`, and a release manifest. The
`release_id` is a deterministic function of the bundle hash, git commit, and
adapter version — a renderer change produces a new id even when the bundle
and commit are unchanged.
