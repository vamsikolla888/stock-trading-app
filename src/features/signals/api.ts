import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { insightKeys } from '@/features/insights/api';
import { apiClient } from '@/services/api/client';

import type {
  ReliabilityResponse,
  SignalAction,
  SignalsResponse,
  SignalStatusResponse,
} from './types';

export interface SignalFilters {
  qualifiedOnly?: boolean;
  action?: SignalAction;
}

export const signalsApi = {
  async list(filters: SignalFilters = {}): Promise<SignalsResponse> {
    const { data } = await apiClient.get<SignalsResponse>('/signals', {
      // The server coerces any present value to true, so the flag is omitted when off.
      params: {
        ...(filters.qualifiedOnly ? { qualifiedOnly: 'true' } : {}),
        ...(filters.action ? { action: filters.action } : {}),
      },
    });
    return data;
  },
  async reliability(): Promise<ReliabilityResponse> {
    const { data } = await apiClient.get<ReliabilityResponse>('/signals/reliability');
    return data;
  },
  async status(): Promise<SignalStatusResponse> {
    const { data } = await apiClient.get<SignalStatusResponse>('/signals/status');
    return data;
  },
  async generate(): Promise<{ enqueued: boolean }> {
    const { data } = await apiClient.post<{ enqueued: boolean }>('/signals/generate');
    return data;
  },
  async measure(): Promise<{ enqueued: boolean }> {
    const { data } = await apiClient.post<{ enqueued: boolean }>('/signals/reliability/measure');
    return data;
  },
};

export const signalKeys = {
  all: ['signals'] as const,
  list: (filters: SignalFilters) =>
    ['signals', 'list', filters.qualifiedOnly ?? false, filters.action ?? 'all'] as const,
  reliability: ['signals', 'reliability'] as const,
  status: ['signals', 'status'] as const,
};

export function useSignalList(filters: SignalFilters) {
  return useQuery({
    queryKey: signalKeys.list(filters),
    queryFn: () => signalsApi.list(filters),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** Reliability is a property of the rule, not of today — it moves weekly at most. */
export function useSignalReliability(enabled: boolean) {
  return useQuery({
    queryKey: signalKeys.reliability,
    queryFn: signalsApi.reliability,
    staleTime: 60 * 60_000,
    enabled,
  });
}

/** Gate health: "nothing qualified" and "the job never ran" look identical without it. */
export function useSignalStatus() {
  return useQuery({
    queryKey: signalKeys.status,
    queryFn: signalsApi.status,
    staleTime: 60_000,
  });
}

/** Home's "today" strip reads signals through its own key, so it is refreshed alongside. */
function useInvalidateSignals() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: signalKeys.all });
    void queryClient.invalidateQueries({ queryKey: insightKeys.signals });
  };
}

export function useGenerateSignals() {
  const invalidate = useInvalidateSignals();
  return useMutation({ mutationFn: signalsApi.generate, onSuccess: invalidate });
}

export function useMeasureReliability() {
  const invalidate = useInvalidateSignals();
  return useMutation({ mutationFn: signalsApi.measure, onSuccess: invalidate });
}
