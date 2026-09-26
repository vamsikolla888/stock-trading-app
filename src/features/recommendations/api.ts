import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { insightKeys } from '@/features/insights/api';
import type { Recommendation } from '@/features/insights/types';
import { marketApi } from '@/features/market/api';
import { marketKeys } from '@/features/market/hooks';
import { livePriceInterval } from '@/lib/utils/market';
import { apiClient } from '@/services/api/client';

// Mirrored from the web client: features/recommendations/services/recommendations.service.ts.
// Today's picks (/recommendations/today) come from features/insights (useTodayPicks), which
// the Home screen and the alerts bell share.

export interface RecommendationHistoryDay {
  date: string;
  count: number;
}

/** GET /recommendations?date= */
export interface RecommendationsByDateResponse {
  date: string;
  recommendations: Recommendation[];
  reason: string | null;
}

export interface GenerateJobResult {
  enqueued: boolean;
  jobId: string;
  date: string;
}

export const recommendationsApi = {
  async history(days = 7): Promise<RecommendationHistoryDay[]> {
    const { data } = await apiClient.get<{ days: RecommendationHistoryDay[] }>(
      '/recommendations/history',
      { params: { days } },
    );
    return data.days;
  },
  async byDate(date: string): Promise<RecommendationsByDateResponse> {
    const { data } = await apiClient.get<RecommendationsByDateResponse>('/recommendations', {
      params: { date },
    });
    return data;
  },
  /** Admin only: queues the full-universe pre-market scan (normally 08:15 IST). */
  async generatePreMarket(): Promise<GenerateJobResult> {
    const { data } = await apiClient.post<GenerateJobResult>(
      '/recommendations/pre-market/generate',
    );
    return data;
  },
};

export const recommendationKeys = {
  history: (days: number) => ['recommendations', 'history', days] as const,
  byDate: (date: string | null) => ['recommendations', 'by-date', date] as const,
};

export function useRecommendationHistory(days = 7) {
  return useQuery({
    queryKey: recommendationKeys.history(days),
    queryFn: () => recommendationsApi.history(days),
    staleTime: 5 * 60_000,
  });
}

/** One cache entry per date; a past day never changes, so it is kept for the session. */
export function useRecommendationsByDate(date: string | null) {
  return useQuery({
    queryKey: recommendationKeys.byDate(date),
    queryFn: () => recommendationsApi.byDate(date!),
    enabled: date !== null,
    staleTime: 30 * 60_000,
  });
}

/**
 * The run is ENQUEUED, not finished — refreshing now usually still shows the old picks, but
 * it keeps the screen from looking frozen once the short run lands.
 */
export function useGeneratePreMarket() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recommendationsApi.generatePreMarket,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: insightKeys.today });
      void queryClient.invalidateQueries({ queryKey: ['recommendations', 'history'] });
    },
  });
}

/**
 * A pick's current price and day move from the stock snapshot (no broker needed). Shares
 * the stock screen's cache entry; refreshed once a minute while the market is open.
 */
export function usePickQuote(symbol: string, exchange: string) {
  return useQuery({
    queryKey: marketKeys.stock(exchange, symbol),
    queryFn: ({ signal }) => marketApi.stock(symbol, exchange, signal),
    staleTime: 30_000,
    refetchInterval: () => livePriceInterval(60_000),
    retry: 1,
  });
}
