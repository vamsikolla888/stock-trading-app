import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

import { nextDayApi } from './api';
import { reportPollMs } from './lib/view';
import type { NextDayAction, ReportDocument } from './types';

/**
 * The report changes once an evening (18:00–21:45 IST) and its morning check from 09:20 to 10:15,
 * so it is re-read every five minutes inside those windows only, and only while the screen is
 * focused. The library and the track record move once a session: cached for fifteen minutes.
 */
const FIVE = 5 * 60_000;
const FIFTEEN = 15 * 60_000;
/** A full report is large: dropped soon after the screen closes, so cold starts never parse it. */
const SHORT_GC_MS = 15 * 60_000;

export const nextDayKeys = {
  all: ['next-day'] as const,
  report: (date: string | null) => ['next-day', 'report', date ?? 'latest'] as const,
  reports: ['next-day', 'reports'] as const,
  library: ['next-day', 'library'] as const,
  trackRecord: (days: number) => ['next-day', 'track-record', days] as const,
  status: ['next-day', 'status'] as const,
};

export function useIsAdmin(): boolean {
  return useAuthStore((state) => state.user?.role === 'admin');
}

/** The latest report already in the cache, when it is the session asked for. */
export function cachedReport(client: QueryClient, date: string | null): ReportDocument | undefined {
  if (!date) return undefined;
  const latest = client.getQueryData<ReportDocument | null>(nextDayKeys.report(null));
  return latest && latest.date === date ? latest : undefined;
}

/** The newest report (`date` null) or one session's. Resolves null when there is none yet. */
export function useNextDayReport(date: string | null) {
  const focused = useIsFocused();
  const client = useQueryClient();
  return useQuery({
    queryKey: nextDayKeys.report(date),
    queryFn: ({ signal }) => nextDayApi.report(date, signal),
    staleTime: date ? FIFTEEN : 60_000,
    gcTime: SHORT_GC_MS,
    placeholderData: (previous) => cachedReport(client, date) ?? (date ? previous : undefined),
    refetchInterval: () => (date ? false : reportPollMs()),
    subscribed: focused,
  });
}

export function useNextDayReports(enabled = true) {
  return useQuery({
    queryKey: nextDayKeys.reports,
    queryFn: ({ signal }) => nextDayApi.reports(signal),
    enabled,
    staleTime: FIVE,
  });
}

export function useNextDayLibrary() {
  return useQuery({
    queryKey: nextDayKeys.library,
    queryFn: ({ signal }) => nextDayApi.library(signal),
    staleTime: FIFTEEN,
    gcTime: SHORT_GC_MS,
  });
}

export function useNextDayTrackRecord(days = 30) {
  return useQuery({
    queryKey: nextDayKeys.trackRecord(days),
    queryFn: ({ signal }) => nextDayApi.trackRecord(days, signal),
    staleTime: FIFTEEN,
    placeholderData: keepPreviousData,
  });
}

export function useNextDayStatus(enabled = true) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: nextDayKeys.status,
    queryFn: ({ signal }) => nextDayApi.status(signal),
    enabled,
    staleTime: 60_000,
    refetchInterval: () => reportPollMs(),
    subscribed: focused,
  });
}

/** Admin: run / backfill / re-measure / morning check now (queued on the screener worker). */
export function useNextDayAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ action, body }: { action: NextDayAction; body?: Record<string, unknown> }) =>
      nextDayApi.action(action, body),
    onSuccess: () => client.invalidateQueries({ queryKey: nextDayKeys.status }),
  });
}
