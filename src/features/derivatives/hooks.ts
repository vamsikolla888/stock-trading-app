import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useMemo } from 'react';

import { useFnoSearch, useFnoUnderlyings } from '@/features/fno/hooks';
import { liveKey } from '@/features/market/lib/liveQuote';
import { useLiveQuotes } from '@/features/market/live';
import { isMarketOpen, livePriceInterval } from '@/lib/utils/market';
import { isServerOutdated } from '@/services/api/contract';
import { isApiError } from '@/types/api';

import { derivativesApi } from './api';
import { PAPER_ORDERS_LIMIT } from './lib/book';
import {
  fnoSearchHits,
  inputSignature,
  liveBook,
  livePositionPnl,
  type FnoSearchHit,
} from './lib/paperFno';
import type {
  BuildStrategyInput,
  FnoOrderView,
  FnoPositionView,
  PaperChainQuery,
  PayoffLegInput,
  PlacePaperFnoOrderInput,
} from './types';

/**
 * React Query bindings for the paper F&O book.
 *
 * POLLING CANNOT OUTRUN THE SERVER'S 20 s QUOTE CACHE, but it should not undershoot it either:
 * at 25 s a cell that changed just after a poll could sit stale for ~45 s. Every 10 s keeps the
 * screen within one cache refresh of the server while using a sixth of the chain's 60/min
 * bucket — a phone's battery and data are why this is not the web's 5 s. Polling stops outside
 * market hours and while the screen is covered.
 */

const CHAIN_POLL_MS = 10_000;
const BOOK_POLL_MS = 10_000;
/** A resting order is filled by the server's minute sweep with nothing done on this screen, so
 *  the order log polls while one is open: 10 s in the session, 30 s outside it (an after-market
 *  order fills at the open). With nothing resting there is nothing to wait for. */
const ORDERS_POLL_OPEN_MS = 10_000;
const ORDERS_POLL_CLOSED_MS = 30_000;
/** The ticket's estimate follows the market while it is open — the price it would fill at moves. */
const PREVIEW_POLL_MS = 4_000;
const HOUR = 60 * 60_000;

/** Set once an older server has answered the preview with "no such route" (SERVER_OUTDATED). */
let previewRouteMissing = false;

/** The connected server has no order preview — the ticket uses its own arithmetic. */
export const isPreviewUnavailable = (): boolean => previewRouteMissing;

export const derivativesKeys = {
  all: ['derivatives'] as const,
  underlyings: () => [...derivativesKeys.all, 'underlyings'] as const,
  expiries: (underlying: string) => [...derivativesKeys.all, 'expiries', underlying] as const,
  chain: (underlying: string, query: PaperChainQuery) =>
    [
      ...derivativesKeys.all,
      'chain',
      underlying,
      query.expiry ?? null,
      query.window ?? null,
      query.exchange ?? null,
    ] as const,
  book: () => [...derivativesKeys.all, 'book'] as const,
  wallet: () => [...derivativesKeys.all, 'wallet'] as const,
  analytics: () => [...derivativesKeys.all, 'analytics'] as const,
  orders: (limit: number) => [...derivativesKeys.all, 'orders', limit] as const,
  preview: (signature: string) => [...derivativesKeys.all, 'preview', signature] as const,
  movers: (kind: string, limit: number) => [...derivativesKeys.all, 'movers', kind, limit] as const,
  strategies: () => [...derivativesKeys.all, 'strategies'] as const,
  payoff: (signature: string) => [...derivativesKeys.all, 'payoff', signature] as const,
};

const retryTransient = (count: number, error: unknown) =>
  count < 2 && !(isApiError(error) && error.status > 0 && error.status < 500);

export function usePaperUnderlyings() {
  return useQuery({
    queryKey: derivativesKeys.underlyings(),
    queryFn: ({ signal }) => derivativesApi.underlyings(signal),
    staleTime: HOUR,
  });
}

/** The strategy templates — static server constants, so cached for an hour. */
export function useStrategyTemplates(enabled = true) {
  return useQuery({
    queryKey: derivativesKeys.strategies(),
    queryFn: ({ signal }) => derivativesApi.strategies(signal),
    enabled,
    staleTime: HOUR,
  });
}

export function usePaperChain(underlying: string | null, query: PaperChainQuery) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: derivativesKeys.chain(underlying ?? '', query),
    queryFn: ({ signal }) => derivativesApi.chain(underlying as string, query, signal),
    enabled: !!underlying,
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(CHAIN_POLL_MS),
    placeholderData: keepPreviousData,
    retry: retryTransient,
    subscribed: focused,
  });
}

export function usePaperBook() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: derivativesKeys.book(),
    queryFn: ({ signal }) => derivativesApi.book(signal),
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(BOOK_POLL_MS),
    retry: retryTransient,
    subscribed: focused,
  });
}

