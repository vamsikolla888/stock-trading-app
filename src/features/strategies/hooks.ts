import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';

import { insightKeys } from '@/features/insights/api';

import { strategiesApi } from './api';
import { pollInterval, retryOnceIfTransient } from './lib/polling';
import type { CreateStrategyBody, StartGenerationInput, UpdateStrategyBody } from './types';

/** Backtest results only change when a backtest runs, so polling hard gains nothing. */
const STRATEGY_STALE_MS = 60_000;

/** Same shapes as the web client's keys, so list/detail/matrix share cache entries. */
export const strategyKeys = {
  all: ['strategies'] as const,
  list: ['strategies', 'list'] as const,
  templates: ['strategies', 'templates'] as const,
  catalog: ['strategies', 'catalog'] as const,
  packs: ['strategies', 'packs'] as const,
  detail: (id: string) => ['strategies', 'detail', id] as const,
  backtestStatus: (id: string) => ['strategies', 'backtest-status', id] as const,
  generation: (id: string | null) => ['strategies', 'generation', id] as const,
  matches: (id: string, limit: number) => ['strategies', id, 'matches', limit] as const,
  pairing: (id: string) => ['strategies', id, 'screeners'] as const,
  indices: ['indices', 'list'] as const,
};

export function useStrategiesList() {
  return useQuery({
    queryKey: strategyKeys.list,
    queryFn: strategiesApi.list,
    staleTime: STRATEGY_STALE_MS,
  });
}

/** Static server-side data (changes only with a deploy). */
export function useStrategyTemplates() {
  return useQuery({
    queryKey: strategyKeys.templates,
    queryFn: strategiesApi.templates,
    staleTime: Infinity,
  });
}

export function useStrategyCatalog() {
  return useQuery({
    queryKey: strategyKeys.catalog,
    queryFn: strategiesApi.catalog,
    staleTime: Infinity,
  });
}

export function useStrategyPacks(enabled = true) {
  return useQuery({
    queryKey: strategyKeys.packs,
    queryFn: strategiesApi.packs,
    staleTime: Infinity,
    enabled,
  });
}

export function useIndexCatalog() {
  return useQuery({
    queryKey: strategyKeys.indices,
    queryFn: strategiesApi.indices,
    staleTime: 60 * 60_000,
  });
}

export function useStrategy(id: string | undefined) {
  return useQuery({
    queryKey: strategyKeys.detail(id ?? ''),
    queryFn: () => strategiesApi.detail(id!),
    enabled: Boolean(id),
    staleTime: STRATEGY_STALE_MS,
  });
}

/** One hook for many details (the matrix) — never a loop of useStrategy calls. */
export function useStrategyDetails(ids: readonly string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: strategyKeys.detail(id),
      queryFn: () => strategiesApi.detail(id),
      staleTime: STRATEGY_STALE_MS,
    })),
  });
}

function useInvalidateLists() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: strategyKeys.list }),
      queryClient.invalidateQueries({ queryKey: insightKeys.strategies }),
    ]);
}

export function useCreateStrategy() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (body: CreateStrategyBody) => strategiesApi.create(body),
    onSuccess: () => void invalidate(),
  });
}

export function useUpdateStrategy(id: string) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (body: UpdateStrategyBody) => strategiesApi.update(id, body),
    onSuccess: (saved) => {
      queryClient.setQueryData(strategyKeys.detail(id), saved);
      void invalidate();
      void queryClient.invalidateQueries({ queryKey: strategyKeys.detail(id) });
    },
  });
}

export function useDeleteStrategy() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (id: string) => strategiesApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: strategyKeys.detail(id) });
      void invalidate();
    },
  });
}

/**
 * `onQueued` fires only once the server has accepted the job — the earliest moment status
 * polling can tell the truth (flipping a flag on tap could see "not running" and stop). The
 * status read is invalidated too, so an idle poll from an earlier run re-asks now.
 */
export function useRunBacktest(id: string, options: { onQueued?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => strategiesApi.runBacktest(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: strategyKeys.detail(id) });
      void queryClient.invalidateQueries({ queryKey: strategyKeys.backtestStatus(id) });
      options.onQueued?.();
    },
  });
}

/**
 * Polls while a backtest is in flight; on the transition to finished it refreshes the
 * detail and list, which is what makes the results appear without a manual reload.
 */
export function useBacktestStatus(id: string | undefined, enabled: boolean) {
  const invalidate = useInvalidateLists();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: strategyKeys.backtestStatus(id ?? ''),
    queryFn: async () => {
      const status = await strategiesApi.backtestStatus(id!);
      if (!status.running) {
        void queryClient.invalidateQueries({ queryKey: strategyKeys.detail(id!) });
        void invalidate();
      }
      return status;
    },
    enabled: enabled && Boolean(id),
    refetchInterval: (query) =>
      query.state.data?.running ? pollInterval(query.state.error, 2_500) : false,
  });
}

export function useStartGeneration() {
  return useMutation({
    mutationFn: (body: StartGenerationInput) => strategiesApi.startGeneration(body),
  });
}

/** Polls a generation run until it settles, then refreshes the strategy and screener lists. */
export function useGeneration(id: string | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: strategyKeys.generation(id),
    queryFn: async () => {
      const generation = await strategiesApi.generation(id!);
      if (generation.status === 'complete' || generation.status === 'failed') {
        void queryClient.invalidateQueries({ queryKey: strategyKeys.list });
        void queryClient.invalidateQueries({ queryKey: ['screeners', 'custom'] });
      }
      return generation;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'complete' || status === 'failed') return false;
      // A run that answers 404 (or any 4xx) will never settle — without this the sheet
      // would poll it every two seconds for as long as the screen stays mounted.
      return pollInterval(query.state.error, 2_000);
    },
  });
}

/** Gated: evaluating the entry across the universe is a multi-second server pass. */
export function useStrategyMatches(id: string | undefined, enabled: boolean, limit = 25) {
  return useQuery({
    queryKey: strategyKeys.matches(id ?? '', limit),
    queryFn: () => strategiesApi.matches(id!, limit),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60_000,
    // Tight per-user limit (10/min): a 429 or 404 retried is a second one.
    retry: retryOnceIfTransient,
  });
}

/** Gated for the same reason, and because the explanations spend an AI call. */
export function useStrategyPairing(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: strategyKeys.pairing(id ?? ''),
    queryFn: () => strategiesApi.pairing(id!),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60_000,
    retry: retryOnceIfTransient,
  });
}
