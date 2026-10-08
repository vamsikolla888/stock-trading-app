import type { StatusTone } from '@/features/settings/lib/status';

import type { ServiceHealthRow } from '../types';

/**
 * How the dependency probes (GET /admin/observability/health) are named and read — shared by the
 * console overview and Service health so the two can never describe a service differently.
 */

const NAMES: Record<string, string> = {
  mongo: 'MongoDB',
  redis: 'Redis',
  mstock: 'mStock API',
  'quant-service': 'Quant service',
  searxng: 'Web search',
  worker: 'Worker',
  'screener-worker': 'Screener worker',
};

/** What each probe is, in a few words — a bare "mstock" doesn't say what a red row means. */
const DESCRIPTIONS: Record<string, string> = {
  mongo: 'Primary datastore · admin ping',
  redis: 'Cache, queues, pub/sub · PING',
  mstock: 'Broker REST · from circuit breakers',
  'quant-service': 'Python backtester · /api/v1/health/live',
  searxng: 'Web search (stock news) · /healthz',
  worker: 'Jobs process · Redis heartbeat',
  'screener-worker': 'Screener process · Redis heartbeat',
};

export function serviceName(key: string): string {
  return NAMES[key] ?? key;
}

export function serviceDescription(key: string): string | null {
  return DESCRIPTIONS[key] ?? null;
}

/** Up, down, or unknown — and unknown is grey, never green: an unmeasured dependency must not look healthy. */
export function serviceState(row: ServiceHealthRow): { tone: StatusTone; label: string } {
  if (row.checks === 0 && (row.detail ?? '').includes('no checks')) {
    return { tone: 'neutral', label: 'Unknown' };
  }
  return row.ok ? { tone: 'ok', label: 'Up' } : { tone: 'bad', label: 'Down' };
}

export interface HealthSummary {
  /** Services answering right now — an unsampled one is not counted as up. */
  up: number;
  total: number;
  /** The sampled service with the lowest uptime over the window, or null with no samples. */
  worst: ServiceHealthRow | null;
  failures: number;
}

/** Service health's headline numbers (web: ServiceHealthPanel). */
export function healthSummary(services: readonly ServiceHealthRow[]): HealthSummary {
  let worst: ServiceHealthRow | null = null;
  for (const row of services) {
    if (row.uptimePct == null) continue;
    if (!worst || row.uptimePct < (worst.uptimePct ?? 100)) worst = row;
  }
  return {
    up: services.filter((row) => serviceState(row).tone === 'ok').length,
    total: services.length,
    worst,
    failures: services.reduce((sum, row) => sum + row.failures, 0),
  };
}

/** The console's one-line verdict on the platform, from the checks that are failing. */
export function platformHeadline(input: {
  down: readonly string[];
  warnings: number;
  checked: boolean;
}): { tone: StatusTone; text: string } {
  if (!input.checked) return { tone: 'neutral', text: 'Checking the platform…' };
  if (input.down.length > 0) {
    const names = input.down.slice(0, 2).join(', ');
    const more = input.down.length > 2 ? ` and ${input.down.length - 2} more` : '';
    return {
      tone: 'bad',
      text: `${input.down.length} service${input.down.length === 1 ? '' : 's'} down · ${names}${more}`,
    };
  }
  if (input.warnings > 0) {
    return {
      tone: 'warn',
      text: `${input.warnings} check${input.warnings === 1 ? '' : 's'} need${input.warnings === 1 ? 's' : ''} attention`,
    };
  }
  return { tone: 'ok', text: 'All systems operational' };
}
