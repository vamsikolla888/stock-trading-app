import type { WorkflowsSummary } from '@/features/automations/types';
import type { StatusTone } from '@/features/settings/lib/status';
import type { BrokerConnectionSummary } from '@/features/trading/types';

import type { ServiceSessionStatus } from '../types';

export interface SourceRow {
  name: string;
  feeds: string;
  updated: string | null;
  scope: string;
  tone: StatusTone;
  label: string;
}

const BROKER_NAME: Record<string, string> = { mstock: 'mStock', groww: 'Groww' };
const BROKER_FEEDS: Record<string, string> = {
  mstock: 'Quotes, holdings, live ticks',
  groww: 'F&O chain, live feed, holdings',
};

/**
 * Where the platform's market data and news come from, each row read live (web: Data sources):
 * the engine's shared mStock account, every broker session of the viewer's own (mStock and
 * Groww), and the n8n news feeds. Nothing is a fixture — a status row that never changes reads
 * as a green light.
 */
export function dataSourceRows(input: {
  recService: ServiceSessionStatus | undefined;
  connections: readonly BrokerConnectionSummary[] | undefined;
  /** Undefined while loading; null when n8n could not be read. */
  workflows: WorkflowsSummary | null | undefined;
}): SourceRow[] {
  const { recService, connections, workflows } = input;
  return [
    {
      name: 'mStock · service account',
      feeds: 'Snapshots, candles, recommendation market data',
      updated: recService?.lastRefreshedAt ?? null,
      scope: 'Shared',
      tone: recService === undefined ? 'neutral' : recService.connected ? 'ok' : 'bad',
      label: recService === undefined ? 'Checking' : recService.connected ? 'Live' : 'Down',
    },
    ...(connections ?? []).map<SourceRow>((connection) => ({
      name: `${BROKER_NAME[connection.broker] ?? connection.broker} · your session`,
      feeds: BROKER_FEEDS[connection.broker] ?? 'Market data and orders',
      updated: connection.connectedAt,
      scope: 'You',
      tone:
        connection.status === 'connected' ? 'ok' : connection.status === 'error' ? 'bad' : 'warn',
      label: connection.status.replace(/_/g, ' '),
    })),
    {
      name: 'News RSS via n8n',
      feeds: 'Articles for sentiment scoring',
      updated: workflows?.lastSuccessAt ?? null,
      scope: workflows ? `${workflows.total} workflows` : '—',
      tone:
        workflows === undefined
          ? 'neutral'
          : workflows === null
            ? 'warn'
            : workflows.failedLast24h > 0
              ? 'bad'
              : 'ok',
      label:
        workflows === undefined
          ? 'Checking'
          : workflows === null
            ? 'Unreachable'
            : workflows.failedLast24h > 0
              ? `${workflows.failedLast24h} failed`
              : 'Live',
    },
  ];
}
