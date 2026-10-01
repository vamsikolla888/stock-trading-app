import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { marketKeys } from '@/features/market/hooks';
import { pollInterval } from '@/features/strategies/lib/polling';

import { screenersApi } from './api';
import { isScanActive } from './lib/scans';
import type { CustomScreener, CustomScreenerInput } from './types';

/** Scan output only changes when a scan runs, so there is nothing to gain from polling hard. */
const SCREENER_STALE_MS = 5 * 60_000;
const DETAIL_LIMIT = 200;

/** Same shapes as the web client's keys. The built-in LIST is marketKeys.screeners(). */
export const screenerKeys = {
  all: ['screeners'] as const,
  builtIn: (id: string, limit: number) => ['screeners', 'detail', id, limit] as const,
  custom: ['screeners', 'custom'] as const,
  customList: ['screeners', 'custom', 'list'] as const,
  customDetail: (id: string, limit: number) =>
    ['screeners', 'custom', 'detail', id, limit] as const,
  status: ['screeners', 'status'] as const,
};

function refreshAll(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({
    queryKey: screenerKeys.all,
    // The status poll invalidates from inside its own fetch; re-triggering it there would loop.
    predicate: (query) => !query.queryKey.includes('status'),
  });
  void queryClient.invalidateQueries({ queryKey: marketKeys.screeners() });
}

export function useBuiltInScreener(id: string, enabled = true, limit = 100) {
  return useQuery({
    queryKey: screenerKeys.builtIn(id, limit),
    queryFn: () => screenersApi.builtIn(id, limit),
    enabled: enabled && id.length > 0,
    staleTime: SCREENER_STALE_MS,
    placeholderData: keepPreviousData,
  });
}

/** The shared library. Polls only while one of its screeners is being scanned. */
export function useCustomScreeners() {
  return useQuery({
    queryKey: screenerKeys.customList,
    queryFn: screenersApi.customList,
    staleTime: SCREENER_STALE_MS,
    refetchInterval: (query) =>
      query.state.data?.some((screener) => isScanActive(screener))
        ? pollInterval(query.state.error, 5_000)
        : false,
  });
}

/**
 * One screener with its matches. While a scan is in flight it polls itself — the screener's
 * `runState` is the answer now — and on the scanning → settled transition refreshes the list,
 * which is what makes the new matches appear without a reload.
 */
export function useCustomScreener(id: string, enabled = true, limit = DETAIL_LIMIT) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: screenerKeys.customDetail(id, limit),
    queryFn: async () => {
      const before = queryClient.getQueryData<CustomScreener>(screenerKeys.customDetail(id, limit));
      const screener = await screenersApi.custom(id, limit);
      if (isScanActive(before) && !isScanActive(screener)) {
        void queryClient.invalidateQueries({ queryKey: screenerKeys.customList });
      }
      return screener;
    },
    enabled: enabled && id.length > 0,
    staleTime: 30_000,
    refetchInterval: (query) =>
      isScanActive(query.state.data) ? pollInterval(query.state.error, 2_500) : false,
  });
}

export function useCreateCustomScreener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomScreenerInput) => screenersApi.create(body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: screenerKeys.custom }),
  });
}

export function useUpdateCustomScreener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CustomScreenerInput>) => screenersApi.update(id, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: screenerKeys.custom }),
  });
}

export function useDuplicateCustomScreener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => screenersApi.duplicate(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: screenerKeys.customList }),
  });
}

export function useDeleteCustomScreener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => screenersApi.remove(id),
    onSuccess: (_result, id) => {
      // Dropped, not refetched: re-reading a deleted screener would only produce a 404.
      queryClient.removeQueries({ queryKey: ['screeners', 'custom', 'detail', id] });
      void queryClient.invalidateQueries({ queryKey: screenerKeys.customList });
    },
  });
}

/**
 * Queues a scan of one screener. The answer carries the screener's new state (queued), written
 * into the detail at once — which starts the detail's own polling.
 */
export function useRunCustomScan(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => screenersApi.runCustomScan(id),
    onSuccess: (result) => {
      if (result.screener) {
        const fresh = result.screener;
        queryClient.setQueryData<CustomScreener>(
          screenerKeys.customDetail(id, DETAIL_LIMIT),
          (old) => (old ? { ...old, ...fresh, matches: fresh.matches ?? old.matches } : old),
        );
      }
      void queryClient.invalidateQueries({ queryKey: screenerKeys.custom });
    },
  });
}

export function useRunAllScans(options: { onQueued?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: screenersApi.runAll,
    onSuccess: () => {
      refreshAll(queryClient);
      void queryClient.invalidateQueries({ queryKey: screenerKeys.status });
      options.onQueued?.();
    },
  });
}

/**
 * The built-in scan's and the library sweep's state (GET /screeners/status), answered from
 * their OWN jobs — the old counters summed the whole queue and spun forever. Polls while either
 * half runs; on the transition to idle it refreshes every screener read.
 */
export function useScreenerScanStatus(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: screenerKeys.status,
    queryFn: async () => {
      const status = await screenersApi.status();
      if (!status.running) refreshAll(queryClient);
      return status;
    },
    enabled,
    refetchInterval: (query) =>
      query.state.data?.running ? pollInterval(query.state.error, 3_000) : false,
  });
}
