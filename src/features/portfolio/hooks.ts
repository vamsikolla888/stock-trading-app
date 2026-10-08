import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import { usePortfolioReview } from '@/features/agents/hooks';
import { livePriceInterval } from '@/lib/utils/market';
import { isServerOutdated } from '@/services/api/contract';

import { portfolioApi } from './api';
import { portfolioKeys } from './keys';
import { OPEN_AT_BROKER } from './lib/book';
import { bookFigures, homeBooks, readBook, type HomeBook } from './lib/books';
import { brokerStateOf, type BrokerState } from './lib/overview';
import { reviewIndex, type HoldingReviews } from './lib/reviews';
import type { OrderHistoryPage, PortfolioHistoryScope } from './types';
import { useLiveHoldings } from './useLiveHoldings';

export { portfolioApi } from './api';
export { portfolioKeys } from './keys';
export type { BrokerState } from './lib/overview';
export type { HomeBook } from './lib/books';
export type { HoldingReviews } from './lib/reviews';

/**
 * A broker book polls while the market is open — unless the broker isn't connected at all
 * (404), when there is nothing to poll for; pull-to-refresh still asks again.
 */
const bookPoll = (query: { state: { error: unknown } }) =>
  readBook(query.state.error).connected ? livePriceInterval(15_000) : false;

/** GET /portfolio — one definition, shared by Today and the mStock screen. */
const mstockQuery = {
  queryKey: portfolioKeys.broker,
  queryFn: portfolioApi.broker,
  staleTime: 10_000,
  retry: false,
  refetchInterval: bookPoll,
} as const;

const linkedQuery = (broker: string) =>
  ({
    queryKey: portfolioKeys.linked(broker),
    queryFn: () => portfolioApi.linked(broker),
    staleTime: 10_000,
    retry: false,
    refetchInterval: bookPoll,
  }) as const;

/**
 * Today's holdings card: every book the user has — Groww, then mStock, then holdings added by
 * hand — each priced live (lib/books.ts). ONE live subscription for every book's rows together.
 * Loading until both broker reads have answered once, so the carousel never opens on one book and
 * then jumps when the one that goes first arrives.
 */
export function useHomeBooks(): {
  books: HomeBook[];
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const groww = useQuery(linkedQuery('groww'));
  const mstock = useQuery(mstockQuery);
  const manual = useQuery({
    queryKey: portfolioKeys.manual,
    queryFn: portfolioApi.manual,
    staleTime: 60_000,
  });

  const bases = useMemo(
    () =>
      homeBooks({
        groww: { data: groww.data, error: groww.error },
        mstock: { data: mstock.data, error: mstock.error },
        manual: { data: manual.data },
      }),
    [groww.data, groww.error, mstock.data, mstock.error, manual.data],
  );
  const rows = useMemo(() => bases.flatMap((book) => book.holdings), [bases]);
  const live = useLiveHoldings(rows);
  // Each book takes back its own slice of the re-priced rows, in order.
  const books = useMemo(
    () =>
      bases.reduce<{ out: HomeBook[]; at: number }>(
        (acc, book) => {
          const holdings = live.slice(acc.at, acc.at + book.holdings.length);
          return {
            out: [...acc.out, { ...book, holdings, figures: bookFigures(holdings) }],
            at: acc.at + book.holdings.length,
          };
        },
        { out: [], at: 0 },
      ).out,
    [bases, live],
  );

  const { refetch: refetchGroww } = groww;
  const { refetch: refetchMstock } = mstock;
  const { refetch: refetchManual } = manual;
  const refetch = useCallback(
    () => Promise.all([refetchGroww(), refetchMstock(), refetchManual()]),
    [refetchGroww, refetchMstock, refetchManual],
  );

  return {
    books,
    isLoading: groww.isPending || mstock.isPending || (manual.isPending && books.length === 0),
    refetch,
  };
}

/**
 * Where a broker book stands, from its query. A failed refetch outranks cached data: a
 * session that lapsed mid-day must say so, even while the last good figures stay on screen.
 */
