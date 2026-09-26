import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { livePriceInterval } from '@/lib/utils/market';

import { heatmapApi } from './api';
import type { HeatmapProvider, HeatmapTimeframe } from './types';

export const heatmapKeys = {
  all: ['market-heatmap'] as const,
  indices: () => [...heatmapKeys.all, 'indices'] as const,
  heatmap: (indexKey: string, timeframe: HeatmapTimeframe, provider: HeatmapProvider) =>
    [...heatmapKeys.all, indexKey, timeframe, provider] as const,
};

/** The index catalogue changes only when an admin re-imports memberships. */
export function useHeatmapIndices() {
  return useQuery({
    queryKey: heatmapKeys.indices(),
    queryFn: heatmapApi.indices,
    staleTime: 30 * 60_000,
  });
}

/**
 * One index's tiles. The server caches each view for 8 s, so polling every 15 s while the
 * market is open stays well inside its 120/min limit; a closed market is fetched once.
 * The previous view stays up (dimmed by the screen) while another index or window loads.
 */
export function useMarketHeatmap(
  indexKey: string,
  timeframe: HeatmapTimeframe,
  provider: HeatmapProvider,
) {
  return useQuery({
    queryKey: heatmapKeys.heatmap(indexKey, timeframe, provider),
    queryFn: ({ signal }) => heatmapApi.heatmap(indexKey, timeframe, provider, signal),
    enabled: indexKey.length > 0,
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(15_000),
    placeholderData: keepPreviousData,
  });
}
