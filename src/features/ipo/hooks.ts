import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ipoApi } from './api';
import type { IpoListFilter, IpoReportKind, IpoReports } from './types';

/** The board is re-synced from the source every ten minutes; five minutes stale costs nothing. */
const STALE_MS = 5 * 60_000;

export const ipoKeys = {
  all: ['ipo'] as const,
  list: (filter: IpoListFilter) => ['ipo', 'list', filter] as const,
  liveGmp: ['ipo', 'gmp', 'live'] as const,
  detail: (id: string) => ['ipo', 'detail', id] as const,
  gmpHistory: (id: string) => ['ipo', 'gmp-history', id] as const,
  analytics: (id: string) => ['ipo', 'analytics', id] as const,
  reports: (id: string) => ['ipo', 'reports', id] as const,
};

export function useIpoList(filter: IpoListFilter, enabled = true) {
  return useQuery({
    queryKey: ipoKeys.list(filter),
    queryFn: ({ signal }) => ipoApi.list(filter, signal),
    enabled,
    staleTime: STALE_MS,
  });
}

export function useLiveGmp() {
  return useQuery({
    queryKey: ipoKeys.liveGmp,
    queryFn: ({ signal }) => ipoApi.liveGmp(signal),
    staleTime: STALE_MS,
  });
}

export function useIpoDetail(id: string) {
  return useQuery({
    queryKey: ipoKeys.detail(id),
    queryFn: ({ signal }) => ipoApi.detail(id, signal),
    enabled: id.length > 0,
    staleTime: STALE_MS,
  });
}

export function useIpoGmpHistory(id: string) {
  return useQuery({
    queryKey: ipoKeys.gmpHistory(id),
    queryFn: ({ signal }) => ipoApi.gmpHistory(id, signal),
    enabled: id.length > 0,
    staleTime: STALE_MS,
  });
}

export function useIpoAnalytics(id: string) {
  return useQuery({
    queryKey: ipoKeys.analytics(id),
    queryFn: ({ signal }) => ipoApi.analytics(id, signal),
    enabled: id.length > 0,
    staleTime: STALE_MS,
  });
}

/** True while either report is being prepared. */
export function reportsInProgress(data: IpoReports | undefined): boolean {
  return [data?.preListing?.status, data?.postListing?.status].some(
    (status) => status === 'queued' || status === 'running',
  );
}

/**
 * Both research reports. Polled every 5 s while one is being prepared (its stage moves through
 * searching → deep read → writing), else every 2 minutes so a scheduled run that lands while the
 * screen is open shows up. Polling pauses in the background (focusManager).
 */
export function useIpoReports(id: string) {
  return useQuery({
    queryKey: ipoKeys.reports(id),
    queryFn: ({ signal }) => ipoApi.reports(id, signal),
    enabled: id.length > 0,
    staleTime: 30_000,
    refetchInterval: (query) => (reportsInProgress(query.state.data) ? 5_000 : 120_000),
  });
}

export function useRequestIpoReport(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (kind: IpoReportKind) => ipoApi.requestReport(id, kind),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ipoKeys.reports(id) }),
        queryClient.invalidateQueries({ queryKey: ipoKeys.detail(id) }),
      ]),
  });
}
