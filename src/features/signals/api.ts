import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';

import { insightKeys } from '@/features/insights/api';
import { apiClient } from '@/services/api/client';

import { normalizeReliability, normalizeSignals, normalizeSignalStatus } from './lib/normalize';
import type { ReliabilityResponse, SignalsResponse, SignalStatusResponse } from './types';

// Endpoints: server/src/modules/signals/signal.routes.ts (spec: docs/specs/signal.routes.yaml).

export const signalsApi = {
  /** The whole day at once; the screen filters on the phone so its lead setup never disappears. */
  async list(signal?: AbortSignal): Promise<SignalsResponse> {
    const { data } = await apiClient.get<unknown>('/signals', { signal });
    return normalizeSignals(data);
  },
  async reliability(signal?: AbortSignal): Promise<ReliabilityResponse> {
    const { data } = await apiClient.get<unknown>('/signals/reliability', { signal });
    return normalizeReliability(data);
  },
  async status(signal?: AbortSignal): Promise<SignalStatusResponse> {
    const { data } = await apiClient.get<unknown>('/signals/status', { signal });
    return normalizeSignalStatus(data);
  },
  async generate(): Promise<{ enqueued: boolean }> {
    const { data } = await apiClient.post<{ enqueued?: boolean }>('/signals/generate');
    return { enqueued: data?.enqueued === true };
  },
  async measure(): Promise<{ enqueued: boolean }> {
    const { data } = await apiClient.post<{ enqueued?: boolean }>('/signals/reliability/measure');
    return { enqueued: data?.enqueued === true };
  },
};

// `day` and `jobs` are new keys (2026-10-08): a cache persisted under the old list and status
// keys holds the older shapes, and a restored cache bypasses the normalizers.
export const signalKeys = {
  all: ['signals'] as const,
  day: ['signals', 'day'] as const,
  reliability: ['signals', 'reliability'] as const,
  status: ['signals', 'jobs'] as const,
};

/** While a job runs the status is polled this often; idle, it is read once per visit. */
const RUNNING_POLL_MS = 5_000;

export function useSignalDay() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: signalKeys.day,
    queryFn: ({ signal }) => signalsApi.list(signal),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    subscribed: focused,
  });
}

/** Reliability is a property of the rule, not of today — it moves weekly at most. */
export function useSignalReliability(enabled: boolean) {
  return useQuery({
    queryKey: signalKeys.reliability,
    queryFn: ({ signal }) => signalsApi.reliability(signal),
    staleTime: 60 * 60_000,
    enabled,
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

/**
 * Job health and gate health: "nothing qualified" and "the job never ran" look identical without
 * it. Polled only while a job runs and the screen is in view; when a run finishes, the day's
 * signals (or the reliability table) are re-read.
 */
export function useSignalStatus() {
  const focused = useIsFocused();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: signalKeys.status,
    queryFn: ({ signal }) => signalsApi.status(signal),
    staleTime: 60_000,
    refetchInterval: (q) =>
      q.state.data?.generation.running || q.state.data?.reliability.running
        ? RUNNING_POLL_MS
        : false,
    subscribed: focused,
  });

  const generating = query.data?.generation.running ?? false;
  const measuring = query.data?.reliability.running ?? false;
  const previous = useRef({ generating, measuring });
  useEffect(() => {
    const was = previous.current;
    previous.current = { generating, measuring };
    if (was.generating && !generating) {
      void queryClient.invalidateQueries({ queryKey: signalKeys.day });
      void queryClient.invalidateQueries({ queryKey: insightKeys.signals });
    }
    if (was.measuring && !measuring) {
      void queryClient.invalidateQueries({ queryKey: signalKeys.reliability });
    }
  }, [generating, measuring, queryClient]);

  return query;
}

export function useGenerateSignals() {
  const invalidate = useInvalidateSignals();
  return useMutation({ mutationFn: signalsApi.generate, onSuccess: invalidate });
}

export function useMeasureReliability() {
  const invalidate = useInvalidateSignals();
  return useMutation({ mutationFn: signalsApi.measure, onSuccess: invalidate });
}
