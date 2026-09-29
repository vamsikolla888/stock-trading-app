import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';
import { useCallback, useEffect } from 'react';

import { indicesSocket } from '@/services/realtime/indicesSocket';

import { dailyBriefApi } from './api';
import { todayIst } from './lib/brief';
import { DEFAULT_PREFERENCES } from './lib/normalize';
import type { DailyBrief, DailyBriefPreferences, DailyBriefRiskProfile } from './types';

export const dailyBriefKeys = {
  all: ['daily-brief'] as const,
  brief: (date: string, riskProfile: DailyBriefRiskProfile) =>
    [...dailyBriefKeys.all, 'brief', date, riskProfile] as const,
  dates: () => [...dailyBriefKeys.all, 'dates'] as const,
  preferences: () => [...dailyBriefKeys.all, 'preferences'] as const,
  audio: (date: string, riskProfile: DailyBriefRiskProfile) =>
    [...dailyBriefKeys.all, 'audio', date, riskProfile] as const,
};

/**
 * One day's brief. Today's is rebuilt by the server at most once a minute (its cache TTL),
 * so it's polled at that pace while the screen is on show; a past day is a stored snapshot
 * and never changes. Index tiles also follow the live /indices socket in between polls,
 * exactly as the web does.
 */
export function useDailyBrief(date: string, riskProfile: DailyBriefRiskProfile) {
  const focused = useIsFocused();
  const client = useQueryClient();
  const isToday = date === todayIst();

  const query = useQuery({
    queryKey: dailyBriefKeys.brief(date, riskProfile),
    queryFn: ({ signal }) => dailyBriefApi.brief(date, riskProfile, signal),
    staleTime: isToday ? 55_000 : Infinity,
    refetchInterval: isToday ? 60_000 : false,
    subscribed: focused,
    // Switching risk profile keeps the current brief on screen until the new one lands.
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!focused || !isToday) return undefined;
    return indicesSocket.subscribe((snapshot) => {
      client.setQueryData<DailyBrief>(dailyBriefKeys.brief(date, riskProfile), (old) => {
        if (!old || old.date !== date) return old;
        const live = new Map(snapshot.indices.map((row) => [row.label ?? row.symbol, row]));
        return {
          ...old,
          marketStatus: snapshot.marketOpen ? 'OPEN' : old.marketStatus,
          indices: old.indices.map((row) => {
            const next = live.get(row.name);
            if (!next) return row;
            return {
              ...row,
              ltp: next.ltp ?? row.ltp,
              change: next.change ?? row.change,
              changePct: next.changePct ?? row.changePct,
              meta: {
                source: 'Live index feed',
                timestamp: snapshot.asOf,
                isDelayed: false,
                availability: 'live',
              },
            };
          }),
        };
      });
    });
  }, [client, date, focused, isToday, riskProfile]);

  return query;
}

export function useDailyBriefDates() {
  return useQuery({
    queryKey: dailyBriefKeys.dates(),
    queryFn: dailyBriefApi.dates,
    staleTime: 5 * 60_000,
  });
}

export function useDailyBriefPreferences() {
  return useQuery({
    queryKey: dailyBriefKeys.preferences(),
    queryFn: dailyBriefApi.preferences,
    staleTime: 5 * 60_000,
  });
}

/** The preferences to render with right now: the saved ones, or the server's defaults. */
export function resolvedPreferences(
  data: DailyBriefPreferences | undefined,
): DailyBriefPreferences {
  return data ?? DEFAULT_PREFERENCES;
}

export function useUpdateDailyBriefPreferences() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<DailyBriefPreferences>) => dailyBriefApi.updatePreferences(patch),
    onSuccess: (preferences) => client.setQueryData(dailyBriefKeys.preferences(), preferences),
  });
}

/** Rebuilds today's brief with a fresh AI analysis and puts it straight into the cache. */
export function useRefreshDailyBrief(date: string, riskProfile: DailyBriefRiskProfile) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => dailyBriefApi.refresh(date, riskProfile),
    onSuccess: (brief) => {
      client.setQueryData(dailyBriefKeys.brief(date, riskProfile), brief);
      // A refresh stores today's brief, so the date list may have gained today.
      void client.invalidateQueries({ queryKey: dailyBriefKeys.dates() });
      // The narration script is built from the brief; the old one no longer matches.
      client.removeQueries({ queryKey: dailyBriefKeys.audio(date, riskProfile) });
    },
  });
}

/** The narration script, fetched on the first "Listen" and reused until the brief changes. */
export function useFetchNarration() {
  const client = useQueryClient();
  return useCallback(
    (date: string, riskProfile: DailyBriefRiskProfile) =>
      client.fetchQuery({
        queryKey: dailyBriefKeys.audio(date, riskProfile),
        queryFn: () => dailyBriefApi.audio(date, riskProfile),
        staleTime: 60_000,
      }),
    [client],
  );
}
