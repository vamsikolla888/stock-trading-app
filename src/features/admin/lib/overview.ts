import type { WorkflowsSummary } from '@/features/automations/types';
import type { StatusTone } from '@/features/settings/lib/status';
import type { BrokerConnectionSummary } from '@/features/trading/types';

import type {
  HttpPoint,
  LivenessResult,
  OpsProbe,
  ReadyChecks,
  ServiceHealthRow,
  ServiceSessionStatus,
} from '../types';
import { formatUptime } from './format';
import { serviceName, serviceState } from './services';

export interface OverviewService {
  name: string;
  tone: StatusTone;
  detail: string;
}

export interface OverviewInputs {
  liveness: OpsProbe<LivenessResult> | undefined;
  readiness: OpsProbe<ReadyChecks> | undefined;
  /** Undefined while loading; null when the list could not be read (n8n unconfigured or down). */
  workflows: WorkflowsSummary | null | undefined;
  /** The viewer's own mStock connection: `loaded` false while reading, undefined for none. */
  mstock: { loaded: boolean; connection: BrokerConnectionSummary | undefined };
  recService: ServiceSessionStatus | undefined;
  /** Services the every-minute checker already reports with history. Their point-in-time check
   *  is dropped so one dependency never appears twice with two different answers. */
  probed?: ReadonlySet<string>;
  formatTime: (iso: string) => string;
}

function breakerState(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'state' in value) {
    const state = (value as { state?: unknown }).state;
    return typeof state === 'string' ? state : null;
  }
  return null;
}

/**
 * The admin overview's live checks, from what the server will actually say about itself (web:
 * lib/overview.ts liveChecks): liveness, readiness checks and circuit breakers, the workflow
 * summary, the recommendation engine's service session and the viewer's own mStock session.
 * Unknown is never green: a check that has not answered reads "Checking…", one that cannot say
 * reads "Unknown", both grey.
 */
export function buildOverviewServices(inputs: OverviewInputs): OverviewService[] {
  const { liveness, readiness, workflows, mstock, recService, formatTime } = inputs;
  const probed = inputs.probed ?? new Set<string>();
  const ready = readiness?.data ?? null;
  const out: OverviewService[] = [];

  out.push(
    liveness === undefined
      ? { name: 'API', tone: 'neutral', detail: 'Checking…' }
      : liveness.ok && liveness.data
        ? { name: 'API', tone: 'ok', detail: `Up ${formatUptime(liveness.data.uptimeSeconds)}` }
        : { name: 'API', tone: 'bad', detail: 'Unreachable' },
  );

  for (const [key, name, okText, badText] of [
    ['mongo', 'MongoDB', 'Connected', 'Not connected'],
    ['redis', 'Redis', 'Ping ok', 'Ping failed'],
  ] as const) {
    if (probed.has(key)) continue;
    const value = ready?.checks?.[key];
    out.push(
      readiness === undefined
        ? { name, tone: 'neutral', detail: 'Checking…' }
        : value === true
          ? { name, tone: 'ok', detail: okText }
          : value === false
            ? { name, tone: 'bad', detail: badText }
            : { name, tone: 'neutral', detail: 'Unknown' },
    );
  }

  if (readiness === undefined) {
    out.push({ name: 'Circuit breakers', tone: 'neutral', detail: 'Checking…' });
  } else if (!ready) {
    out.push({ name: 'Circuit breakers', tone: 'neutral', detail: 'Unknown' });
  } else {
    const states = Object.values(ready.breakers ?? {}).map(breakerState);
    const open = states.filter((state) => state !== null && state !== 'closed').length;
    out.push(
      states.length === 0
        ? { name: 'Circuit breakers', tone: 'ok', detail: 'All closed' }
        : {
            name: 'Circuit breakers',
            tone: open > 0 ? 'bad' : 'ok',
            detail: open > 0 ? `${open} open of ${states.length}` : `All ${states.length} closed`,
          },
    );
  }

  out.push(
    workflows === undefined
      ? { name: 'n8n workflows', tone: 'neutral', detail: 'Checking…' }
      : workflows === null
        ? { name: 'n8n workflows', tone: 'warn', detail: 'Unreachable' }
        : {
            name: 'n8n workflows',
            tone: workflows.failedLast24h > 0 ? 'bad' : 'ok',
            detail: `${workflows.failedLast24h} failed in 24h · ${workflows.active} active`,
          },
  );

  out.push(
    recService === undefined
      ? { name: 'mStock · service account', tone: 'neutral', detail: 'Checking…' }
      : recService.connected
        ? {
            name: 'mStock · service account',
            tone: 'ok',
            detail: recService.lastRefreshedAt
              ? `Refreshed ${formatTime(recService.lastRefreshedAt)}`
              : 'Connected',
          }
        : {
            name: 'mStock · service account',
            tone: 'bad',
            detail: recService.lastError ?? 'Not connected',
          },
  );

  // The viewer's own session: not having one is a choice, not an outage — grey, never red.
  const connection = mstock.connection;
  out.push(
    !mstock.loaded
      ? { name: 'mStock · your session', tone: 'neutral', detail: 'Checking…' }
      : !connection
        ? { name: 'mStock · your session', tone: 'neutral', detail: 'Not connected' }
        : connection.status === 'connected'
          ? { name: 'mStock · your session', tone: 'ok', detail: 'Connected' }
          : {
              name: 'mStock · your session',
              tone: 'warn',
              detail: connection.status.replace(/_/g, ' '),
            },
  );

  return out;
}

