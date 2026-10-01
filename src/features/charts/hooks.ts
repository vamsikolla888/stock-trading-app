import { useInfiniteQuery } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useMemo } from 'react';

import { fnoApi } from '@/features/fno/api';
import { FNO_CHART_INTERVAL, toCandles } from '@/features/fno/lib/underlying';
import type { ChartTarget, FnoExchange } from '@/features/fno/types';
import { marketApi } from '@/features/market/api';

import { intervalSpec, type ChartInterval } from './lib/config';
import { mergeHistory } from './lib/history';

export const chartKeys = {
  all: ['charts'] as const,
  history: (exchange: string, symbol: string, interval: ChartInterval) =>
    [...chartKeys.all, 'history', exchange, symbol, interval] as const,
  fnoHistory: (exchange: string, subject: string, target: ChartTarget, interval: ChartInterval) =>
    [...chartKeys.all, 'fno-history', exchange, subject, target, interval] as const,
};

/**
 * A chart's history, newest page first; `fetchNextPage` reaches further back (`to` = just before
 * the oldest bar held). A page shorter than asked for means the start of the listing's history.
 *
 * Never refetched on a timer: the live feed keeps the forming bar current, and refetching an
 * infinite query re-requests every page against a 30/min limit. Re-opened later, it reloads.
 */
export function useChartHistory(
  symbol: string,
  exchange: string,
  interval: ChartInterval,
  enabled = true,
) {
  const focused = useIsFocused();
  const spec = intervalSpec(interval);
  const query = useInfiniteQuery({
    queryKey: chartKeys.history(exchange, symbol, interval),
    queryFn: ({ pageParam, signal }) =>
      marketApi.candles(
        {
          exchange,
          symbol,
          minutesPerBar: spec.minutesPerBar,
          count: spec.count,
          ...(pageParam ? { to: pageParam } : {}),
        },
        signal,
      ),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => {
      if (lastPage.length < spec.count * 0.8) return undefined;
      const oldest = lastPage[0];
      return oldest ? oldest.time - 1 : undefined;
    },
    enabled: enabled && symbol.length > 0,
    staleTime: spec.intraday ? 60_000 : 10 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    subscribed: focused,
  });
  const bars = useMemo(() => mergeHistory(query.data?.pages ?? []), [query.data]);
  return { ...query, bars, spec };
}

/**
 * An F&O chart's history — an underlying (index or F&O stock) charted through `anchor`, or a
 * contract itself — from the F&O candles API. That API takes a time window capped per interval,
 * so each page is one window and `fetchNextPage` steps the window back; an empty window means
 * the start of the history. Keyed by the underlying for an underlying chart, so the anchor can
 * change without a reload. Never refetched on a timer, for the same reason as above.
 */
export function useFnoChartHistory(
  exchange: FnoExchange,
  anchor: string,
  subject: string,
  target: ChartTarget,
  interval: ChartInterval,
  enabled = true,
) {
  const focused = useIsFocused();
  const spec = intervalSpec(interval);
  const { interval: fnoInterval, pageDays } = FNO_CHART_INTERVAL[interval];
  const query = useInfiniteQuery({
    queryKey: chartKeys.fnoHistory(exchange, subject, target, interval),
    queryFn: async ({ pageParam, signal }) => {
      const to = pageParam ?? Math.floor(Date.now() / 1000);
      const from = to - pageDays * 86_400;
      const result = await fnoApi.candles(
        exchange,
        anchor,
        { target, interval: fnoInterval, from, to },
        signal,
      );
      return { ...result, from };
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => (lastPage.candles.length > 0 ? lastPage.from - 1 : undefined),
    enabled: enabled && anchor.length > 0,
    staleTime: spec.intraday ? 60_000 : 10 * 60_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    subscribed: focused,
  });
  const bars = useMemo(
    () => toCandles((query.data?.pages ?? []).map((page) => page.candles)),
    [query.data],
  );
  const unavailableReason =
    bars.length === 0 ? (query.data?.pages[0]?.unavailableReason ?? null) : null;
  return { ...query, bars, spec, unavailableReason };
}
