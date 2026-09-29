import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { paperKeys } from '@/features/paper/keys';
import type { CashSegment, PaperOrderInput } from '@/features/paper/types';
import { portfolioKeys } from '@/features/portfolio/keys';
import { livePriceInterval } from '@/lib/utils/market';
import { isApiError } from '@/types/api';

import { brokersApi, liveTradingApi } from './api';
import { resolveLiveTrading } from './lib/availability';
import { IN_FLIGHT, ordersMoved } from './lib/liveOrders';
import {
  type ApiKeyTotpConnectPayload,
  type LiveBroker,
  type ModifyLiveOrderInput,
  type MstockConnectPayload,
} from './types';

// The paper hooks moved to features/paper; re-exported so existing imports keep working.
export {
  usePaperOrders,
  usePaperPortfolio,
  usePaperPreview,
  usePaperSegments,
} from '@/features/paper/hooks';

export const tradingKeys = {
  connections: ['brokers', 'connections'] as const,
  catalog: ['brokers', 'catalog'] as const,
  liveSettings: ['live-trading', 'settings'] as const,
  killSwitch: ['live-trading', 'kill-switch'] as const,
  wallet: (broker: string) => ['live-trading', 'wallet', broker] as const,
  liveOrders: (limit: number) => ['live-trading', 'orders', limit] as const,
  paperSegments: paperKeys.segments(),
  paperPortfolio: (segment: CashSegment) => paperKeys.portfolio(segment),
  paperOrders: ['paper', 'orders'] as const,
  paperPreview: (input: PaperOrderInput) => paperKeys.preview(input),
};

export function useBrokerConnections() {
  return useQuery({
    queryKey: tradingKeys.connections,
    queryFn: brokersApi.connections,
    staleTime: 60_000,
  });
}

export function useBrokerCatalog() {
  return useQuery({
    queryKey: tradingKeys.catalog,
    queryFn: brokersApi.catalog,
    staleTime: 60 * 60_000,
  });
}

export function useLiveTradingSettings() {
  return useQuery({
    queryKey: tradingKeys.liveSettings,
    queryFn: liveTradingApi.settings,
    staleTime: 30_000,
  });
}

export function useKillSwitch() {
  return useQuery({
    queryKey: tradingKeys.killSwitch,
    queryFn: liveTradingApi.killSwitch,
    staleTime: 30_000,
  });
}

export interface LiveAvailability {
  available: boolean;
  broker: LiveBroker | null;
  brokerLabel: string | null;
  /** Why live trading can't be used right now — shown instead of a dead button. */
  reason: string | null;
  isLoading: boolean;
}

/**
 * Every live pre-check at once (see resolveLiveTrading). The catalog is static and only
 * decides live-capability, so it doesn't hold up the answer — the others do.
 */
function useLiveTradingResolution() {
  const settings = useLiveTradingSettings();
  const killSwitch = useKillSwitch();
  const connections = useBrokerConnections();
  const catalog = useBrokerCatalog();
  const isLoading = settings.isPending || killSwitch.isPending || connections.isPending;

  const resolution = useMemo(
    () =>
      resolveLiveTrading({
        settings: { data: settings.data, error: settings.error },
        killSwitch: { data: killSwitch.data, error: killSwitch.error },
        connections: { data: connections.data, error: connections.error },
        catalog: { data: catalog.data },
      }),
    [
      settings.data,
      settings.error,
      killSwitch.data,
      killSwitch.error,
      connections.data,
      connections.error,
      catalog.data,
    ],
  );
  return { resolution, isLoading };
}

/**
 * Whether a real order can be placed, checked BEFORE showing the live option: the global
 * switch, the kill switch, and a connected broker that can trade live. The web skips
 * these pre-checks and learns about them only from a rejected order.
 */
export function useLiveTradingAvailability(): LiveAvailability {
  const { resolution, isLoading } = useLiveTradingResolution();

  return useMemo(() => {
    const broker = resolution.brokers[0] ?? null;
    return {
      available: !isLoading && broker !== null,
      broker,
      brokerLabel: broker ? resolution.labelOf(broker) : null,
      reason: isLoading ? null : resolution.reason,
      isLoading,
    };
  }, [resolution, isLoading]);
}

export function useLiveWallet(broker: LiveBroker | null) {
  return useQuery({
    queryKey: tradingKeys.wallet(broker ?? 'none'),
    queryFn: () => liveTradingApi.wallet(broker!),
    enabled: Boolean(broker),
    staleTime: 15_000,
    retry: false,
    refetchInterval: 30_000,
  });
}

