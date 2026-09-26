import type { StatusTone } from '@/features/settings/lib/status';

import type {
  ExecutionStatus,
  ExecutionSummary,
  TriggeredBy,
  UpdateWorkflowConfigInput,
  WorkflowEnvVar,
  WorkflowSummary,
  WorkflowTriggerType,
} from '../types';

// Pure logic behind the Automations screens, ported from the web's N8nWorkflows.tsx.

export type RunStatusKey = ExecutionStatus | 'idle';

/** The one status indicator per workflow: the last run's outcome, or "No runs yet". */
export const RUN_STATUS: Record<RunStatusKey, { label: string; tone: StatusTone }> = {
  running: { label: 'Running', tone: 'info' },
  success: { label: 'Succeeded', tone: 'ok' },
  error: { label: 'Failed', tone: 'bad' },
  idle: { label: 'No runs yet', tone: 'neutral' },
};

export function runStatus(status: ExecutionStatus | null | undefined) {
  return RUN_STATUS[status ?? 'idle'];
}

export const TRIGGER_LABEL: Record<WorkflowTriggerType, string> = {
  webhook: 'Webhook',
  cron: 'Schedule',
  manual: 'Manual',
};

export const TRIGGERED_BY_LABEL: Record<TriggeredBy, string> = {
  manual: 'Run from app',
  webhook: 'Webhook',
  cron: 'Schedule',
  retry: 'Re-run',
};

export type WorkflowFilter = 'all' | 'active' | 'inactive' | 'failed' | 'success';
export type WorkflowSort = 'lastRun' | 'name' | 'status';

const STATUS_RANK: Record<RunStatusKey, number> = { running: 0, error: 1, success: 2, idle: 3 };

export function filterWorkflows(
  workflows: readonly WorkflowSummary[],
  query: string,
  filter: WorkflowFilter,
): WorkflowSummary[] {
  const q = query.trim().toLowerCase();
  return workflows.filter((workflow) => {
    if (
      q &&
      !workflow.name.toLowerCase().includes(q) &&
      !workflow.tags.some((tag) => tag.toLowerCase().includes(q))
    )
      return false;
    if (filter === 'active') return workflow.active;
    if (filter === 'inactive') return !workflow.active;
    if (filter === 'failed') return workflow.lastRunStatus === 'error';
    if (filter === 'success') return workflow.lastRunStatus === 'success';
    return true;
  });
}

function runTime(iso: string | null): number {
  if (!iso) return -1;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : -1;
}

export function sortWorkflows(
  workflows: readonly WorkflowSummary[],
  sort: WorkflowSort,
): WorkflowSummary[] {
  return [...workflows].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'status') {
      const rank = STATUS_RANK[a.lastRunStatus ?? 'idle'] - STATUS_RANK[b.lastRunStatus ?? 'idle'];
      if (rank !== 0) return rank;
    }
    return runTime(b.lastRunAt) - runTime(a.lastRunAt);
  });
}

/**
 * Whether the app can start this workflow. Only a webhook trigger can be fired from here,
 * and n8n serves a workflow's production webhook only while it is active.
 */
export function runBlockedReason(
  workflow: Pick<WorkflowSummary, 'triggerType' | 'active'>,
): string | null {
  if (workflow.triggerType === 'cron')
    return 'This workflow runs on its own schedule. It can’t be started from the app.';
  if (workflow.triggerType === 'manual')
    return 'No webhook or schedule trigger — start it from n8n’s own editor.';
  if (!workflow.active) return 'Activate it first — n8n only answers an active workflow’s webhook.';
  return null;
}

/** A run the user started from the app, waiting for n8n to report the execution. */
export interface PendingRun {
  startedAt: string;
  triggeredBy: TriggeredBy;
  /**
   * Executions already listed when the run was started. None of them can be this run, even
   * one that began inside the clock-skew window just before the tap (a schedule firing, or
   * the previous run from this screen).
   */
  seenIds?: readonly string[];
}

/** Tolerates a phone clock a little ahead of the server's. */
const CLOCK_SKEW_MS = 15_000;
/** Stop waiting for n8n after this long; the history list still shows the outcome. */
export const RUN_WATCH_MS = 3 * 60_000;

export interface ResolvedRun {
  status: ExecutionStatus;
  executionId: string | null;
  finishedAt: string | null;
}

/**
 * Finds the execution a run started from the app turned into. The run endpoint returns no
 * execution id (a webhook's HTTP response carries none), so the newest execution that
 * started at or after the tap is taken to be it; until one appears the run is "running".
 */
export function resolvePendingRun(
  run: PendingRun,
  executions: readonly ExecutionSummary[],
): ResolvedRun {
  const since = Date.parse(run.startedAt) - CLOCK_SKEW_MS;
  const seen = new Set(run.seenIds ?? []);
  const match = executions
    .filter((execution) => !seen.has(execution.id) && Date.parse(execution.startedAt) >= since)
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0];
  if (!match) return { status: 'running', executionId: null, finishedAt: null };
  return { status: match.status, executionId: match.id, finishedAt: match.finishedAt };
}

export function isTerminal(status: ExecutionStatus): boolean {
  return status === 'success' || status === 'error';
}

/** When the screen stops waiting for a run it started (epoch ms). */
export function watchDeadline(run: PendingRun): number {
  return Date.parse(run.startedAt) + RUN_WATCH_MS;
}

/** One editable environment-variable row on the Configure tab. */
export interface EnvVarDraft {
  /** Stable React key — keys can be edited, so they can't identify a row. */
  id: string;
  key: string;
  secret: boolean;
  value: string;
  /** Typed into this session — an untouched secret is never re-sent. */
  touched: boolean;
  hasValue: boolean;
  /** Stored as a secret — its value is unknown here even if the switch is turned off. */
  wasSecret: boolean;
}

export function toEnvVarDrafts(envVars: readonly WorkflowEnvVar[]): EnvVarDraft[] {
  return envVars.map((envVar, index) => ({
    id: `${index}:${envVar.key}`,
    key: envVar.key,
    secret: envVar.secret,
    value: envVar.secret ? '' : (envVar.value ?? ''),
    touched: false,
    hasValue: envVar.hasValue,
    wasSecret: envVar.secret,
  }));
}

/**
 * A stored secret the user didn't retype keeps its value: the field can't show it, so an
 * empty field means "as is". That holds even if the secret switch was turned off.
 */
function keepsStoredSecret(draft: EnvVarDraft): boolean {
  if (!draft.wasSecret && !draft.secret) return false;
  return !draft.touched || (draft.hasValue && draft.value === '');
}

/**
 * The PATCH body for a saved Configure form. Blank keys are dropped; a secret the user
 * didn't retype omits `value` so the server keeps what it has (secrets never round-trip).
 */
export function buildConfigPayload(
  notes: string,
  drafts: readonly EnvVarDraft[],
): UpdateWorkflowConfigInput {
  return {
    notes,
    envVars: drafts
      .filter((draft) => draft.key.trim())
      .map((draft) => ({
        key: draft.key.trim(),
        secret: draft.secret,
        ...(keepsStoredSecret(draft) ? {} : { value: draft.value }),
      })),
  };
}

/** Keys that appear more than once — the server would keep only one of them. */
export function duplicateEnvKeys(drafts: readonly EnvVarDraft[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const draft of drafts) {
    const key = draft.key.trim();
    if (!key) continue;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return [...duplicates];
}
