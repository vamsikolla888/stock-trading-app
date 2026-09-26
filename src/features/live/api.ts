import { useQueries, useQuery } from '@tanstack/react-query';

import { marketApi } from '@/features/market/api';
import { marketKeys } from '@/features/market/hooks';
import { livePriceInterval } from '@/lib/utils/market';
import { apiClient } from '@/services/api/client';

import type { AutoTradeActivity, AutoTradeConfigResponse } from './types';

export const liveApi = {
  async autoTradeConfig(): Promise<AutoTradeConfigResponse> {
    const { data } = await apiClient.get<AutoTradeConfigResponse>('/paper/autotrade/config');
    return data;
  },
  async activity(limit = 100): Promise<AutoTradeActivity> {
    const { data } = await apiClient.get<AutoTradeActivity>('/paper/autotrade/activity', {
      params: { limit },
    });
    return data;
  },
};

/** Keys match the web client's (and the alerts bell's), so every reader shares one cache. */
export const liveKeys = {
  config: ['paper', 'autotrade', 'config'] as const,
  activity: (limit: number) => ['paper', 'autotrade', 'activity', limit] as const,
};

/**
 * The auto-trade config. Failure-tolerant by design: a viewer without a paper account gets
 * an error here, and every caller treats "no data" as "not deployed" rather than failing.
 */
export function useAutoTradeConfig(enabled = true) {
  return useQuery({
    queryKey: liveKeys.config,
    queryFn: liveApi.autoTradeConfig,
    staleTime: 60_000,
    retry: false,
    enabled,
  });
}

export function useAutoTradeActivity(limit = 100, active = true) {
  return useQuery({
    queryKey: liveKeys.activity(limit),
    queryFn: () => liveApi.activity(limit),
    staleTime: 15_000,
    enabled: active,
    // The web polls every 30s; here only while the market is open and the screen is shown.
    refetchInterval: () => (active ? livePriceInterval(30_000) : false),
  });
}

/**
 * Day quotes for held positions, one stock-detail read per holding (works without a
 * broker, unlike /market/quotes). Shares the stock screen's cache entries.
 */
export function useHoldingQuotes(
  holdings: readonly { exchange: string; symbol: string }[],
  active: boolean,
) {
  return useQueries({
    queries: holdings.map((holding) => ({
      queryKey: marketKeys.stock(holding.exchange, holding.symbol),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        marketApi.stock(holding.symbol, holding.exchange, signal),
      enabled: active,
      staleTime: 30_000,
      refetchInterval: () => (active ? livePriceInterval(60_000) : false),
    })),
  });
}
