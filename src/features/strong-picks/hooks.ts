import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { livePriceInterval } from '@/lib/utils/market';

import { strongPicksApi } from './api';

export const strongPickKeys = {
  // Same key as insights' useStrongPicks, so the two share one cached fetch of today.
  today: ['insights', 'strong-picks'] as const,
  date: (date: string) => ['insights', 'strong-picks', date] as const,
  analytics: (days: number) => ['strong-picks', 'analytics', days] as const,
};

/**
 * Today's strong picks, or a past day's. The picks are fixed at 09:30 but their monitor moves
 * all session, so today's view refreshes each minute while the market is open. An earlier day's
 * picks keep settling across their horizon (an equity swing runs ten sessions), so it is cached
 * for minutes, not forever.
 */
export function useStrongPicksFor(date: string | null, options: { poll?: boolean } = {}) {
  const poll = options.poll ?? true;
  return useQuery({
    queryKey: date ? strongPickKeys.date(date) : strongPickKeys.today,
    queryFn: ({ signal }) => strongPicksApi.get(date ?? undefined, signal),
    staleTime: date ? 5 * 60_000 : 30_000,
    placeholderData: date ? keepPreviousData : undefined,
    refetchInterval: (query) =>
      !poll || date || query.state.data?.marketOpen === false ? false : livePriceInterval(60_000),
  });
}

/**
 * The track record over 7/30/90 days. It moves only as picks settle, so it refreshes every two
 * minutes while the market is open (`live`) and not at all otherwise.
 */
export function useStrongPickAnalytics(
  days: number,
  options: { enabled?: boolean; live?: boolean } = {},
) {
  return useQuery({
    queryKey: strongPickKeys.analytics(days),
    queryFn: ({ signal }) => strongPicksApi.analytics(days, signal),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    refetchInterval: options.live ? livePriceInterval(120_000) : false,
  });
}

function useInvalidateStrongPicks() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: strongPickKeys.today }),
      queryClient.invalidateQueries({ queryKey: ['strong-picks'] }),
    ]);
}

/** Samples every published pick's price now; the views refresh with what it found. */
export function useSweepStrongPickMonitor() {
  const invalidate = useInvalidateStrongPicks();
  return useMutation({
    mutationFn: strongPicksApi.sweep,
    onSuccess: () => void invalidate(),
  });
}

/**
 * Admin: queue the 09:30 review again. It runs on the worker, so the list is refetched once it
 * has had time to finish (the web waits the same 20 seconds).
 */
export function useGenerateStrongPicks() {
  const invalidate = useInvalidateStrongPicks();
  return useMutation({
    mutationFn: strongPicksApi.generate,
    onSuccess: () => {
      setTimeout(() => void invalidate(), 20_000);
    },
  });
}
