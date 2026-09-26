import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { portfolioKeys } from '@/features/portfolio/keys';
import { tradingKeys } from '@/features/trading/hooks';

import { settingsApi } from './api';
import type { MarketDataProvider } from './types';

export const settingsKeys = {
  pushDevices: ['notifications', 'devices'] as const,
  marketDataProvider: ['brokers', 'market-data-provider'] as const,
  growwToken: ['brokers', 'groww-token'] as const,
};

export function usePushDevices() {
  return useQuery({
    queryKey: settingsKeys.pushDevices,
    queryFn: settingsApi.pushDevices,
    staleTime: 5 * 60_000,
  });
}

export function useSendPushTest() {
  return useMutation({ mutationFn: settingsApi.sendPushTest });
}

export function useMarketDataProvider() {
  return useQuery({
    queryKey: settingsKeys.marketDataProvider,
    queryFn: settingsApi.marketDataProvider,
    staleTime: 5 * 60_000,
  });
}

export function useSetMarketDataProvider() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (provider: MarketDataProvider) => settingsApi.setMarketDataProvider(provider),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: settingsKeys.marketDataProvider }),
  });
}

/** Polled each minute while shown: the expiry countdown and the 06:01 job's result land unaided. */
export function useGrowwToken(enabled: boolean) {
  return useQuery({
    queryKey: settingsKeys.growwToken,
    queryFn: settingsApi.growwToken,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** A (re)connection or a fresh token changes what every broker-backed screen can read. */
function useInvalidateBrokerData() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: tradingKeys.connections }),
      queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
      queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
      queryClient.invalidateQueries({ queryKey: ['fno'] }),
    ]);
}

export function useRefreshGrowwToken() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateBrokerData();
  return useMutation({
    mutationFn: settingsApi.refreshGrowwToken,
    onSuccess: (data) => {
      queryClient.setQueryData(settingsKeys.growwToken, data.status);
      void invalidate();
    },
  });
}

export function useReconnectBroker() {
  const invalidate = useInvalidateBrokerData();
  return useMutation({
    mutationFn: (broker: string) => settingsApi.reconnectBroker(broker),
    onSettled: () => invalidate(),
  });
}
