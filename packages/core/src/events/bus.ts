/**
 * Typed event bus used for real-time visibility.
 *
 * The #1 rule of this codebase (see CLAUDE.md) is total visibility — every
 * pipeline stage, contract, and conflict must be visible to the user in real
 * time. The bus exists so that compile, materialize, and the benchmark runner
 * can emit structured events that are simultaneously:
 *   - streamed to the console in a human-readable way
 *   - persisted to a JSONL log for the dashboard and post-hoc audit
 *   - inspected in memory by tests and programmatic consumers
 *
 * Events are cheap to emit and must never throw, so sinks are wrapped in
 * try/catch. Ordering is preserved.
 */

export type VisibilityEvent =
  | ScanEvent
  | AnalyzeEvent
  | BundleEvent
  | RenderEvent
  | MaterializeEvent
  | ReleaseEvent
  | TaskEvent
  | RequirementEvent
  | RunEvent
  | WarningEvent;

export interface BaseEvent {
  /** Monotonic millisecond timestamp (Date.now()). */
  t: number;
  /** Elapsed milliseconds since the bus was created. */
  elapsed_ms: number;
  /** Logical stage bucket — drives which emoji/color the console sink uses. */
  stage:
    | 'scan'
    | 'analyze'
    | 'bundle'
    | 'render'
    | 'materialize'
    | 'release'
    | 'task'
    | 'requirement'
    | 'run'
    | 'warning';
}

export interface ScanEvent extends BaseEvent {
  stage: 'scan';
  kind: 'start' | 'file' | 'done';
  file_count?: number;
  path?: string;
  layer?: string;
}

export interface AnalyzeEvent extends BaseEvent {
  stage: 'analyze';
  kind: 'start' | 'layer' | 'done';
  layer?: string;
  status?: 'present' | 'weak' | 'missing';
  quality_score?: number;
  readiness_score?: number;
  grade?: string;
}

export interface BundleEvent extends BaseEvent {
  stage: 'bundle';
  kind: 'start' | 'section' | 'conflict' | 'gap' | 'done';
  layer?: string;
  bundle_hash?: string;
  token_estimate?: number;
  section_count?: number;
  conflict_count?: number;
  gap_count?: number;
  detail?: string;
}

export interface RenderEvent extends BaseEvent {
  stage: 'render';
  kind: 'claude-md' | 'skill' | 'manifest' | 'done';
  path?: string;
  layer?: string;
  skill_slug?: string;
  byte_count?: number;
}

export interface MaterializeEvent extends BaseEvent {
  stage: 'materialize';
  kind: 'write' | 'done';
  path?: string;
  byte_count?: number;
  artifact_count?: number;
}

export interface ReleaseEvent extends BaseEvent {
  stage: 'release';
  kind: 'compiled' | 'persisted';
  release_id: string;
  bundle_hash: string;
  determinism_hash?: string;
  adapter_version?: string;
  core_contract_version?: number;
  conflicts_unresolved?: number;
  gaps?: string[];
  path?: string;
}

export interface TaskEvent extends BaseEvent {
  stage: 'task';
  kind:
    | 'start'
    | 'provision'
    | 'materialize-artifacts'
    | 'spawn'
    | 'spawn-done'
    | 'evaluate'
    | 'done';
  task_id: string;
  mode: 'baseline' | 'staipler';
  category?: string;
  workspace_source?: 'fixture' | 'current_repo_snapshot';
  workspace_path?: string;
  exit_code?: number | null;
  elapsed_task_ms?: number;
  pass?: boolean;
  deterministic_pass?: boolean;
  judge_assisted_pass?: boolean | null;
  failure_category?: string | null;
  detail?: string;
}

export interface RequirementEvent extends BaseEvent {
  stage: 'requirement';
  kind: 'evaluated';
  task_id: string;
  mode: 'baseline' | 'staipler';
  requirement_id: string;
  requirement_type: string;
  scoring: 'deterministic' | 'judge_assisted';
  passed: boolean;
  detail?: string;
}

export interface RunEvent extends BaseEvent {
  stage: 'run';
  kind: 'start' | 'mode-start' | 'mode-done' | 'done';
  release_id?: string;
  mode?: 'baseline' | 'staipler';
  task_count?: number;
  pass_rate?: number;
  deterministic_pass_rate?: number;
  judge_assisted_pass_rate?: number | null;
  elapsed_total_ms?: number;
}

export interface WarningEvent extends BaseEvent {
  stage: 'warning';
  kind: 'conflict' | 'gap' | 'dirty-repo' | 'generic';
  message: string;
  detail?: string;
}

export type EventSink = (event: VisibilityEvent) => void;

/** Distributes Omit over a union so callers can emit a single variant. */
type DistributiveOmit<T, K extends keyof BaseEvent> = T extends BaseEvent ? Omit<T, K> : never;
export type EventInput = DistributiveOmit<VisibilityEvent, 't' | 'elapsed_ms'>;

export class EventBus {
  private readonly started = Date.now();
  private readonly sinks: EventSink[] = [];

  addSink(sink: EventSink): void {
    this.sinks.push(sink);
  }

  emit(event: EventInput): void {
    const full = {
      t: Date.now(),
      elapsed_ms: Date.now() - this.started,
      ...event,
    } as VisibilityEvent;
    for (const sink of this.sinks) {
      try { sink(full); } catch { /* sinks must never break the emitter */ }
    }
  }
}

/** Minimal no-op bus for call sites that don't want visibility (e.g. tests). */
export const silentBus = (): EventBus => new EventBus();
