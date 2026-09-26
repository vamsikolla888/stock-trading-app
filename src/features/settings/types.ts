// Mirrored from the web client: features/notifications/services/push-notification.service.ts
// and features/broker/services/broker.service.ts (market-data provider, Groww token). The
// broker connection types themselves live in features/trading/types.

import type { BrokerConnectionStatus } from '@/features/trading/types';

/** GET /notifications/devices — push devices registered for this account (web browsers today). */
export interface PushDevicesResponse {
  configured: boolean;
  devices: { id: string; userAgent: string | null; createdAt: string; updatedAt: string }[];
}

/** POST /notifications/test */
export interface PushTestResult {
  deliveredTo: number;
  failed: number;
}

export type MarketDataProvider = 'mstock' | 'groww';

/** GET/PUT /brokers/market-data-provider — which broker prices the shared market views. */
export interface MarketDataProviderSettings {
  provider: MarketDataProvider;
  updatedAt: string | null;
  updatedBy: string | null;
  options: { id: MarketDataProvider; label: string }[];
}

export interface SetMarketDataProviderResult extends MarketDataProviderSettings {
  probe: { symbol: string; ltp: number | null };
}

export type TokenRefreshTrigger = 'schedule' | 'admin' | 'user';
export type TokenRefreshOutcome = 'refreshed' | 'skipped' | 'failed';

export interface TokenRefreshRun {
  id: string;
  trigger: TokenRefreshTrigger;
  startedAt: string;
  finishedAt: string | null;
  results: {
    userId: string;
    accountLabel: string | null;
    outcome: TokenRefreshOutcome;
    detail: string | null;
    expiresAt: string | null;
  }[];
  summary: { refreshed: number; skipped: number; failed: number };
}

/** GET /brokers/groww/token — the daily token and the job that keeps it fresh. */
export interface GrowwTokenStatus {
  connected: boolean;
  autoRefresh: boolean;
  status: BrokerConnectionStatus | null;
  accountLabel: string | null;
  mintedAt: string | null;
  expiresAt: string | null;
  lastAttemptAt: string | null;
  lastError: string | null;
  valid: boolean;
  schedule: { pattern: string; timezone: string; description: string; nextRunAt: string | null };
  runs: TokenRefreshRun[];
}
