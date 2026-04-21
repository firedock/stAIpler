import type {
  BenchmarkCategory,
  BenchmarkMode,
  TaskRunResult,
} from './benchmark-spec.js';
import { BENCHMARK_CATEGORIES } from './benchmark-spec.js';
import { FAILURE_CATEGORIES } from './failure-taxonomy.js';
import type { FailureCategory } from './failure-taxonomy.js';

export interface RunMeta {
  release_id: string;
  bundle_hash: string;
  adapter_version: string;
  core_contract_version: number;
  git_commit: string;
  benchmark_runner_git_commit: string;
  claude_cli_version: string;
  node_version: string;
  platform: string;
  model: string;
  mode: BenchmarkMode;
  timeout_seconds: number;
  timeout_policy: 'kill-on-timeout';
  env_allowlist: string[];
  network_policy: 'none' | 'allowlist';
  network_allowlist: string[];
  allow_dirty: boolean;
  started_at: string;
  finished_at: string;
  total_elapsed_ms: number;
  task_set_hash: string;
}

export interface ReleaseProvenanceSource {
  sourceTitle: string;
  sourceUrl: string | null;
  provider: string;
}

export interface ReleaseLayerProvenance {
  layer: string;
  status: string;
  sources: ReleaseProvenanceSource[];
}

export interface ReleaseConflict {
  layer?: string;
  description: string;
  resolution: string;
  resolvedBy: string;
}

export interface ReleaseSkillSource {
  slug: string;
  path: string;
  sha256: string;
  sources: ReleaseProvenanceSource[];
}

export interface ReleaseCoverage {
  present: string[];
  weak: string[];
  missing: string[];
  readinessScore: number;
  grade: string;
}

/**
 * Release-level context attached to every run so reports can surface
 * provenance, conflicts, gaps, and skill sources alongside pass/fail data.
 * Making these first-class fulfils the #1 visibility rule: what was in the
 * release must be visible next to what the release produced.
 */
export interface ReleaseContext {
  provenance: ReleaseLayerProvenance[];
  conflicts: ReleaseConflict[];
  gaps: string[];
  skill_sources: ReleaseSkillSource[];
  coverage: ReleaseCoverage;
}

export interface PassRates {
  deterministic: { passed: number; total: number; rate: number };
  judge_assisted: { passed: number; total: number; rate: number };
  overall: { passed: number; total: number; rate: number };
}

export interface RunReport {
  meta: RunMeta;
  release?: ReleaseContext;
  results: TaskRunResult[];
  pass_rates: PassRates;
  pass_rates_by_category: Record<BenchmarkCategory, PassRates>;
  failure_histogram: Record<FailureCategory, number>;
  total_elapsed_ms: number;
  token_total: number | null;
  cost_total_usd: number | null;
}

export interface PairedResult {
  task_id: string;
  category: BenchmarkCategory;
  baseline: TaskRunResult | null;
  staipler: TaskRunResult | null;
  delta_pass: number | null;
  delta_deterministic: number | null;
  delta_judge: number | null;
  delta_elapsed_ms: number | null;
  is_regression: boolean;
}

function emptyPassRates(): PassRates {
  return {
    deterministic: { passed: 0, total: 0, rate: 0 },
    judge_assisted: { passed: 0, total: 0, rate: 0 },
    overall: { passed: 0, total: 0, rate: 0 },
  };
}

function finalizeRate(r: { passed: number; total: number; rate: number }) {
  r.rate = r.total === 0 ? 0 : Math.round((r.passed / r.total) * 10000) / 100;
}

export function computePassRates(results: TaskRunResult[]): PassRates {
  const out = emptyPassRates();
  for (const r of results) {
    const hasDeterministic = r.requirement_results.some(rr => rr.scoring === 'deterministic');
    const hasJudge = r.requirement_results.some(rr => rr.scoring === 'judge_assisted');
    if (hasDeterministic) {
      out.deterministic.total += 1;
      if (r.deterministic_pass) out.deterministic.passed += 1;
    }
    if (hasJudge) {
      out.judge_assisted.total += 1;
      if (r.judge_assisted_pass === true) out.judge_assisted.passed += 1;
    }
    out.overall.total += 1;
    if (r.pass) out.overall.passed += 1;
  }
  finalizeRate(out.deterministic);
  finalizeRate(out.judge_assisted);
  finalizeRate(out.overall);
  return out;
}

function computePassRatesByCategory(results: TaskRunResult[]): Record<BenchmarkCategory, PassRates> {
  const out = {} as Record<BenchmarkCategory, PassRates>;
  for (const cat of BENCHMARK_CATEGORIES) {
    out[cat] = computePassRates(results.filter(r => r.category === cat));
  }
  return out;
}

