import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { appConfig } from '@/config/app';
import { useAppStateStatus } from '@/hooks/useAppStateStatus';
import { isMarketOpen, livePriceInterval } from '@/lib/utils/market';
import { indicesSocket } from '@/services/realtime/indicesSocket';
import { isApiError } from '@/types/api';

import { marketApi } from './api';
import { RANGE_REQUEST, type ChartRange } from './lib/chartRanges';
import type { CapBand, IndexQuote, IndexSnapshot, MoverKind } from './types';

export const marketKeys = {
  all: ['market'] as const,
  indices: () => [...marketKeys.all, 'indices'] as const,
  movers: (kind: MoverKind, limit: number, cap?: CapBand) =>
    [...marketKeys.all, 'movers', kind, limit, cap ?? 'all'] as const,
  search: (query: string) => [...marketKeys.all, 'search', query] as const,
  recentlyViewed: () => [...marketKeys.all, 'recently-viewed'] as const,
  stock: (exchange: string, symbol: string) =>
    [...marketKeys.all, 'stock', exchange, symbol] as const,
  candles: (exchange: string, symbol: string, range: ChartRange) =>
    [...marketKeys.all, 'candles', exchange, symbol, range] as const,
  sentiment: (symbols: readonly string[]) => [...marketKeys.all, 'sentiment', ...symbols] as const,
  screeners: () => [...marketKeys.all, 'screeners'] as const,
  screener: (id: string) => [...marketKeys.all, 'screener', id] as const,
  news: () => [...marketKeys.all, 'news'] as const,
};

const live = (ms: number) => () => livePriceInterval(ms);

/** How long a fresh subscription waits for the feed's first frame before giving up on it. */
const FIRST_SNAPSHOT_TIMEOUT_MS = 4_000;

/** REST index levels need the viewer's own broker; these answers only mean "none". */
function isNoBrokerError(error: unknown): boolean {
  return (
    isApiError(error) &&
    (error.status === 404 ||
      error.code === 'NOT_FOUND' ||
      error.code === 'BROKER_SESSION_EXPIRED' ||
      error.status === 409)
  );
}

/**
 * Index levels: the Socket.IO feed while this screen is focused and the app is in the
 * foreground, with REST as the first paint and the fallback. REST needs the user's own
 * broker (404/409 otherwise), so its error is only surfaced when the socket has nothing
 * either, and never for a user who simply has no broker.
 */
export function useLiveIndices(): {
  indices: IndexQuote[];
  marketOpen: boolean;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
} {
  const appState = useAppStateStatus();
  const [snapshot, setSnapshot] = useState<IndexSnapshot | null>(null);
  const [awaitingSocket, setAwaitingSocket] = useState(true);

  const rest = useQuery({
    queryKey: marketKeys.indices(),
    queryFn: marketApi.indices,
    staleTime: 15_000,
    retry: false,
    // Polled only as the socket's stand-in, and never once it has said "no broker": asking
    // again every 15 s would get the same 404/409 every time.
    refetchInterval: (query) =>
      snapshot || isNoBrokerError(query.state.error)
        ? false
        : livePriceInterval(appConfig.market.livePollMs),
  });

  useFocusEffect(
    useCallback(() => {
      if (appState !== 'active') return undefined;
      const timer = setTimeout(() => setAwaitingSocket(false), FIRST_SNAPSHOT_TIMEOUT_MS);
      const unsubscribe = indicesSocket.subscribe((next) => {
        setSnapshot(next);
        setAwaitingSocket(false);
      });
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    }, [appState]),
  );

  const indices = snapshot?.indices ?? rest.data?.indices ?? [];
  const empty = indices.length === 0;
  return {
    indices,
    // The feed replays its last in-session frame, still marked open, to anyone who joins
    // after the close — so the clock has a say too.
    marketOpen: isMarketOpen() && (snapshot?.marketOpen ?? true),
    isLoading: empty && (rest.isPending || awaitingSocket),
    error: empty && !awaitingSocket && !isNoBrokerError(rest.error) ? rest.error : null,
    refetch: rest.refetch,
  };
}

export function useMovers(kind: MoverKind, limit: number, cap?: CapBand) {
  return useQuery({
    queryKey: marketKeys.movers(kind, limit, cap),
    queryFn: ({ signal }) => marketApi.movers(kind, { limit, cap, signal }),
    staleTime: 30_000,
    refetchInterval: live(45_000),
    placeholderData: keepPreviousData,
  });
}

export function useStockSearch(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: marketKeys.search(trimmed.toLowerCase()),
    queryFn: ({ signal }) => marketApi.search(trimmed, 20, signal),
    enabled: trimmed.length > 0,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
}

export function useRecentlyViewed(limit = 12) {
  return useQuery({
    queryKey: marketKeys.recentlyViewed(),
    queryFn: () => marketApi.recentlyViewed(limit),
    staleTime: 30_000,
  });
}

/** Fire-and-forget "viewed" ping on opening a stock; refreshes the recents list. */
export function useRecordStockView() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ exchange, symbol }: { exchange: string; symbol: string }) =>
      marketApi.recordView(exchange, symbol),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketKeys.recentlyViewed() }),
  });
}

/** Empties the recently-viewed strip (confirm first — it can't be undone). */
export function useClearRecentlyViewed() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => marketApi.clearRecentlyViewed(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: marketKeys.recentlyViewed() }),
  });
}

export function useStockDetail(symbol: string, exchange: string) {
  return useQuery({
    queryKey: marketKeys.stock(exchange, symbol),
    queryFn: ({ signal }) => marketApi.stock(symbol, exchange, signal),
    enabled: symbol.length > 0,
    staleTime: 5_000,
    refetchInterval: live(10_000),
  });
}

export function useCandles(symbol: string, exchange: string, range: ChartRange, enabled = true) {
  const request = RANGE_REQUEST[range];
  return useQuery({
    queryKey: marketKeys.candles(exchange, symbol, range),
    queryFn: ({ signal }) =>
      marketApi.candles(
        { exchange, symbol, minutesPerBar: request.minutesPerBar, count: request.count },
        signal,
      ),
    enabled: enabled && symbol.length > 0,
    staleTime: request.staleMs,
    // Candles are rate-limited (30/min): keep the previous range on screen while the next
    // loads rather than flashing a spinner, and refresh only the intraday view while live.
    placeholderData: keepPreviousData,
    refetchInterval: range === '1D' ? live(60_000) : false,
  });
}

export function useSentiment(symbols: readonly string[]) {
  return useQuery({
    queryKey: marketKeys.sentiment(symbols),
    queryFn: () => marketApi.sentiment([...symbols]),
    enabled: symbols.length > 0,
    staleTime: 10 * 60_000,
  });
}

export function useScreeners() {
  return useQuery({
    queryKey: marketKeys.screeners(),
    queryFn: marketApi.screeners,
    staleTime: 5 * 60_000,
  });
}

export function useScreener(id: string) {
  return useQuery({
    queryKey: marketKeys.screener(id),
    queryFn: () => marketApi.screener(id),
    enabled: id.length > 0,
    staleTime: 5 * 60_000,
  });
}

export function useNews() {
  return useQuery({
    queryKey: marketKeys.news(),
    queryFn: () => marketApi.news(1, 30),
    staleTime: 5 * 60_000,
  });
}
