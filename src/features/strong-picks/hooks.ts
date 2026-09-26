import { useQuery } from '@tanstack/react-query';

import { livePriceInterval } from '@/lib/utils/market';

import { strongPicksApi } from './api';

export const strongPickKeys = {
  // Same key as insights' useStrongPicks, so the two share one cached fetch of today.
  today: ['insights', 'strong-picks'] as const,
  date: (date: string) => ['insights', 'strong-picks', date] as const,
};

/**
 * Today's strong picks, or a past day's. The picks are fixed at 09:30 but their monitor
 * moves all session, so today's view refreshes each minute while the market is open; a
 * past day never changes.
 */
export function useStrongPicksFor(date: string | null, options: { poll?: boolean } = {}) {
  const poll = options.poll ?? true;
  return useQuery({
    queryKey: date ? strongPickKeys.date(date) : strongPickKeys.today,
    queryFn: ({ signal }) => strongPicksApi.get(date ?? undefined, signal),
    staleTime: date ? 30 * 60_000 : 30_000,
    refetchInterval: (query) =>
      !poll || date || query.state.data?.marketOpen === false ? false : livePriceInterval(60_000),
  });
}