function emptyHistogram(): Record<FailureCategory, number> {
  const h = {} as Record<FailureCategory, number>;
  for (const k of FAILURE_CATEGORIES) h[k] = 0;
  return h;
}

export function generateRunJson(
  results: TaskRunResult[],
  meta: RunMeta,
  release?: ReleaseContext,
): RunReport {
  const histogram = emptyHistogram();
  let token_total: number | null = null;
  let cost_total: number | null = null;
  let totalElapsed = 0;

  for (const r of results) {
    totalElapsed += r.elapsed_ms;
    if (!r.pass && r.failure_category) {
      histogram[r.failure_category] += 1;
    }
    if (r.token_usage != null) token_total = (token_total ?? 0) + r.token_usage;
    if (r.cost_usd != null) cost_total = (cost_total ?? 0) + r.cost_usd;
  }

  return {
    meta,
    release,
    results,
    pass_rates: computePassRates(results),
    pass_rates_by_category: computePassRatesByCategory(results),
    failure_histogram: histogram,
    total_elapsed_ms: totalElapsed,
    token_total,
    cost_total_usd: cost_total,
  };
}

function fmtPct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function fmtRate(r: { passed: number; total: number; rate: number }): string {
  if (r.total === 0) return 'n/a';
  return `${r.passed}/${r.total} (${fmtPct(r.rate)})`;
}

