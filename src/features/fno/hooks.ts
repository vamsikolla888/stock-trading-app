import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useIsFocused } from 'expo-router';
import { useCallback, useMemo, useRef } from 'react';

import { useDebounce } from '@/hooks/useDebounce';
import { isMarketOpen, livePriceInterval } from '@/lib/utils/market';
import { isApiError } from '@/types/api';

import { fnoApi } from './api';
import { candleWindow } from './lib/candles';
import { orderDetailSettled } from './lib/chain';
import { commodityPollInterval, isCommodityExchange } from './lib/explore';
import { candleWindows, toCandles, underlyingRange, type UnderlyingRange } from './lib/underlying';
import type {
  ChartTarget,
  CommodityContractSearchResult,
  CommodityUnderlying,
  ExitPositionInput,
  ExploreSection,
  FnoCandleInterval,
  FnoContract,
  FnoExchange,
  MarginLeg,
  ModifyFnoOrderInput,
  PlaceFnoOrderInput,
} from './types';

/**
 * React Query bindings for the Groww-backed F&O module. SEPARATE STATE PER CONCERN —
 * reference data (underlyings, expiries), market data (chain, futures, quote) and account
 * data (positions, orders, funds) never share a cache entry.
 *
 * REFRESH POLICY (the web client's, minus its socket stream — see the report):
 *   - Instrument universe / expiries: listed once a day → cached for an hour, never polled.
 *   - Chain: every 5 s on Groww data, 25 s on the platform feed (its quote cache is 20 s),
 *     only while the market is open and the screen is on top.
 *   - Positions/orders: 5 s while an order is working, 15–30 s otherwise, and invalidated
 *     immediately by every order action here.
 * `subscribed: focused` stops a screen that is covered (another tab, a pushed screen) from
 * polling or re-rendering; it catches up the moment it is shown again.
 */

const HOUR = 60 * 60_000;

export const fnoKeys = {
  all: ['fno'] as const,
  explore: () => [...fnoKeys.all, 'explore'] as const,
  exploreSection: (section: ExploreSection) => [...fnoKeys.all, 'explore', section] as const,
  /** v2: one calendar month (server 2026-10-07); the old key held the 45-day window. */
  expiryCalendar: (month: string) => [...fnoKeys.all, 'expiry-calendar', 'v2', month] as const,
  underlyings: () => [...fnoKeys.all, 'underlyings'] as const,
  search: (q: string) => [...fnoKeys.all, 'search', q] as const,
  status: () => [...fnoKeys.all, 'status'] as const,
  expiries: (exchange: FnoExchange, underlying: string) =>
    [...fnoKeys.all, 'expiries', exchange, underlying] as const,
  chain: (
    exchange: FnoExchange,
    underlying: string,
    expiry: string | null,
    strikes: number | null,
  ) => [...fnoKeys.all, 'chain', exchange, underlying, expiry, strikes] as const,
  futures: (exchange: FnoExchange, underlying: string) =>
    [...fnoKeys.all, 'futures', exchange, underlying] as const,
  contract: (exchange: FnoExchange, tradingSymbol: string) =>
    [...fnoKeys.all, 'contract', exchange, tradingSymbol] as const,
  /** `subject`: the underlying for an underlying chart, the trading symbol for a contract's. */
  candles: (
    exchange: FnoExchange,
    subject: string,
    target: ChartTarget,
    interval: FnoCandleInterval,
  ) => [...fnoKeys.all, 'candles', exchange, subject, target, interval] as const,
  underlyingCandles: (exchange: FnoExchange, underlying: string, range: UnderlyingRange) =>
    [...fnoKeys.all, 'underlying-candles', exchange, underlying, range] as const,
  positions: () => [...fnoKeys.all, 'positions'] as const,
  orders: () => [...fnoKeys.all, 'orders'] as const,
  order: (growwOrderId: string) => [...fnoKeys.all, 'order', growwOrderId] as const,
  funds: () => [...fnoKeys.all, 'funds'] as const,
  margin: (signature: string) => [...fnoKeys.all, 'margin', signature] as const,
};

/** A 4xx (unknown expiry, unknown underlying) is an answer, not a blip — never retried. */
const retryTransient = (count: number, error: unknown) =>
  count < 2 && !(isApiError(error) && error.status > 0 && error.status < 500);

/* ── Reference ─────────────────────────────────────────────────────────────────────── */

export function useFnoUnderlyings() {
  return useQuery({
    queryKey: fnoKeys.underlyings(),
    queryFn: ({ signal }) => fnoApi.underlyings(signal),
    staleTime: HOUR,
  });
}

