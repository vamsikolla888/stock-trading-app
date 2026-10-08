import type { StatusTone } from '@/features/settings/lib/status';

import type {
  AdminJob,
  AdminJobLog,
  AdminNewsRun,
  AdminNewsRunsPage,
  NewsRunStage,
  NewsRunStageStatus,
  NewsRunStatus,
} from '../types';

/**
 * A five-field cron expression (minute hour day month weekday), as the worker expects.
 * Only the shape is checked here — the server validates the fields themselves and its
 * message is shown if it refuses.
 */
export function isCronShape(pattern: string): boolean {
  const trimmed = pattern.trim();
  if (trimmed.length < 9 || trimmed.length > 100) return false;
  const fields = trimmed.split(/\s+/);
  return fields.length === 5 && fields.every((field) => /^[\d*/,\-A-Za-z?LW#]+$/.test(field));
}

/** "2 active · 3 queued" and "1 failed · 40 completed". */
export function jobActivity(counts: AdminJob['counts']): { primary: string; secondary: string } {
  return {
    primary: `${counts.active} active · ${counts.waiting + counts.delayed} queued`,
    secondary: `${counts.failed} failed · ${counts.completed} completed`,
  };
}

export function jobStateTone(state: string): StatusTone {
  if (state === 'completed') return 'ok';
  if (state === 'failed') return 'bad';
  if (state === 'active') return 'info';
  return 'neutral';
}

/** Under a schedule: when it next runs, or why it doesn't. */
export function cronNextLabel(
  job: Pick<AdminJob, 'nextRunAt' | 'editable'>,
  formatNext: (iso: string) => string,
): string {
  if (job.nextRunAt) return `Next ${formatNext(job.nextRunAt)}`;
  return job.editable === false
    ? 'Not registered by any worker'
    : 'Activates when the worker starts';
}

export interface JobsSummary {
  /** Null until the schedules have loaded. */
  scheduled: number | null;
  /** Schedules a worker has registered (they have a next run). */
  registered: number | null;
  queues: number | null;
  /** Null until either list has loaded. */
  active: number | null;
  waiting: number | null;
  failed: number | null;
}

/** The headline numbers across every cron and queue — read from the queues themselves. */
export function jobsSummary(
  crons: readonly AdminJob[] | undefined,
  queues: readonly AdminJob[] | undefined,
): JobsSummary {
  const loaded = crons !== undefined || queues !== undefined;
  const all = [...(crons ?? []), ...(queues ?? [])];
  const sum = (pick: (c: AdminJob['counts']) => number) =>
    loaded ? all.reduce((n, job) => n + pick(job.counts), 0) : null;
  return {
    scheduled: crons ? crons.length : null,
    registered: crons ? crons.filter((job) => job.nextRunAt).length : null,
    queues: queues ? queues.length : null,
    active: sum((c) => c.active),
    waiting: sum((c) => c.waiting + c.delayed),
    failed: sum((c) => c.failed),
  };
}

export type LogFilter = 'all' | 'failed' | 'active' | 'completed';

export function logCounts(logs: readonly AdminJobLog[]): Record<LogFilter, number> {
  const c: Record<LogFilter, number> = { all: logs.length, failed: 0, active: 0, completed: 0 };
  for (const log of logs) {
    if (log.state === 'failed' || log.state === 'active' || log.state === 'completed') {
      c[log.state] += 1;
    }
  }
  return c;
}

export function filterLogs(logs: readonly AdminJobLog[], filter: LogFilter): AdminJobLog[] {
  return filter === 'all' ? [...logs] : logs.filter((log) => log.state === filter);
}

// ── News ingestion runs ────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const RUN_STATUSES: readonly NewsRunStatus[] = ['RUNNING', 'COMPLETED', 'FAILED'];
const STAGE_STATUSES: readonly NewsRunStageStatus[] = [
  'PENDING',
  'RUNNING',
  'OK',
  'EMPTY',
  'FAILED',
];

function stage(raw: unknown): NewsRunStage | null {
  const s = obj(raw);
  const label = text(s.label) ?? text(s.key);
  if (!label) return null;
  return {
    key: text(s.key) ?? label,
    label,
    status: (STAGE_STATUSES as readonly unknown[]).includes(s.status)
      ? (s.status as NewsRunStageStatus)
      : 'PENDING',
    detail: text(s.detail),
    itemCount: num(s.itemCount),
  };
}

/** One run as GET /news/runs sends it. The server calls the trigger `triggeredBy`. */
export function normalizeNewsRun(raw: unknown): AdminNewsRun | null {
  const r = obj(raw);
  const runId = text(r.runId);
  const startedAt = text(r.startedAt);
  if (!runId || !startedAt) return null;
  const trigger = text(r.triggeredBy) ?? text(r.trigger);
  return {
    runId,
    status: (RUN_STATUSES as readonly unknown[]).includes(r.status)
      ? (r.status as NewsRunStatus)
      : 'RUNNING',
    trigger: trigger === 'MANUAL' ? 'MANUAL' : 'SCHEDULED',
    startedAt,
    finishedAt: text(r.finishedAt),
    stages: (Array.isArray(r.stages) ? r.stages : [])
      .map(stage)
      .filter((s): s is NewsRunStage => s !== null),
    inserted: num(obj(r.counts).inserted),
    errorMessage: text(r.errorMessage) ?? text(r.error),
  };
}

export function normalizeNewsRuns(raw: unknown): AdminNewsRunsPage {
  const page = obj(raw);
  const runs = (Array.isArray(page.runs) ? page.runs : [])
    .map(normalizeNewsRun)
    .filter((run): run is AdminNewsRun => run !== null);
  return { runs, total: Math.max(runs.length, num(page.total) ?? 0) };
}

/** EMPTY is not an error: a provider that ran and returned nothing is the normal case for the
 *  news sites that block automated readers — painting it red makes a healthy run look broken. */
export const STAGE_STATE: Record<NewsRunStageStatus, { tone: StatusTone; label: string }> = {
  OK: { tone: 'ok', label: 'OK' },
  EMPTY: { tone: 'neutral', label: 'Empty' },
  FAILED: { tone: 'bad', label: 'Failed' },
  RUNNING: { tone: 'info', label: 'Running' },
  PENDING: { tone: 'neutral', label: 'Pending' },
};

export const RUN_STATE: Record<NewsRunStatus, { tone: StatusTone; label: string }> = {
  COMPLETED: { tone: 'ok', label: 'Completed' },
  FAILED: { tone: 'bad', label: 'Failed' },
  RUNNING: { tone: 'info', label: 'Running' },
};

/** "4.2s", "38s", "running" — or a dash for a clock that went backwards. */
export function runDuration(run: Pick<AdminNewsRun, 'startedAt' | 'finishedAt'>): string {
  if (!run.finishedAt) return 'running';
  const ms = Date.parse(run.finishedAt) - Date.parse(run.startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  return ms < 10_000 ? `${(ms / 1000).toFixed(1)}s` : `${Math.round(ms / 1000)}s`;
}

/** Items every provider handed back in a run. */
export function runItems(run: Pick<AdminNewsRun, 'stages'>): number {
  return run.stages.reduce((n, s) => n + (s.itemCount ?? 0), 0);
}

/** "12 of 17 providers returned items" — the line under a run. */
export function runStagesLine(run: Pick<AdminNewsRun, 'stages'>): string {
  if (run.stages.length === 0) return 'No providers recorded';
  const ok = run.stages.filter((s) => s.status === 'OK').length;
  const failed = run.stages.filter((s) => s.status === 'FAILED').length;
  return `${ok} of ${run.stages.length} providers returned items${failed > 0 ? ` · ${failed} failed` : ''}`;
}

export function hasRunningRun(runs: readonly Pick<AdminNewsRun, 'status'>[]): boolean {
  return runs.some((run) => run.status === 'RUNNING');
}