const hasResting = (orders: readonly FnoOrderView[] | undefined) =>
  (orders ?? []).some((o) => o.status === 'PENDING');

export function usePaperOrders(limit = PAPER_ORDERS_LIMIT, enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: derivativesKeys.orders(limit),
    queryFn: ({ signal }) => derivativesApi.orders(limit, signal),
    enabled,
    staleTime: 15_000,
    refetchInterval: (query) =>
      hasResting(query.state.data)
        ? isMarketOpen()
          ? ORDERS_POLL_OPEN_MS
          : ORDERS_POLL_CLOSED_MS
        : false,
    retry: retryTransient,
    subscribed: focused,
  });
}

/**
 * The ticket's live estimate: what the order on it would do, from the server's own placement
 * code. Keyed on the inputs, so changing lots, side, type or the limit re-asks (the caller
 * debounces typing); the previous estimate stays on screen while the next loads. Re-asked every
 * few seconds in the session, because the price it would fill at moves.
 *
 * NEVER RETRIED, and it stops polling on any error: a 429 (240/min) or an older server without
 * the route (SERVER_OUTDATED) leaves the ticket on its own arithmetic instead of hammering.
 */
export function usePaperOrderPreview(input: PlacePaperFnoOrderInput | null) {
  const focused = useIsFocused();
  const signature = input
    ? `${input.exchange ?? ''}:${input.tradingsymbol}|${inputSignature(input)}`
    : '';
  return useQuery({
    queryKey: derivativesKeys.preview(signature),
    queryFn: async ({ signal }) => {
      try {
        return await derivativesApi.previewOrder(input as PlacePaperFnoOrderInput, signal);
      } catch (error) {
        // The connected server has no preview route: stop asking for the rest of the session.
        if (isServerOutdated(error)) previewRouteMissing = true;
        throw error;
      }
    },
    enabled: !previewRouteMissing && input != null && input.lots > 0,
    staleTime: 0,
    gcTime: 30_000,
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: (query) =>
      query.state.status === 'error' ? false : livePriceInterval(PREVIEW_POLL_MS),
    subscribed: focused,
  });
}

/** One streamed F&O price, read against the polled one. */
export interface PositionMark {
  ltp: number | null;
  /** True when `ltp` came from the live stream rather than the book's last poll. */
  streamed: boolean;
  /** Unrealised P&L at `ltp` — null without a price (unknown, never zero). */
  pnl: number | null;
}

/**
 * The paper book marked LIVE: every position the server says is `streamable` (in Groww's master
 * under its symbol) is watched on the app-wide F&O feed and re-marked per tick; the rest keep
 * the book's polled price. Without the user's own Groww market data no tick arrives and every
 * row simply stays on its polled price — never an error.
 */
export function useLivePaperMarks(positions: readonly FnoPositionView[]) {
  const quotes = useLiveQuotes(
    positions
      .filter((p) => p.streamable)
      .map((p) => ({ exchange: p.exchange, symbol: p.tradingsymbol })),
    { mode: 'fno' },
  );
  const markOf = useCallback(
    (p: FnoPositionView): PositionMark => {
      const quote = p.streamable ? quotes.get(liveKey(p.exchange, p.tradingsymbol)) : undefined;
      if (quote) return { ltp: quote.ltp, streamed: true, pnl: livePositionPnl(p, quote.ltp) };
      return { ltp: p.ltp, streamed: false, pnl: p.ltp == null ? null : p.unrealisedPnl };
    },
    [quotes],
  );
  const totals = useMemo(() => liveBook(positions, (p) => markOf(p).ltp), [positions, markOf]);
  return { markOf, totals, streaming: quotes.size > 0 };
}

/** F&O-eligible movers. 45 s like the web's movers tables, only while the market is open. */
export function useFnoMovers(kind: 'gainers' | 'losers' | 'volume', limit: number, enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: derivativesKeys.movers(kind, limit),
    queryFn: ({ signal }) => derivativesApi.movers(kind, limit, signal),
    enabled,
    staleTime: 30_000,
    refetchInterval: () => livePriceInterval(45_000),
    placeholderData: keepPreviousData,
    retry: retryTransient,
    subscribed: focused,
  });
}

/** The F&O sandbox's own wallet — what an order can draw on, and what it is set to. */
export function usePaperFnoWallet(enabled = true) {
  return useQuery({
    queryKey: derivativesKeys.wallet(),
    queryFn: ({ signal }) => derivativesApi.wallet(signal),
    enabled,
    staleTime: 10_000,
    retry: retryTransient,
  });
}

/** Replayed from the order log (no live quotes), so it is cheap and needs no fast polling. */
export function usePaperFnoAnalytics(enabled = true) {
  return useQuery({
    queryKey: derivativesKeys.analytics(),
    queryFn: ({ signal }) => derivativesApi.analytics(signal),
    enabled,
    staleTime: 30_000,
    retry: retryTransient,
  });
}

