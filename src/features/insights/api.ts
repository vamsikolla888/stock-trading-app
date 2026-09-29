import { useQuery } from '@tanstack/react-query';

import { strongPicksApi } from '@/features/strong-picks/api';
import { livePriceInterval } from '@/lib/utils/market';
import { apiClient } from '@/services/api/client';

import type {
  CurrentRecommendationsResponse,
  SignalsResponse,
  StrategySummary,
  StrongPicksResponse,
} from './types';

export const insightsApi = {
  async today(): Promise<CurrentRecommendationsResponse> {
    const { data } = await apiClient.get<CurrentRecommendationsResponse>('/recommendations/today');
    return data;
  },
  /**
   * Shares its cache entry with the Strong picks screen (same key), so it goes through the
   * same normalising read — whichever fetches first, the cached shape is the same.
   */
  async strongPicks(): Promise<StrongPicksResponse> {
    return strongPicksApi.get();
  },
  async signals(): Promise<SignalsResponse> {
    const { data } = await apiClient.get<SignalsResponse>('/signals');
    return data;
  },
  async strategies(): Promise<StrategySummary[]> {
    const { data } = await apiClient.get<{ strategies: StrategySummary[] }>('/strategies');
    return data.strategies;
  },
};

export const insightKeys = {
  today: ['insights', 'today'] as const,
  strongPicks: ['insights', 'strong-picks'] as const,
  signals: ['insights', 'signals'] as const,
  strategies: ['insights', 'strategies'] as const,
};

/** Today's picks — also feeds the bell's derived alerts, so every consumer shares this cache. */
export function useTodayPicks() {
  return useQuery({
    queryKey: insightKeys.today,
    queryFn: insightsApi.today,
    staleTime: 5 * 60_000,
  });
}

export function useStrongPicks() {
  return useQuery({
    queryKey: insightKeys.strongPicks,
    queryFn: insightsApi.strongPicks,
    staleTime: 30_000,
    refetchInterval: () => livePriceInterval(60_000),
  });
}

export function useSignals() {
  return useQuery({
    queryKey: insightKeys.signals,
    queryFn: insightsApi.signals,
    staleTime: 5 * 60_000,
  });
}

export function useStrategies() {
  return useQuery({
    queryKey: insightKeys.strategies,
    queryFn: insightsApi.strategies,
    staleTime: 5 * 60_000,
  });
}