function renderReleaseSections(release: ReleaseContext): string[] {
  const lines: string[] = [];
  lines.push('## Release coverage');
  lines.push('');
  lines.push(`- Present: ${release.coverage.present.length ? release.coverage.present.map(l => `\`${l}\``).join(', ') : '_none_'}`);
  lines.push(`- Weak: ${release.coverage.weak.length ? release.coverage.weak.map(l => `\`${l}\``).join(', ') : '_none_'}`);
  lines.push(`- Missing (gaps): ${release.gaps.length ? release.gaps.map(l => `\`${l}\``).join(', ') : '_none_'}`);
  lines.push(`- Readiness: ${release.coverage.readinessScore}/100 (${release.coverage.grade})`);
  lines.push('');

  lines.push('## Release provenance');
  lines.push('');
  if (release.provenance.length === 0) {
    lines.push('_No layers in bundle._');
  } else {
    lines.push('| Layer | Status | Sources |');
    lines.push('| --- | --- | --- |');
    for (const p of release.provenance) {
      const sources = p.sources.length === 0
        ? '_(none)_'
        : p.sources.map(s => `\`${s.sourceTitle}\` (${s.provider})`).join('<br>');
      lines.push(`| \`${p.layer}\` | ${p.status} | ${sources} |`);
    }
  }
  lines.push('');

  if (release.skill_sources.length > 0) {
    lines.push('## Skills in this release');
    lines.push('');
    lines.push('| Slug | Path | Sources |');
    lines.push('| --- | --- | --- |');
    for (const s of release.skill_sources) {
      const sources = s.sources.length === 0 ? '_(none)_' : s.sources.map(ss => `\`${ss.sourceTitle}\``).join('<br>');
      lines.push(`| \`${s.slug}\` | \`${s.path}\` | ${sources} |`);
    }
    lines.push('');
  }

  lines.push('## Release conflicts');
  lines.push('');
  if (release.conflicts.length === 0) {
    lines.push('_No bundle conflicts recorded._');
  } else {
    const unresolved = release.conflicts.filter(c => c.resolution === 'unresolved');
    if (unresolved.length > 0) {
      lines.push(`> ⚠️  ${unresolved.length} unresolved conflict(s) in the release. Results may reflect contradictory guidance.`);
      lines.push('');
    }
    lines.push('| Layer | Description | Resolution | Resolved by |');
    lines.push('| --- | --- | --- | --- |');
    for (const c of release.conflicts) {
      lines.push(`| ${c.layer ? `\`${c.layer}\`` : ''} | ${c.description} | ${c.resolution} | ${c.resolvedBy} |`);
    }
  }
  lines.push('');
  return lines;
}

export function generateSummaryMd(report: RunReport): string {
  const { meta, pass_rates, pass_rates_by_category, failure_histogram } = report;
  const lines: string[] = [];
  lines.push(`# Benchmark summary — ${meta.mode}`);
  lines.push('');
  lines.push(`- Release: \`${meta.release_id}\``);
  lines.push(`- Bundle hash: \`${meta.bundle_hash}\``);
  lines.push(`- Adapter: \`${meta.adapter_version}\`  ·  Core contract: \`${meta.core_contract_version}\``);
  lines.push(`- Git commit: \`${meta.git_commit}\`  ·  Runner commit: \`${meta.benchmark_runner_git_commit}\``);
  lines.push(`- Claude CLI: \`${meta.claude_cli_version}\`  ·  Model: \`${meta.model}\``);
  lines.push(`- Node: \`${meta.node_version}\`  ·  Platform: \`${meta.platform}\``);
  lines.push(`- Timeout: \`${meta.timeout_seconds}s\` (${meta.timeout_policy})  ·  Network: \`${meta.network_policy}\``);
  lines.push(`- Env allowlist: ${meta.env_allowlist.length ? meta.env_allowlist.map(e => `\`${e}\``).join(', ') : '(none)'}`);
  lines.push(`- Task set hash: \`${meta.task_set_hash}\``);
  lines.push(`- Duration: ${(report.total_elapsed_ms / 1000).toFixed(1)}s`);
  if (report.token_total != null) lines.push(`- Tokens: ${report.token_total}`);
  if (report.cost_total_usd != null) lines.push(`- Cost: $${report.cost_total_usd.toFixed(4)}`);
  if (meta.allow_dirty) lines.push(`- ⚠️  Ran with \`--allow-dirty\` — snapshot tasks may not reflect the committed release state.`);
  lines.push('');

  lines.push('## Headline pass rates');
  lines.push('');
  lines.push('| Scoring | Rate |');
  lines.push('| --- | --- |');
  lines.push(`| Deterministic | ${fmtRate(pass_rates.deterministic)} |`);
  lines.push(`| Judge-assisted | ${fmtRate(pass_rates.judge_assisted)} |`);
  lines.push(`| Overall | ${fmtRate(pass_rates.overall)} |`);
  lines.push('');
  lines.push('> Deterministic and judge-assisted rates are reported separately on purpose. They are not combined.');
  lines.push('');

  lines.push('## By category');
  lines.push('');
  lines.push('| Category | Deterministic | Judge-assisted | Overall |');
  lines.push('| --- | --- | --- | --- |');
  for (const cat of BENCHMARK_CATEGORIES) {
    const r = pass_rates_by_category[cat];
    lines.push(`| ${cat} | ${fmtRate(r.deterministic)} | ${fmtRate(r.judge_assisted)} | ${fmtRate(r.overall)} |`);
  }
  lines.push('');

  lines.push('## Failure histogram');
  lines.push('');
  const failureLines: string[] = [];
  for (const [k, v] of Object.entries(failure_histogram)) {
    if (v > 0) failureLines.push(`- ${k}: ${v}`);
  }
  if (failureLines.length === 0) lines.push('_No failures._');
  else lines.push(...failureLines);
  lines.push('');

  if (report.release) {
    lines.push(...renderReleaseSections(report.release));
  }

  lines.push('## Per-task results');
  lines.push('');
  lines.push('| Task | Category | Pass | Deterministic | Judge | Elapsed (ms) | Failure | Requirements |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of report.results) {
    const judge = r.judge_assisted_pass === null ? '—' : r.judge_assisted_pass ? 'pass' : 'fail';
    const reqs = r.requirement_results
      .map(rr => `${rr.passed ? '✓' : '✗'} ${rr.requirement_id}`)
      .join('<br>');
    lines.push(`| ${r.task_id} | ${r.category} | ${r.pass ? 'pass' : 'fail'} | ${r.deterministic_pass ? 'pass' : 'fail'} | ${judge} | ${r.elapsed_ms} | ${r.failure_category ?? ''} | ${reqs} |`);
  }
  lines.push('');
  return lines.join('\n');
}

