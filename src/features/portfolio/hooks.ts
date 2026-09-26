import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useBrokerConnections } from '@/features/trading/hooks';
import type { BrokerConnectionSummary } from '@/features/trading/types';
import { livePriceInterval } from '@/lib/utils/market';

import { portfolioApi } from './api';
import { portfolioKeys } from './keys';
import { OPEN_AT_BROKER } from './lib/book';
import {
  brokerStateOf,
  resolveOverview,
  type BrokerState,
  type PortfolioOverview,
} from './lib/overview';
import type { OrderHistoryPage, PortfolioHistoryScope } from './types';

export { portfolioApi } from './api';
export { portfolioKeys } from './keys';
export type { BrokerState, PortfolioOverview } from './lib/overview';

/** GET /portfolio — one definition, shared by the overview and the mStock screen. */
const mstockQuery = {
  queryKey: portfolioKeys.broker,
  queryFn: portfolioApi.broker,
  staleTime: 10_000,
  retry: false,
  refetchInterval: () => livePriceInterval(15_000),
} as const;

const linkedQuery = (broker: string) =>
  ({
    queryKey: portfolioKeys.linked(broker),
    queryFn: () => portfolioApi.linked(broker),
    staleTime: 10_000,
    retry: false,
    refetchInterval: () => livePriceInterval(15_000),
  }) as const;

/** The API-linked broker (anything but mStock) the user has set up, if any. */
function linkedBrokerOf(connections: readonly BrokerConnectionSummary[] | undefined) {
  return (
    connections?.find(
      (connection) =>
        connection.broker !== 'mstock' && connection.status !== 'pending_verification',
    )?.broker ?? null
  );
}

/**
 * The user's book — see resolveOverview for which one wins. `/portfolio` only knows
 * mStock, so a Groww-only user's holdings are read from /portfolio/linked/groww, asked
 * for only when mStock has nothing to show.
 */
export function usePortfolioOverview(): PortfolioOverview {
  const broker = useQuery(mstockQuery);
  const mstockState = brokerStateOf(broker.error, Boolean(broker.data), broker.isPending);
  const mstockEmpty = !broker.isPending && (broker.data?.holdings.length ?? 0) === 0;

  const connections = useBrokerConnections();
  const linkedId = mstockEmpty ? linkedBrokerOf(connections.data) : null;
  const linked = useQuery({ ...linkedQuery(linkedId ?? ''), enabled: linkedId !== null });
  // A disabled query also reports isPending, so only an enabled one can be "loading".
  const linkedPending = linkedId !== null && linked.isPending;
  const linkedResolving = mstockEmpty && (connections.isPending || linkedPending);
  const linkedEmpty = (linked.data?.holdings.length ?? 0) === 0;

  const needManual = mstockEmpty && !linkedResolving && linkedEmpty;
  const manual = useQuery({
    queryKey: portfolioKeys.manual,
    queryFn: portfolioApi.manual,
    staleTime: 60_000,
    enabled: needManual,
  });

  return useMemo<PortfolioOverview>(
    () => ({
      ...resolveOverview({
        mstock: { data: broker.data, state: mstockState, error: broker.error },
        linked: {
          id: linkedId,
          data: linkedId ? linked.data : undefined,
          state: brokerStateOf(linked.error, Boolean(linked.data), linkedPending),
          error: linked.error,
          resolving: linkedResolving,
        },
        manual: {
          needed: needManual,
          data: manual.data,
          error: manual.error,
          isPending: manual.isPending,
        },
      }),
      refetch: () =>
        Promise.all([
          broker.refetch(),
          linkedId ? linked.refetch() : null,
          needManual ? manual.refetch() : null,
        ]),
    }),
    [broker, linked, manual, mstockState, linkedId, linkedPending, linkedResolving, needManual],
  );
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
