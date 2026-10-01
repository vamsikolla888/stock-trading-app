import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { insightKeys } from '@/features/insights/api';
import { useDebounce } from '@/hooks/useDebounce';

import { strategiesApi } from './api';
import { isRunActive } from './lib/backtest';
import { pollInterval, retryOnceIfTransient } from './lib/polling';
import {
  isGenerationActive,
  type CreateStrategyBody,
  type StartGenerationInput,
  type StrategyDetail,
  type StrategyRules,
  type StrategySummary,
  type UpdateStrategyBody,
} from './types';

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
  generation: (id: string | null) => ['strategies', 'generation', id] as const,
  generations: ['strategies', 'generations'] as const,
  preview: (signature: string) => ['strategies', 'preview', signature] as const,
  matches: (id: string, limit: number) => ['strategies', id, 'matches', limit] as const,
  pairing: (id: string) => ['strategies', id, 'screeners'] as const,
  indices: ['indices', 'list'] as const,
};

/** Polls only while some strategy has a backtest in flight, so its card settles by itself. */
export function useStrategiesList() {
  return useQuery({
    queryKey: strategyKeys.list,
    queryFn: strategiesApi.list,
    staleTime: STRATEGY_STALE_MS,
    refetchInterval: (query) =>
      query.state.data?.some((strategy) => isRunActive(strategy))
        ? pollInterval(query.state.error, 5_000)
        : false,
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

/**
 * One strategy. While its backtest is in flight (`runState.active`) it polls itself — there is
 * no separate status endpoint any more — and on the running → settled transition it refreshes
 * the lists, which is what makes the new numbers appear everywhere without a reload.
 */
export function useStrategy(id: string | undefined) {
  const queryClient = useQueryClient();
  const invalidateLists = useInvalidateLists();
  return useQuery({
    queryKey: strategyKeys.detail(id ?? ''),
    queryFn: async () => {
      const before = queryClient.getQueryData<StrategyDetail>(strategyKeys.detail(id!));
      const detail = await strategiesApi.detail(id!);
      if (isRunActive(before) && !isRunActive(detail)) void invalidateLists();
      return detail;
    },
    enabled: Boolean(id),
    staleTime: STRATEGY_STALE_MS,
    refetchInterval: (query) =>
      isRunActive(query.state.data) ? pollInterval(query.state.error, 2_500) : false,
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

/** A copy with the same rules and settings, and no results. */
export function useDuplicateStrategy() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: (id: string) => strategiesApi.duplicate(id),
    onSuccess: () => void invalidate(),
  });
}

/** Queues every strategy whose results are missing, failed or stale (30 per press). */
export function useRunStaleBacktests() {
  const invalidate = useInvalidateLists();
  return useMutation({
    mutationFn: strategiesApi.runStale,
    onSuccess: () => void invalidate(),
  });
}

/**
 * The builder's live check: the draft rules, debounced, sent to /strategies/preview — issues
 * with their paths, lint ("RSI > 0 is always true") and the readback in the server's words.
 * A write-nothing POST keyed on the rules, so identical drafts share one answer.
 */
export function useRulesPreview(rules: StrategyRules | null) {
  const signature = useDebounce(rules ? JSON.stringify(rules) : '', 450);
  return useQuery({
    queryKey: strategyKeys.preview(signature),
    queryFn: ({ signal }) => strategiesApi.preview(JSON.parse(signature) as unknown, signal),
    enabled: signature !== '',
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    retry: false,
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
 * Queues a backtest. The answer carries the strategy's new state (queued, `runState.active`),
 * which is written into the detail at once — that is what starts the detail's own polling, and
 * what makes the Run button read "running" without waiting for a refetch.
 */
export function useRunBacktest(id: string) {
  const queryClient = useQueryClient();
  const invalidateLists = useInvalidateLists();
  return useMutation({
    mutationFn: () => strategiesApi.runBacktest(id),
    onSuccess: (result) => {
      const summary: StrategySummary | undefined = result.strategy;
      if (summary) {
        queryClient.setQueryData<StrategyDetail>(strategyKeys.detail(id), (old) =>
          old ? { ...old, ...summary } : old,
        );
      }
      void queryClient.invalidateQueries({ queryKey: strategyKeys.detail(id) });
      void invalidateLists();
    },
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
      if (!isGenerationActive(generation.status)) {
        void queryClient.invalidateQueries({ queryKey: strategyKeys.list });
        void queryClient.invalidateQueries({ queryKey: ['screeners', 'custom'] });
      }
      return generation;
    },
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && !isGenerationActive(status)) return false;
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

/**
 * Gated for the same reason. The AI "why" sentences are opt-in server-side now; they are asked
 * for here because this screen shows them, and the query is only enabled on request.
 */
export function useStrategyPairing(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: strategyKeys.pairing(id ?? ''),
    queryFn: () => strategiesApi.pairing(id!, true),
    enabled: enabled && Boolean(id),
    staleTime: 5 * 60_000,
    retry: retryOnceIfTransient,
  });
}

/** Saves a kept candidate beyond the count asked for; refreshes both libraries. */
export function useSaveCandidate(generationId: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (index: number) => strategiesApi.saveCandidate(generationId!, index),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: strategyKeys.generation(generationId) });
      void queryClient.invalidateQueries({ queryKey: strategyKeys.list });
      void queryClient.invalidateQueries({ queryKey: ['screeners', 'custom'] });
    },
  });
}
