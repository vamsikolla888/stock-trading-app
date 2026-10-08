import { apiClient } from '@/services/api/client';
import { requireFields } from '@/services/api/contract';

import {
  normalizeBacktest,
  normalizeDecisions,
  normalizeOverview,
  normalizeRunNow,
  normalizeStatus,
  normalizeTestScan,
  normalizeTrades,
  rawRun,
} from './lib/normalize';
import type {
  BacktestDays,
  BacktestUnderlying,
  BotNumbers,
  BotStatus,
  DecisionOutcome,
  IndexBacktest,
  IndexDecisions,
  IndexOverview,
  IndexTrades,
  ModeFilter,
  RangeKey,
  RunNowResult,
  RunView,
} from './types';

// Endpoints (all admin-only, requireAdmin):
//   server/src/modules/agents/agents.routes.ts — /agents/index-trading/{overview,trades,decisions,backtest}
//   server/src/modules/ai-autotrade/ai-autotrade.routes.ts — /ai-autotrade/*
// Specs: server/src/docs/specs/{agents,ai-autotrade}.routes.yaml. A server without these routes
// answers 404 "No route matches", which the client turns into SERVER_OUTDATED.

const WHAT = 'The index bot';
/** A cold overview reads up to 5,000 entries and 20,000 scans. */
const READ_TIMEOUT_MS = 30_000;
/** A cold backtest makes dozens of Groww history reads, three at a time. */
const BACKTEST_TIMEOUT_MS = 120_000;

/** The object a payload must be, with the fields every screen reads — or SERVER_OUTDATED. */
function shaped(data: unknown, fields: string[]): Record<string, unknown> {
  const record = (typeof data === 'object' && data !== null ? data : null) as Record<
    string,
    unknown
  > | null;
  return requireFields(record ?? {}, fields, WHAT);
}

const intentPath = (intentId: string) =>
  `/ai-autotrade/intents/${encodeURIComponent(intentId)}/resolve`;

export const indexBotApi = {
  async overview(mode: ModeFilter, range: RangeKey, signal?: AbortSignal): Promise<IndexOverview> {
    const { data } = await apiClient.get<unknown>('/agents/index-trading/overview', {
      params: { mode, range },
      timeout: READ_TIMEOUT_MS,
      signal,
    });
    return normalizeOverview(shaped(data, ['stats', 'funnel', 'settings']));
  },

  async trades(mode: ModeFilter, range: RangeKey, signal?: AbortSignal): Promise<IndexTrades> {
    const { data } = await apiClient.get<unknown>('/agents/index-trading/trades', {
      params: { mode, range },
      timeout: READ_TIMEOUT_MS,
      signal,
    });
    return normalizeTrades(shaped(data, ['rows', 'stats']));
  },

  /** One page, newest first; `before` is the previous page's `nextBefore`. */
  async decisions(
    input: { range: RangeKey; outcome: DecisionOutcome; hideClosed: boolean; before?: string },
    signal?: AbortSignal,
  ): Promise<IndexDecisions> {
    const { data } = await apiClient.get<unknown>('/agents/index-trading/decisions', {
      params: {
        range: input.range,
        outcome: input.outcome,
        // Strict 'true' / 'false' on the server, never a coerced boolean.
        hideClosed: input.hideClosed ? 'true' : 'false',
        limit: 50,
        ...(input.before ? { before: input.before } : {}),
      },
      timeout: READ_TIMEOUT_MS,
      signal,
    });
    return normalizeDecisions(shaped(data, ['runs', 'counts']));
  },

  /**
   * Replays the entry and risk rules on Groww's history (needs the admin's Groww session). A cold
   * run reads expiries, contracts and candles for every setup — it can take a minute; the server
   * caches an answer for 15 minutes.
   */
  async backtest(
    underlying: BacktestUnderlying,
    days: BacktestDays,
    signal?: AbortSignal,
  ): Promise<IndexBacktest> {
    const { data } = await apiClient.get<unknown>('/agents/index-trading/backtest', {
      params: { underlying, days },
      timeout: BACKTEST_TIMEOUT_MS,
      signal,
    });
    return normalizeBacktest(shaped(data, ['summary', 'curve', 'trades']), { underlying, days });
  },

  async status(signal?: AbortSignal): Promise<BotStatus> {
    const { data } = await apiClient.get<unknown>('/ai-autotrade/status', { signal });
    return normalizeStatus(shaped(data, ['settings', 'readiness', 'testResults']));
  },

  /** One scan with its trace — used to follow a test scan and to open any scan. */
  async run(runId: string, signal?: AbortSignal): Promise<RunView> {
    const { data } = await apiClient.get<unknown>(
      `/ai-autotrade/runs/${encodeURIComponent(runId)}`,
      { signal },
    );
    const run = rawRun(data);
    if (!run) throw new Error('The server’s answer did not describe a scan.');
    return run;
  },

  /** Arms or disarms and saves every cap. `mode` is never sent: live is a deployment. */
  async saveSettings(body: { enabled: boolean } & BotNumbers): Promise<void> {
    await apiClient.put<unknown>('/ai-autotrade/settings', body);
  },

  /** Stops new entries; open bot positions stay monitored. */
  async kill(): Promise<void> {
    await apiClient.post<unknown>('/ai-autotrade/kill', {});
  },

  /** A real scan now (the bot must be armed); 200 ALREADY_RUNNING when the slot was taken. */
  async runNow(): Promise<RunNowResult> {
    const { data } = await apiClient.post<unknown>('/ai-autotrade/run', {});
    return normalizeRunNow(data);
  },

  /** The whole pipeline now, market hours ignored — never an order. Returns the run to follow. */
  async testScan(): Promise<string | null> {
    const { data } = await apiClient.post<unknown>('/ai-autotrade/test-scan', {});
    return normalizeTestScan(data);
  },

  /** The one way into real Groww orders: the server checks the typed phrase itself. */
  async deployLive(confirm: string): Promise<void> {
    await apiClient.post<unknown>('/ai-autotrade/deploy-live', { confirm });
  },

  /** Back to the paper F&O book — always allowed; open live positions stay OCO-protected. */
  async testMode(): Promise<void> {
    await apiClient.post<unknown>('/ai-autotrade/test-mode', {});
  },

  /** Marks an uncertain entry resolved once a person has checked the book. */
  async resolve(intentId: string): Promise<string | null> {
    const { data } = await apiClient.post<unknown>(intentPath(intentId), {});
    const note = (data as { note?: unknown } | null)?.note;
    return typeof note === 'string' && note.trim() ? note.trim() : null;
  },
};