/**
 * An order moves margin, positions, net greeks, the wallet and the order log in one write, so
 * every mutation refreshes all of them. Deliberately NOT:
 *   - the chain — a paper fill does not move the market, and a chain refetch is ~100 quote
 *     lookups against the chain's own rate bucket;
 *   - `paper` — the F&O pool is its own capital, and no /paper-trading endpoint reads it.
 * Fired, not awaited: the ticket shows its receipt at once and the book catches up behind it.
 */
function useInvalidatePaper() {
  const qc = useQueryClient();
  return useCallback(() => {
    void qc.invalidateQueries({ queryKey: derivativesKeys.book() });
    void qc.invalidateQueries({ queryKey: [...derivativesKeys.all, 'orders'] });
    void qc.invalidateQueries({ queryKey: derivativesKeys.wallet() });
    void qc.invalidateQueries({ queryKey: derivativesKeys.analytics() });
    // An open ticket's estimate read the cash and position this order just changed.
    void qc.invalidateQueries({ queryKey: [...derivativesKeys.all, 'preview'] });
  }, [qc]);
}

export function usePlacePaperOrder() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: (body: PlacePaperFnoOrderInput) => derivativesApi.placeOrder(body),
    onSettled: invalidate,
  });
}

/** Withdraws a resting LIMIT order; its reservation goes back to the wallet's free cash. */
export function useCancelPaperFnoOrder() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: (orderId: string) => derivativesApi.cancelOrder(orderId),
    onSettled: invalidate,
  });
}

/** Sets the F&O wallet — a deposit or a withdrawal of free cash. */
export function useSetPaperFnoWallet() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: (amount: number) => derivativesApi.setWallet(amount),
    onSettled: invalidate,
  });
}

/** Wipes the F&O sandbox alone — never the cash paper account. */
export function useResetPaperFno() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: () => derivativesApi.reset(),
    onSettled: invalidate,
  });
}

export function useSquareOffPaper() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: ({ exchange, tradingsymbol }: { exchange: string; tradingsymbol: string }) =>
      derivativesApi.squareOff(exchange, tradingsymbol),
    onSettled: invalidate,
  });
}

export function useSettleExpiredPaper() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: () => derivativesApi.settleExpired(),
    onSettled: invalidate,
  });
}

/** Places every leg of a built strategy as one paper basket. */
export function usePlacePaperBasket() {
  const invalidate = useInvalidatePaper();
  return useMutation({
    mutationFn: ({ basketName, legs }: { basketName: string; legs: PlacePaperFnoOrderInput[] }) =>
      derivativesApi.placeBasket(basketName, legs),
    onSettled: invalidate,
  });
}

/**
 * The expiry payoff of a fixed set of legs (what is held in one underlying). A POST that WRITES
 * NOTHING, so it is cached like a read, keyed on exactly the legs — the same book refreshing
 * underneath the sheet is the same request, and nothing is ever invalidated by it.
 */
export function usePaperPayoff(legs: PayoffLegInput[] | null) {
  const signature = legs ? JSON.stringify(legs) : '';
  return useQuery({
    queryKey: derivativesKeys.payoff(signature),
    queryFn: () => derivativesApi.payoff(JSON.parse(signature) as PayoffLegInput[]),
    enabled: legs != null && legs.length > 0,
    staleTime: 30_000,
    gcTime: 60_000,
    retry: retryTransient,
  });
}

/** Resolves and prices a template. A write-nothing POST fired by an explicit tap. */
export function useBuildStrategy() {
  return useMutation({
    mutationFn: (body: BuildStrategyInput) => derivativesApi.buildStrategy(body),
  });
}

/** The server's contract search needs three characters (useFnoSearch's own gate). */
const FNO_SEARCH_MIN = 3;

/**
 * F&O hits for a search box — underlyings from the cached universe (instant) and, from three
 * characters, the server's contract matches (the live F&O module's search, read-only here).
 * The previous answer is kept while the next loads, but never shown for a shorter query.
 */
export function useFnoSearchHits(
  query: string,
  enabled = true,
  limits?: { underlyings: number; contracts: number },
): { hits: FnoSearchHit[]; searching: boolean } {
  const universe = useFnoUnderlyings();
  const needle = enabled ? query.trim().toUpperCase() : '';
  const remote = useFnoSearch(needle);
  const contracts = needle.length >= FNO_SEARCH_MIN ? remote.data?.contracts : undefined;
  const hits = useMemo(
    () => fnoSearchHits(universe.data?.underlyings ?? [], contracts, needle, limits),
    [universe.data, contracts, needle, limits],
  );
  return { hits, searching: needle.length >= FNO_SEARCH_MIN && remote.isFetching };
}