/**
 * Checks whose failure is an OUTAGE — the API itself and its two datastores. Every other failing
 * check (an open circuit breaker, one failed workflow run, the service account's session) needs
 * attention but is not "down": calling a single failed n8n run an outage cries wolf.
 */
const OUTAGE_CHECKS: ReadonlySet<string> = new Set(['API', 'MongoDB', 'Redis']);

/** What the header verdict is built from: the probed services and outage checks that failed (by
 *  name, de-duplicated), and how many other checks want attention. */
export function verdictInputs(
  checks: readonly OverviewService[],
  services: readonly ServiceHealthRow[],
): { down: string[]; warnings: number } {
  const down = [
    ...services.filter((s) => serviceState(s).tone === 'bad').map((s) => serviceName(s.service)),
    ...checks.filter((c) => OUTAGE_CHECKS.has(c.name) && c.tone === 'bad').map((c) => c.name),
  ];
  return {
    down: [...new Set(down)],
    warnings: checks.filter(
      (c) => !OUTAGE_CHECKS.has(c.name) && (c.tone === 'bad' || c.tone === 'warn'),
    ).length,
  };
}

// ── Traffic ────────────────────────────────────────────────────────────────────────────

/** Errors as a share of requests; null with no traffic (0% would claim a record never tested). */
export function errorRate(
  totals: { requests: number; errors4xx: number; errors5xx: number } | null | undefined,
): number | null {
  if (!totals || totals.requests <= 0) return null;
  return ((totals.errors4xx + totals.errors5xx) / totals.requests) * 100;
}

/** Under 1% is normal noise; amber to 5%, red above. */
export function errorRateTone(rate: number | null): StatusTone | undefined {
  if (rate == null) return undefined;
  if (rate >= 5) return 'bad';
  if (rate >= 1) return 'warn';
  return 'ok';
}

/**
 * Requests per bucket as two stacked series: handled (2xx + 3xx) and errors (4xx + 5xx). A class
 * the rule does not know (1xx, a malformed key) still counts — into "handled" — so the stack's
 * top is always the bucket's real request count.
 */
export function trafficSplit(series: readonly HttpPoint[]): { ok: number[]; errors: number[] } {
  const ok: number[] = [];
  const errors: number[] = [];
  for (const p of series) {
    const by = p.byClass ?? {};
    const handled = (by['2xx'] ?? 0) + (by['3xx'] ?? 0);
    const failed = (by['4xx'] ?? 0) + (by['5xx'] ?? 0);
    ok.push(handled + Math.max(0, p.count - handled - failed));
    errors.push(failed);
  }
  return { ok, errors };
}