export function pairResults(baseline: RunReport, staipler: RunReport): PairedResult[] {
  const byId = new Map<string, { baseline: TaskRunResult | null; staipler: TaskRunResult | null; category: BenchmarkCategory }>();
  for (const r of baseline.results) {
    byId.set(r.task_id, { baseline: r, staipler: null, category: r.category });
  }
  for (const r of staipler.results) {
    const existing = byId.get(r.task_id);
    if (existing) existing.staipler = r;
    else byId.set(r.task_id, { baseline: null, staipler: r, category: r.category });
  }

  const out: PairedResult[] = [];
  for (const [task_id, v] of Array.from(byId.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const b = v.baseline;
    const s = v.staipler;
    const delta_pass = b && s ? Number(s.pass) - Number(b.pass) : null;
    const delta_deterministic = b && s ? Number(s.deterministic_pass) - Number(b.deterministic_pass) : null;
    const delta_judge = b && s && b.judge_assisted_pass !== null && s.judge_assisted_pass !== null
      ? Number(s.judge_assisted_pass) - Number(b.judge_assisted_pass)
      : null;
    const delta_elapsed_ms = b && s ? s.elapsed_ms - b.elapsed_ms : null;
    const is_regression = b && s ? (b.pass && !s.pass) : false;
    out.push({
      task_id,
      category: v.category,
      baseline: b,
      staipler: s,
      delta_pass,
      delta_deterministic,
      delta_judge,
      delta_elapsed_ms,
      is_regression,
    });
  }
  return out;
}

function fmtDelta(n: number | null): string {
  if (n === null) return '—';
  if (n === 0) return '0';
  return n > 0 ? `+${n}` : `${n}`;
}

export function generateDiffMd(baseline: RunReport, staipler: RunReport): string {
  const paired = pairResults(baseline, staipler);
  const regressions = paired.filter(p => p.is_regression);
  const improvements = paired.filter(p => p.delta_pass !== null && p.delta_pass > 0);
  const oneSided = paired.filter(p => p.baseline === null || p.staipler === null);

  const lines: string[] = [];
  lines.push('# Benchmark diff — baseline vs staipler');
  lines.push('');
  lines.push(`- Baseline release: \`${baseline.meta.release_id}\`  ·  mode: \`${baseline.meta.mode}\``);
  lines.push(`- stAIpler release: \`${staipler.meta.release_id}\`  ·  mode: \`${staipler.meta.mode}\``);
  lines.push(`- Baseline task-set hash: \`${baseline.meta.task_set_hash}\``);
  lines.push(`- stAIpler task-set hash: \`${staipler.meta.task_set_hash}\``);
  if (baseline.meta.task_set_hash !== staipler.meta.task_set_hash) {
    lines.push('');
    lines.push('> ⚠️  Task-set hashes differ — the two runs did not exercise the same suite. Deltas are suspect.');
  }
  lines.push('');

  const release = staipler.release ?? baseline.release;
  if (release && (release.conflicts.length > 0 || release.gaps.length > 0)) {
    lines.push('## Release caveats');
    lines.push('');
    if (release.gaps.length > 0) {
      lines.push(`- Missing layers: ${release.gaps.map(l => `\`${l}\``).join(', ')}`);
    }
    if (release.conflicts.length > 0) {
      const unresolved = release.conflicts.filter(c => c.resolution === 'unresolved').length;
      lines.push(`- Bundle conflicts: ${release.conflicts.length} total${unresolved > 0 ? ` (${unresolved} unresolved)` : ''}`);
    }
    lines.push('');
  }

  lines.push('## Aggregate deltas');
  lines.push('');
  lines.push('| Scoring | Baseline | stAIpler | Delta (pp) |');
  lines.push('| --- | --- | --- | --- |');
  const rows: Array<['deterministic' | 'judge_assisted' | 'overall', string]> = [
    ['deterministic', 'Deterministic'],
    ['judge_assisted', 'Judge-assisted'],
    ['overall', 'Overall'],
  ];
  for (const [key, label] of rows) {
    const b = baseline.pass_rates[key];
    const s = staipler.pass_rates[key];
    const delta = (s.rate - b.rate).toFixed(2);
    lines.push(`| ${label} | ${fmtRate(b)} | ${fmtRate(s)} | ${delta} |`);
  }
  lines.push('');
  lines.push(`- Regressions (baseline passed, staipler failed): ${regressions.length}`);
  lines.push(`- Improvements (baseline failed, staipler passed): ${improvements.length}`);
  lines.push(`- One-sided tasks (ran in only one mode): ${oneSided.length}`);
  lines.push('');

  if (regressions.length > 0) {
    lines.push('## Regressions');
    lines.push('');
    lines.push('| Task | Category | Failure |');
    lines.push('| --- | --- | --- |');
    for (const p of regressions) {
      lines.push(`| ${p.task_id} | ${p.category} | ${p.staipler?.failure_category ?? ''} |`);
    }
    lines.push('');
  }

  lines.push('## Per-task pairs');
  lines.push('');
  lines.push('| Task | Category | Baseline | stAIpler | Δ pass | Δ det | Δ judge | Δ ms |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const p of paired) {
    const bPass = p.baseline ? (p.baseline.pass ? 'pass' : 'fail') : '—';
    const sPass = p.staipler ? (p.staipler.pass ? 'pass' : 'fail') : '—';
    lines.push(`| ${p.task_id} | ${p.category} | ${bPass} | ${sPass} | ${fmtDelta(p.delta_pass)} | ${fmtDelta(p.delta_deterministic)} | ${fmtDelta(p.delta_judge)} | ${fmtDelta(p.delta_elapsed_ms)} |`);
  }
  lines.push('');
  return lines.join('\n');
}
