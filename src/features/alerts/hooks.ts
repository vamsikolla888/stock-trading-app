import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { useTodayPicks } from '@/features/insights/api';
import { useBrokerConnections } from '@/features/trading/hooks';
import { useNow } from '@/hooks/useNow';
import { appStorage } from '@/lib/storage/appStorage';
import { apiClient } from '@/services/api/client';
import { useAuthStore } from '@/store/authStore';

import { deriveAlerts, type DerivedAlert } from './deriveAlerts';

// ── Price alerts (server-stored, re-arm each time the price crosses into the zone) ─────

export type PriceAlertDirection = 'ABOVE' | 'BELOW';

export interface PriceAlert {
  id: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;
  direction: PriceAlertDirection;
  targetPrice: number;
  armed: boolean;
  basePrice: number | null;
  lastTriggeredAt: string | null;
  lastTriggeredPrice: number | null;
  triggerCount: number;
  createdAt: string;
  alreadyMet: boolean;
}

export interface CreatePriceAlertInput {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  direction: PriceAlertDirection;
  targetPrice: number;
}

const priceAlertKeys = { all: ['price-alerts'] as const };

export function usePriceAlerts() {
  return useQuery({
    queryKey: priceAlertKeys.all,
    queryFn: async () => (await apiClient.get<PriceAlert[]>('/alerts')).data,
    staleTime: 30_000,
  });
}

export function useCreatePriceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreatePriceAlertInput) =>
      (await apiClient.post<PriceAlert>('/alerts', input)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: priceAlertKeys.all }),
  });
}

export function useDeletePriceAlert() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/alerts/${encodeURIComponent(id)}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: priceAlertKeys.all }),
  });
}

// ── Derived notifications (the bell) ───────────────────────────────────────────────────

const MAX_READ_IDS = 300;

interface AlertReadState {
  readByUser: Record<string, string[]>;
  markRead: (userId: string, ids: string[]) => void;
}

/** Read state is per device and per user, like the web's localStorage key. */
export const useAlertReadStore = create<AlertReadState>()(
  persist(
    (set) => ({
      readByUser: {},
      markRead: (userId, ids) =>
        set((state) => {
          const current = state.readByUser[userId] ?? [];
          const known = new Set(current);
          // Nothing new read: keep the same state so subscribers and storage stay quiet.
          if (ids.every((id) => known.has(id))) return state;
          const merged = [...new Set([...current, ...ids])].slice(-MAX_READ_IDS);
          return { readByUser: { ...state.readByUser, [userId]: merged } };
        }),
    }),
    { name: 'alert-read-store', storage: createJSONStorage(() => appStorage) },
  ),
);

interface AutoTradeConfigResponse {
  haltedReason: string | null;
  haltedAt: string | null;
}

export function useNotifications(): {
  alerts: DerivedAlert[];
  unreadCount: number;
  isRead: (id: string) => boolean;
  markAllRead: () => void;
  isLoading: boolean;
  refetch: () => Promise<unknown>;
} {
  const userId = useAuthStore((state) => state.user?.id ?? 'anonymous');
  const picks = useTodayPicks();
  const brokers = useBrokerConnections();
  const autoTrade = useQuery({
    queryKey: ['paper', 'autotrade', 'config'],
    queryFn: async () =>
      (await apiClient.get<AutoTradeConfigResponse>('/paper/autotrade/config')).data,
    staleTime: 60_000,
    retry: false,
  });
  const readIds = useAlertReadStore((state) => state.readByUser[userId]);
  const markRead = useAlertReadStore((state) => state.markRead);
  // Session-expiry alerts are relative to now; re-derived each minute so they age on screen.
  const now = useNow();

  const alerts = useMemo(
    () =>
      deriveAlerts({
        recommendations: picks.data?.recommendations ?? [],
        recommendationDate: picks.data?.date ?? null,
        brokers: brokers.data ?? [],
        autoTrade: autoTrade.data ?? null,
        now: new Date(now),
      }),
    [picks.data, brokers.data, autoTrade.data, now],
  );

  const readSet = useMemo(() => new Set(readIds ?? []), [readIds]);
  const unreadCount = alerts.filter(
    (alert) => alert.severity !== 'info' && !readSet.has(alert.id),
  ).length;

  const markAllRead = useCallback(() => {
    if (alerts.length > 0)
      markRead(
        userId,
        alerts.map((alert) => alert.id),
      );
  }, [alerts, markRead, userId]);

  return {
    alerts,
    unreadCount,
    isRead: (id) => readSet.has(id),
    markAllRead,
    isLoading: picks.isPending || brokers.isPending,
    refetch: () => Promise.all([picks.refetch(), brokers.refetch(), autoTrade.refetch()]),
  };
}