export function bookStateOf(query: {
  data: unknown;
  error: unknown;
  isPending: boolean;
}): BrokerState {
  if (query.error) return brokerStateOf(query.error, false, false);
  return brokerStateOf(null, query.data !== undefined, query.isPending);
}

/** The mStock book on its own (the mStock portfolio tab), polled while the market is open. */
export function useMstockPortfolio() {
  const query = useQuery(mstockQuery);
  return { query, state: bookStateOf(query) };
}

/** An API-linked broker's book (Groww). */
export function useLinkedPortfolio(broker: string) {
  const query = useQuery(linkedQuery(broker));
  return { query, state: bookStateOf(query) };
}

/**
 * The AI portfolio review's verdict per holding, for the Groww and mStock holdings lists (web:
 * agents/hooks/useHoldingReviews.ts). The same query as Agents › Portfolio review, so every
 * screen reads one cached answer and agrees with it. A failure only means no verdicts are shown —
 * the holdings themselves never wait on it.
 */
export function useHoldingReviews(): HoldingReviews {
  const query = usePortfolioReview();
  const data = query.data ?? null;
  const index = useMemo(() => reviewIndex(data?.holdings), [data]);
  return {
    index,
    data,
    isLoading: query.isPending,
    isError: query.isError && !data,
    outdated: !data && isServerOutdated(query.error),
  };
}

/** The last three trading days of orders at `broker`; idle while there's no live broker. */
export function useOrderHistory(broker: string | null) {
  return useQuery({
    queryKey: portfolioKeys.orders(broker ?? '', 1),
    queryFn: () => portfolioApi.orderHistory(broker!, 1, 3),
    enabled: broker !== null,
    staleTime: 15_000,
    retry: false,
    refetchInterval: () => livePriceInterval(20_000),
  });
}

function hasWorkingOrder(page: OrderHistoryPage | undefined): boolean {
  return Boolean(
    page?.days.some((day) => day.orders.some((order) => OPEN_AT_BROKER.has(order.status))),
  );
}

/**
 * One page of order history (whole trading days, three per page). The previous page stays
 * on screen while the next loads; page 1 — the one holding today — polls fast while an
 * order is still working, so a fill shows within seconds.
 */
export function useOrderHistoryPage(broker: string, page: number, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.orders(broker, page),
    queryFn: () => portfolioApi.orderHistory(broker, page, 3),
    enabled,
    staleTime: 10_000,
    retry: false,
    placeholderData: keepPreviousData,
    refetchInterval: (query) => {
      if (page !== 1) return false;
      return hasWorkingOrder(query.state.data) ? 3_000 : livePriceInterval(20_000);
    },
  });
}

/** Today's trade book (executions) at `broker`. */
export function useBrokerTrades(broker: string, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.trades(broker),
    queryFn: () => portfolioApi.trades(broker),
    enabled,
    staleTime: 15_000,
    retry: false,
    refetchInterval: () => livePriceInterval(20_000),
  });
}

/** Today's holdings re-priced over past closes. Built from daily bars, so not polled. */
export function usePortfolioHistory(days: number, scope: PortfolioHistoryScope, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.history(days, scope),
    queryFn: () => portfolioApi.history(days, scope),
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

export function usePnlStatement(broker: string, days: number, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.pnl(broker, days),
    queryFn: () => portfolioApi.pnl(broker, days),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLinkedAnalytics(broker: string, days: number, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.analytics(broker, days),
    queryFn: () => portfolioApi.analytics(broker, days),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

export function useLifetimeOverview(broker: string, enabled = true) {
  return useQuery({
    queryKey: portfolioKeys.lifetime(broker),
    queryFn: () => portfolioApi.lifetime(broker),
    enabled,
    staleTime: 60_000,
  });
}

export function useLifetimeStatement(
  broker: string,
  page: number,
  sym: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: portfolioKeys.statement(broker, page, sym),
    queryFn: () => portfolioApi.statement(broker, page, sym),
    enabled,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Cancels an open mStock order; the book, the live orders and the wallet all move with it. */
export function useCancelBrokerOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (brokerOrderId: string) => portfolioApi.cancelBrokerOrder(brokerOrderId),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
      ]),
  });
}