/**
 * One idempotency key per order INTENT (the F&O ticket's pattern, not the equity web
 * ticket's key-per-click). Minted when the user opens the review, reused for every retry
 * of that confirmation, and discarded on success, on a definitive (4xx) answer, or when
 * any order field changes. A network error or 5xx keeps it, so retrying can't double-place.
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
    const definitive = isApiError(error) && error.status >= 400 && error.status < 500;
    if (definitive) keyRef.current = null;
  }, []);

  // Stable identity: callers list this in effect dependencies, and a new object per render
  // would make "discard on field change" fire on every render — losing the key between a
  // failed attempt and its retry, which is exactly what the key exists to prevent.
  return useMemo(() => ({ begin, discard, settle }), [begin, discard, settle]);
}

export interface LiveTradingOptions {
  /** Live trading is on, the kill switch is off, and at least one broker can trade. */
  available: boolean;
  /** Every connected broker that can trade live, mStock first. */
  brokers: LiveBroker[];
  /** Why live trading can't be used — shown instead of a dead control. */
  reason: string | null;
  isLoading: boolean;
  labelOf: (broker: LiveBroker) => string;
}

/**
 * The live-broker choice for the order ticket: like useLiveTradingAvailability, but every
 * connected live-capable broker rather than the first (the web ticket lets you pick mStock
 * or Groww). Until the static catalog arrives, both brokers are assumed live-capable so the
 * wallet read isn't held up — the server refuses an order to a broker that can't trade.
 */
export function useLiveTradingOptions(): LiveTradingOptions {
  const { resolution, isLoading } = useLiveTradingResolution();

  return useMemo(
    () => ({
      available: !isLoading && resolution.brokers.length > 0,
      brokers: isLoading ? [] : resolution.brokers,
      reason: isLoading ? null : resolution.reason,
      isLoading,
      labelOf: (broker: LiveBroker) => resolution.labelOf(broker),
    }),
    [resolution, isLoading],
  );
}

/**
 * The user's real orders placed through this app. Polls every 3s while one is still in
 * flight (the server reconciles against the broker on each read, so a fill shows within
 * seconds), gently otherwise, and not at all once the market is shut with nothing working.
 * When an order's status or fill moves, the holdings and wallet behind it moved too.
 */
export function useLiveOrders(limit = 50, enabled = true) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: tradingKeys.liveOrders(limit),
    queryFn: () => liveTradingApi.orders(limit),
    enabled,
    staleTime: 5_000,
    retry: false,
    refetchInterval: (q) =>
      q.state.data?.some((order) => IN_FLIGHT.has(order.status))
        ? 3_000
        : livePriceInterval(15_000),
  });

  const seen = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!query.data) return;
    const { changed, next } = ordersMoved(seen.current, query.data);
    seen.current = next;
    if (changed) {
      void queryClient.invalidateQueries({ queryKey: portfolioKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['live-trading', 'wallet'] });
    }
  }, [query.data, queryClient]);

  return query;
}

export function useLiveOrderMutations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
    ]);
  return {
    modify: useMutation({
      mutationFn: ({ id, changes }: { id: string; changes: ModifyLiveOrderInput }) =>
        liveTradingApi.modifyOrder(id, changes),
      onSettled: refresh,
    }),
    cancel: useMutation({
      mutationFn: (id: string) => liveTradingApi.cancelOrder(id),
      onSettled: refresh,
    }),
  };
}

export function useBrokerMutations() {
  const queryClient = useQueryClient();
  const refreshAll = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tradingKeys.connections }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
    ]);

  return {
    connectMstock: useMutation({
      mutationFn: (payload: MstockConnectPayload) => brokersApi.connectMstock(payload),
      onSettled: refreshAll,
    }),
    verifyMstock: useMutation({
      mutationFn: (code: string) => brokersApi.verifyMstock(code),
      onSettled: refreshAll,
    }),
    reconnectMstock: useMutation({
      mutationFn: () => brokersApi.reconnect('mstock'),
      onSettled: refreshAll,
    }),
    /** mStock sends the day's code; Groww re-mints its token from the stored key and secret. */
    reconnect: useMutation({
      mutationFn: (broker: string) => brokersApi.reconnect(broker),
      onSettled: refreshAll,
    }),
    connectApiKey: useMutation({
      mutationFn: ({ broker, payload }: { broker: string; payload: ApiKeyTotpConnectPayload }) =>
        brokersApi.connectApiKey(broker, payload),
      onSettled: refreshAll,
    }),
    disconnect: useMutation({
      mutationFn: (broker: string) => brokersApi.disconnect(broker),
      onSettled: refreshAll,
    }),
  };
}
