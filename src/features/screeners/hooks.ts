import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { marketKeys } from '@/features/market/hooks';

import { screenersApi } from './api';
import type { CustomScreenerInput } from './types';

/** Scan output only changes when a scan runs, so there is nothing to gain from polling hard. */
const SCREENER_STALE_MS = 5 * 60_000;

/** Same shapes as the web client's keys. The built-in LIST is marketKeys.screeners(). */
export const screenerKeys = {
  all: ['screeners'] as const,
  builtIn: (id: string, limit: number) => ['screeners', 'detail', id, limit] as const,
  custom: ['screeners', 'custom'] as const,
  customList: ['screeners', 'custom', 'list'] as const,
  customDetail: (id: string, limit: number) =>
    ['screeners', 'custom', 'detail', id, limit] as const,
  customScanStatus: (id: string) => ['screeners', 'custom', 'scan-status', id] as const,
  allScansStatus: ['screeners', 'scan-all-status'] as const,
};

/**
 * Refreshes screener data but never the scan-status polls themselves: those invalidate from
 * inside their own fetch, and re-triggering them there would loop.
 */
function invalidateScreenerData(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
) {
  return queryClient.invalidateQueries({
    queryKey,
    predicate: (query) =>
      !query.queryKey.includes('scan-status') && !query.queryKey.includes('scan-all-status'),
  });
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

export function useCustomScreeners() {
  return useQuery({
    queryKey: screenerKeys.customList,
    queryFn: screenersApi.customList,
    staleTime: SCREENER_STALE_MS,
  });
}

export function useCustomScreener(id: string, enabled = true, limit = 200) {
  return useQuery({
    queryKey: screenerKeys.customDetail(id, limit),
    queryFn: () => screenersApi.custom(id, limit),
    enabled: enabled && id.length > 0,
    staleTime: 30_000,
  });
}

export function useCreateCustomScreener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CustomScreenerInput) => screenersApi.create(body),
    onSuccess: () => void invalidateScreenerData(queryClient, screenerKeys.custom),
  });
}

export function useUpdateCustomScreener(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<CustomScreenerInput>) => screenersApi.update(id, body),
    onSuccess: () => void invalidateScreenerData(queryClient, screenerKeys.custom),
  });
}

export function useDeleteCustomScreener() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => screenersApi.remove(id),
    onSuccess: (_result, id) => {
      // Dropped, not refetched: re-reading a deleted screener would only produce a 404.
      queryClient.removeQueries({ queryKey: ['screeners', 'custom', 'detail', id] });
      queryClient.removeQueries({ queryKey: screenerKeys.customScanStatus(id) });
      void invalidateScreenerData(queryClient, screenerKeys.customList);
    },
  });
}

/**
 * `onQueued` fires only after the server accepted the job — see useRunBacktest. The status
 * read is re-asked too, so an idle poll left over from an earlier scan starts watching again.
 */
export function useRunCustomScan(id: string, options: { onQueued?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => screenersApi.runCustomScan(id),
    onSuccess: () => {
      void invalidateScreenerData(queryClient, screenerKeys.custom);
      void queryClient.invalidateQueries({ queryKey: screenerKeys.customScanStatus(id) });
      options.onQueued?.();
    },
  });
}

export function useCustomScanStatus(id: string, enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: screenerKeys.customScanStatus(id),
    queryFn: async () => {
      const status = await screenersApi.customScanStatus(id);
      // The running → finished transition is what makes the matches appear without a reload.
      if (!status.running) void invalidateScreenerData(queryClient, screenerKeys.custom);
      return status;
    },
    enabled: enabled && id.length > 0,
    refetchInterval: (query) => (query.state.data?.running ? 2_500 : false),
  });
}

function invalidateAllScreeners(queryClient: ReturnType<typeof useQueryClient>) {
  void invalidateScreenerData(queryClient, screenerKeys.all);
  void queryClient.invalidateQueries({ queryKey: marketKeys.screeners() });
}

export function useRunAllScans(options: { onQueued?: () => void } = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: screenersApi.runAll,
    onSuccess: () => {
      invalidateAllScreeners(queryClient);
      void queryClient.invalidateQueries({ queryKey: screenerKeys.allScansStatus });
      options.onQueued?.();
    },
  });
}

export function useAllScansStatus(enabled: boolean) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: screenerKeys.allScansStatus,
    queryFn: async () => {
      const status = await screenersApi.allScansStatus();
      if (!status.running) invalidateAllScreeners(queryClient);
      return status;
    },
    enabled,
    refetchInterval: (query) => (query.state.data?.running ? 3_000 : false),
  });
}