/** Contracts and commodities matching a query (underlyings filter locally from the universe). */
export function useFnoSearch(query: string) {
  const q = useDebounce(query.trim().toUpperCase(), 300);
  return useQuery({
    queryKey: fnoKeys.search(q),
    queryFn: ({ signal }) => fnoApi.search(q, signal),
    enabled: q.length >= 3 && q.length <= 40,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useFnoStatus() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.status(),
    queryFn: ({ signal }) => fnoApi.status(signal),
    staleTime: 30_000,
    refetchInterval: 60_000,
    subscribed: focused,
  });
}

/**
 * The Explore landing page: one request for every shelf. 15 s while the market is open
 * (the server caches the dataset for the same 15 s); a minute outside hours, when only MCX
 * commodities (open to 23:30) still move.
 */
export function useFnoExplore() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.explore(),
    queryFn: ({ signal }) => fnoApi.explore(signal),
    staleTime: 10_000,
    refetchInterval: () => (isMarketOpen() ? 15_000 : 60_000),
    placeholderData: keepPreviousData,
    retry: retryTransient,
    subscribed: focused,
  });
}

/** One "See more" shelf in full — same server dataset as the landing page. */
export function useExploreSection(section: ExploreSection | null) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.exploreSection(section ?? 'underlyings'),
    queryFn: ({ signal }) => fnoApi.exploreSection(section as ExploreSection, signal),
    enabled: section != null,
    staleTime: 10_000,
    refetchInterval: () => (isMarketOpen() ? 15_000 : 60_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

/**
 * One month of the expiry calendar. Listed once a day and cached an hour server-side, so it is
 * never polled. The previous month stays on screen (dimmed) while the next one loads.
 */
export function useExpiryCalendar(month: string) {
  return useQuery({
    queryKey: fnoKeys.expiryCalendar(month),
    queryFn: ({ signal }) => fnoApi.expiryCalendar(month, signal),
    staleTime: HOUR,
    placeholderData: keepPreviousData,
    retry: retryTransient,
  });
}

export interface CommoditySearchHits {
  commodities: CommodityUnderlying[];
  contracts: CommodityContractSearchResult[];
}

const NO_COMMODITY_HITS: CommoditySearchHits = { commodities: [], contracts: [] };

/**
 * The commodity half of an F&O search (MCX / NSE commodity underlyings and contracts) — the
 * same GET /fno/search answer as useFnoSearch (one request, one cache entry), for a search
 * screen that lists commodities beside stocks and F&O. Each opens its read-only chain.
 */
export function useCommoditySearchHits(
  query: string,
  enabled = true,
  limits: { commodities: number; contracts: number } = { commodities: 4, contracts: 4 },
): CommoditySearchHits {
  const needle = enabled ? query : '';
  const remote = useFnoSearch(needle);
  const trimmed = needle.trim();
  // keepPreviousData answers a deleted longer query; below the server minimum it is not shown.
  const answer = trimmed.length >= 3 ? remote.data : undefined;
  return useMemo(
    () =>
      answer
        ? {
            commodities: (answer.commodities ?? []).slice(0, limits.commodities),
            contracts: (answer.commodityContracts ?? []).slice(0, limits.contracts),
          }
        : NO_COMMODITY_HITS,
    [answer, limits.commodities, limits.contracts],
  );
}

export function useFnoExpiries(exchange: FnoExchange, underlying: string | null) {
  return useQuery({
    queryKey: fnoKeys.expiries(exchange, underlying ?? ''),
    queryFn: ({ signal }) => fnoApi.expiries(exchange, underlying as string, signal),
    enabled: !!underlying,
    staleTime: HOUR,
    retry: retryTransient,
  });
}

/* ── Market data ───────────────────────────────────────────────────────────────────── */

export function useOptionChain(
  exchange: FnoExchange,
  underlying: string | null,
  expiry: string | null,
  strikes: number | null,
  enabled = true,
) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.chain(exchange, underlying ?? '', expiry, strikes),
    queryFn: ({ signal }) =>
      fnoApi.chain(exchange, underlying as string, { expiry, strikes }, signal),
    enabled: enabled && !!underlying,
    staleTime: 3_000,
    // The previous chain stays on screen while a new expiry or window loads — an unmounting
    // table on every chip tap reads as the screen breaking.
    placeholderData: keepPreviousData,
    // A commodity chain is built from Groww LTP calls and its premiums already stream; a 15 s
    // re-read leaves Groww's live budget to the stream (the web's rule). MCX trades to 23:30,
    // past equity hours, so it polls on its own session.
    refetchInterval: (q) =>
      isCommodityExchange(exchange)
        ? commodityPollInterval(q.state.data?.source === 'groww' ? 15_000 : 25_000)
        : livePriceInterval(q.state.data?.source === 'groww' ? 5_000 : 25_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

export function useFnoFutures(exchange: FnoExchange, underlying: string | null, enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.futures(exchange, underlying ?? ''),
    queryFn: ({ signal }) => fnoApi.futures(exchange, underlying as string, signal),
    enabled: enabled && !!underlying,
    staleTime: 5_000,
    refetchInterval: (q) =>
      isCommodityExchange(exchange)
        ? commodityPollInterval(q.state.data?.source === 'groww' ? 15_000 : 25_000)
        : livePriceInterval(q.state.data?.source === 'groww' ? 10_000 : 25_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

/**
 * Bars for the option-chain chart. An underlying's series is keyed by the underlying, not by
 * the contract that names it to the API: that contract (the ATM one) shifts as the spot moves
 * or the expiry changes, and neither changes the underlying's bars. The window is computed per
 * fetch and refetched each minute in market hours, so new bars arrive; between refetches the
 * polled chain price keeps the forming bar live (lib/candles foldLivePrice).
 */
export function useFnoCandles(
  exchange: FnoExchange,
  contract: Pick<FnoContract, 'tradingSymbol' | 'underlying'> | null,
  target: ChartTarget,
  interval: FnoCandleInterval,
  enabled = true,
) {
  const focused = useIsFocused();
  const subject = contract
    ? target === 'underlying'
      ? contract.underlying
      : contract.tradingSymbol
    : '';
  return useQuery({
    queryKey: fnoKeys.candles(exchange, subject, target, interval),
    queryFn: ({ signal }) =>
      fnoApi.candles(
        exchange,
        (contract as Pick<FnoContract, 'tradingSymbol'>).tradingSymbol,
        { target, interval, ...candleWindow(interval) },
        signal,
      ),
    enabled: enabled && !!contract,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
    // Another interval of the SAME instrument stays up (dimmed) while the next loads; a
    // different instrument never stands in for the one asked for.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === exchange &&
      previousQuery.queryKey[3] === subject &&
      previousQuery.queryKey[4] === target
        ? previous
        : undefined,
    refetchInterval: () =>
      isCommodityExchange(exchange) ? commodityPollInterval(60_000) : livePriceInterval(60_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

/**
 * An underlying's bars for one range of its own screen (index or F&O stock), charted through
 * `anchor` — any listed contract of it; the series is keyed by the underlying, so the anchor
 * can change without a refetch. A range longer than one request allows is fetched as parallel
 * windows and merged. 1D refreshes each minute in market hours (new bars); the live feed keeps
 * the forming bar current in between.
 */
export function useUnderlyingCandles(
  exchange: FnoExchange,
  underlying: string,
  anchor: Pick<FnoContract, 'tradingSymbol'> | null,
  range: UnderlyingRange,
) {
  const focused = useIsFocused();
  const spec = underlyingRange(range);
  return useQuery({
    queryKey: fnoKeys.underlyingCandles(exchange, underlying, range),
    queryFn: async ({ signal }) => {
      const symbol = (anchor as Pick<FnoContract, 'tradingSymbol'>).tradingSymbol;
      const windows = candleWindows(spec.days, spec.interval, Math.floor(Date.now() / 1000));
      const pages = await Promise.all(
        windows.map((w) =>
          fnoApi.candles(
            exchange,
            symbol,
            { target: 'underlying', interval: spec.interval, from: w.from, to: w.to },
            signal,
          ),
        ),
      );
      const bars = toCandles(pages.map((page) => page.candles));
      return {
        bars,
        source: pages.find((page) => page.source)?.source ?? null,
        unavailableReason: bars.length === 0 ? (pages[0]?.unavailableReason ?? null) : null,
      };
    },
    enabled: anchor != null && underlying.length > 0,
    staleTime: spec.intraday ? 60_000 : 10 * 60_000,
    gcTime: 10 * 60_000,
    // Another range of the SAME underlying stays up (dimmed) while the next loads.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[2] === exchange && previousQuery.queryKey[3] === underlying
        ? previous
        : undefined,
    refetchInterval: range === '1D' ? () => livePriceInterval(60_000) : false,
    retry: retryTransient,
    subscribed: focused,
  });
}

/** One contract's quote + greeks + depth. */
export function useContractDetail(
  exchange: FnoExchange,
  tradingSymbol: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: fnoKeys.contract(exchange, tradingSymbol ?? ''),
    queryFn: ({ signal }) => fnoApi.contract(exchange, tradingSymbol as string, signal),
    enabled: enabled && !!tradingSymbol,
    staleTime: 3_000,
    gcTime: 5 * 60_000,
    refetchInterval: (q) => livePriceInterval(q.state.data?.source === 'groww' ? 5_000 : 25_000),
    retry: retryTransient,
  });
}

/* ── Account ───────────────────────────────────────────────────────────────────────── */

export function useFnoPositions(enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.positions(),
    queryFn: ({ signal }) => fnoApi.positions(signal),
    enabled,
    staleTime: 5_000,
    refetchInterval: () => livePriceInterval(15_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

export function useFnoOrders(enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.orders(),
    queryFn: ({ signal }) => fnoApi.orders(signal),
    enabled,
    staleTime: 5_000,
    // A working order is polled fast whatever the clock says (after-market orders exist).
    refetchInterval: (q) =>
      q.state.data?.orders.some((o) => o.canCancel) ? 5_000 : livePriceInterval(30_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

/** One order in full; polled every 5 s until both Groww and this app's record say it is final. */
export function useFnoOrderDetail(growwOrderId: string | null) {
  return useQuery({
    queryKey: fnoKeys.order(growwOrderId ?? ''),
    queryFn: ({ signal }) => fnoApi.orderDetail(growwOrderId as string, signal),
    enabled: !!growwOrderId,
    staleTime: 2_000,
    gcTime: 60_000,
    refetchInterval: (q) => (orderDetailSettled(q.state.data) ? false : 5_000),
    retry: retryTransient,
  });
}

export function useFnoFunds(enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: fnoKeys.funds(),
    queryFn: ({ signal }) => fnoApi.funds(signal),
    enabled,
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(30_000),
    retry: retryTransient,
    subscribed: focused,
  });
}

/** Groww's required margin for the ticket's order, re-asked (debounced) as the order changes. */
export function useMarginPreview(legs: MarginLeg[] | null, enabled: boolean) {
  const signature = legs ? JSON.stringify(legs) : null;
  const debounced = useDebounce(signature, 400);
  return useQuery({
    queryKey: fnoKeys.margin(debounced ?? ''),
    queryFn: ({ signal }) => fnoApi.margin(JSON.parse(debounced as string) as MarginLeg[], signal),
    enabled: enabled && !!debounced && debounced === signature,
    staleTime: 10_000,
    gcTime: 60_000,
    retry: false,
  });
}

/* ── Mutations ─────────────────────────────────────────────────────────────────────── */

function useInvalidateAccount() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      Promise.all(
        (['orders', 'order', 'positions', 'funds', 'margin'] as const).map((key) =>
          qc.invalidateQueries({ queryKey: [...fnoKeys.all, key] }),
        ),
      ),
    [qc],
  );
}

/**
 * ONE idempotency key per order INTENT: minted when the user reaches the review step, reused
 * for every retry of that confirmation (a timeout followed by a second tap can never become
 * two orders), discarded once the order has an answer or any field changes. A network error
 * or 5xx keeps it — nothing is known to have been placed, and a retry must be the SAME order.
 */
export function useOrderIntent() {
  const keyRef = useRef<string | null>(null);
  const begin = useCallback((): string => {
    keyRef.current ??= Crypto.randomUUID();
    return keyRef.current;
  }, []);
  const discard = useCallback(() => {
    keyRef.current = null;
  }, []);
  const settle = useCallback((error: unknown | null) => {
    if (error === null) {
      keyRef.current = null;
      return;
    }
    if (isApiError(error) && error.status >= 400 && error.status < 500) keyRef.current = null;
  }, []);
  return useMemo(() => ({ begin, discard, settle }), [begin, discard, settle]);
}

/** Places a REAL order on the user's Groww account. */
export function usePlaceFnoOrder() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: (body: PlaceFnoOrderInput) => fnoApi.placeOrder(body),
    onSettled: invalidate,
  });
}

/** Exits all or part of a position — a REAL order on the opposite side. */
export function useExitFnoPosition() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: (body: ExitPositionInput) => fnoApi.exitPosition(body),
    onSettled: invalidate,
  });
}

export function useModifyFnoOrder() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ModifyFnoOrderInput }) =>
      fnoApi.modifyOrder(id, body),
    onSettled: invalidate,
  });
}

export function useCancelFnoOrder() {
  const invalidate = useInvalidateAccount();
  return useMutation({
    mutationFn: (growwOrderId: string) => fnoApi.cancelOrder(growwOrderId),
    onSettled: invalidate,
  });
}
