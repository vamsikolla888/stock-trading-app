import type { WorkflowsSummary } from '@/features/automations/types';
import type { StatusTone } from '@/features/settings/lib/status';
import type { BrokerConnectionSummary } from '@/features/trading/types';

import type { LivenessResult, OpsProbe, ReadyChecks, ServiceSessionStatus } from '../types';
import { formatUptime } from './format';

export interface OverviewService {
  name: string;
  tone: StatusTone;
  detail: string;
}

export interface OverviewInputs {
  liveness: OpsProbe<LivenessResult> | undefined;
  readiness: OpsProbe<ReadyChecks> | undefined;
  workflows: WorkflowsSummary | undefined;
  /** Undefined while loading; the lookup result (possibly undefined) once known. */
  mstock: { loaded: boolean; connection: BrokerConnectionSummary | undefined };
  recService: ServiceSessionStatus | undefined;
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
 * The admin overview's live service list, from what the server will actually say about
 * itself (ported from the web's useLiveServices): liveness, readiness checks and circuit
 * breakers, the workflow summary, the viewer's mStock session and the recommendation
 * engine's service session. Nothing here is estimated — an unknown is shown as unknown.
 */
export function buildOverviewServices(inputs: OverviewInputs): OverviewService[] {
  const { liveness, readiness, workflows, mstock, recService, formatTime } = inputs;
  const checks = readiness?.data?.checks ?? {};
  const breakers = readiness?.data?.breakers ?? {};
  const breakerCount = Object.keys(breakers).length;
  const openBreakers = Object.values(breakers).filter((value) => {
    const state = breakerState(value);
    return state !== null && state !== 'closed';
  }).length;
  const uptime = liveness?.data?.uptimeSeconds;

  const dependency = (key: string, okText: string, badText: string): OverviewService => {
    const value = checks[key];
    return {
      name: key === 'mongo' ? 'MongoDB' : key === 'redis' ? 'Redis' : key,
      tone: value === true ? 'ok' : value === false ? 'bad' : 'neutral',
      detail: value === undefined ? 'Unknown' : value ? okText : badText,
    };
  };

  const connection = mstock.connection;

  return [
    {
      name: 'API',
      tone: liveness === undefined ? 'neutral' : liveness.ok ? 'ok' : 'bad',
      detail:
        liveness === undefined
          ? 'Checking…'
          : typeof uptime === 'number'
            ? `Up ${formatUptime(uptime)}`
            : 'Unreachable',
    },
    dependency('mongo', 'Connected', 'Not connected'),
    dependency('redis', 'Ping ok', 'Ping failed'),
    {
      name: 'n8n automations',
      tone: workflows === undefined ? 'neutral' : workflows.failedLast24h > 0 ? 'bad' : 'ok',
      detail:
        workflows === undefined
          ? 'Unreachable'
          : `${workflows.failedLast24h} failed in 24h · ${workflows.active} active`,
    },
    {
      name: 'mStock (your session)',
      tone: !mstock.loaded
        ? 'neutral'
        : connection?.status === 'connected'
          ? 'ok'
          : connection
            ? 'warn'
            : 'neutral',
      detail: !mstock.loaded
        ? 'Checking…'
        : connection
          ? connection.status.replace(/_/g, ' ')
          : 'Not connected',
    },
    {
      name: 'mStock (engine account)',
      tone: recService === undefined ? 'neutral' : recService.connected ? 'ok' : 'bad',
      detail:
        recService === undefined
          ? 'Unknown'
          : recService.connected
            ? recService.lastRefreshedAt
              ? `Refreshed ${formatTime(recService.lastRefreshedAt)}`
              : 'Connected'
            : (recService.lastError ?? 'Not connected'),
    },
    {
      name: 'Circuit breakers',
      tone: readiness?.data ? (openBreakers > 0 ? 'bad' : 'ok') : 'neutral',
      detail: !readiness?.data
        ? 'Unknown'
        : breakerCount === 0
          ? 'All closed'
          : openBreakers > 0
            ? `${openBreakers} open of ${breakerCount}`
            : `All ${breakerCount} closed`,
    },
  ];
}

/** Counts for the overview banner. */
export function overviewTally(services: readonly OverviewService[]): {
  bad: number;
  warn: number;
  unknown: number;
} {
  return {
    bad: services.filter((service) => service.tone === 'bad').length,
    warn: services.filter((service) => service.tone === 'warn').length,
    unknown: services.filter((service) => service.tone === 'neutral').length,
  };
}
