import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';

import { livePriceInterval } from '@/lib/utils/market';

import { paperApi } from './api';
import { paperKeys } from './keys';
import { resolveActiveProfile } from './lib/book';
import { usePaperProfileStore } from './store';
import type {
  AutoTradeConfig,
  CashSegment,
  PaperOrderInput,
  PaperPosition,
  PaperProfile,
  QuoteRow,
} from './types';

export { paperKeys } from './keys';

/**
 * Positions are marked off the server's price snapshot, refreshed about once a minute in
 * market hours — polling faster would re-read the same numbers. Off outside the session.
 */
const POLL_MS = 30_000;

export function usePaperProfiles() {
  return useQuery({ queryKey: paperKeys.profiles, queryFn: paperApi.profiles, staleTime: 60_000 });
}

/**
 * The profile this device is looking at: the remembered one while it still exists, else
 * the default. `profileId` is undefined until the list loads — which the server reads as
 * "the default profile", the right answer for a first paint.
 */
export function useActivePaperProfile() {
  const profiles = usePaperProfiles();
  const remembered = usePaperProfileStore((state) => state.activeProfileId);
  const setRemembered = usePaperProfileStore((state) => state.setActiveProfileId);
  const active = useMemo(
    () => resolveActiveProfile(profiles.data, remembered),
    [profiles.data, remembered],
  );

  // A remembered id that was deleted elsewhere is dropped — but only against a list that
  // has just been fetched, never against a cached one that may predate the profile.
  const settled = Boolean(profiles.data) && !profiles.isFetching;
  useEffect(() => {
    if (settled && remembered && active?.id !== remembered) setRemembered(null);
  }, [settled, remembered, active, setRemembered]);

  return {
    profiles,
    active,
    profileId: active?.id,
    select: setRemembered,
  };
}

export function usePaperSegments(profileId?: string) {
  return useQuery({
    queryKey: paperKeys.segments(profileId),
    queryFn: () => paperApi.segments(profileId),
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(POLL_MS),
  });
}

export function usePaperPortfolio(segment: CashSegment, profileId?: string) {
  return useQuery({
    queryKey: paperKeys.portfolio(segment, profileId),
    queryFn: () => paperApi.portfolio(segment, profileId),
    staleTime: 10_000,
    refetchInterval: () => livePriceInterval(POLL_MS),
  });
}

/** Both pools' orders, newest first. 200 is the server's ceiling. */
export function usePaperOrders(profileId?: string, limit = 200) {
  return useQuery({
    queryKey: paperKeys.orders(limit, profileId),
    queryFn: () => paperApi.orders(limit, profileId),
    staleTime: 10_000,
    // A resting order can fill on the server's matcher at any moment.
    refetchInterval: (query) =>
      query.state.data?.some((order) => order.status === 'PENDING')
        ? livePriceInterval(15_000)
        : false,
  });
}

/** Dry-run of a paper order (cash, charges, blocking reason) for the current inputs. */
export function usePaperPreview(input: PaperOrderInput | null) {
  return useQuery({
    queryKey: paperKeys.preview(input),
    queryFn: ({ signal }) => paperApi.preview(input!, signal),
    enabled: input !== null,
    staleTime: 2_000,
    retry: false,
    placeholderData: keepPreviousData,
  });
}

/** The reconstructed equity curve — replays the fill log, so only while it's on screen. */
export function usePaperPerformance(days: number, profileId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: paperKeys.performance(days, profileId),
    queryFn: () => paperApi.performance(days, profileId),
    enabled,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

export function usePaperAnalytics(profileId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: paperKeys.analytics(profileId),
    queryFn: () => paperApi.analytics(profileId),
    enabled,
    staleTime: 15_000,
    refetchInterval: () => (enabled ? livePriceInterval(POLL_MS) : false),
  });
}

export function usePaperWallet(profileId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: paperKeys.wallet(profileId),
    queryFn: () => paperApi.wallet(profileId),
    enabled,
    staleTime: 30_000,
  });
}

export function useAutoTradeConfig(enabled = true) {
  return useQuery({
    queryKey: paperKeys.autoTradeConfig,
    queryFn: paperApi.autoTradeConfig,
    enabled,
    staleTime: 30_000,
  });
}

/** Polled while the market is open — the engine trades on its own. */
export function useAutoTradeActivity(enabled = true) {
  return useQuery({
    queryKey: paperKeys.autoTradeActivity,
    queryFn: () => paperApi.autoTradeActivity(100),
    enabled,
    staleTime: 15_000,
    refetchInterval: () => livePriceInterval(POLL_MS),
  });
}

export function useStrategyOptions(enabled: boolean) {
  return useQuery({
    queryKey: paperKeys.strategies,
    queryFn: paperApi.strategies,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/**
 * Latest price and previous close for the held stocks — what the 1-day return needs (the
 * paper book itself carries no previous close). One request per exchange; a failure just
 * leaves the day's move unknown, never zero.
 */
export function usePaperQuotes(positions: readonly PaperPosition[]) {
  const groups = useMemo(() => {
    const byExchange = new Map<string, Set<string>>();
    for (const position of positions) {
      const set = byExchange.get(position.exchange) ?? new Set<string>();
      set.add(position.symbol);
      byExchange.set(position.exchange, set);
    }
    return [...byExchange.entries()]
      .map(([exchange, symbols]) => [exchange, [...symbols].sort()] as const)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [positions]);
  const signature = groups
    .map(([exchange, symbols]) => `${exchange}:${symbols.join(',')}`)
    .join('|');

  return useQuery({
    queryKey: paperKeys.quotes(signature),
    queryFn: async (): Promise<Record<string, QuoteRow>> => {
      const responses = await Promise.all(
        groups.map(([exchange, symbols]) => paperApi.quotes(exchange, symbols)),
      );
      const map: Record<string, QuoteRow> = {};
      for (const quote of responses.flat()) {
        map[`${quote.exchange.toUpperCase()}:${quote.symbol.toUpperCase()}`] = quote;
      }
      return map;
    },
    enabled: groups.length > 0,
    staleTime: 20_000,
    retry: false,
    refetchInterval: () => livePriceInterval(POLL_MS),
  });
}

/** Every paper write refreshes the whole account — funds, positions and the log move together. */
function useInvalidatePaper() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: paperKeys.all });
}

export function usePaperMutations(profileId?: string) {
  const invalidate = useInvalidatePaper();
  const queryClient = useQueryClient();

  return {
    cancelOrder: useMutation({
      mutationFn: (id: string) => paperApi.cancelOrder(id, profileId),
      onSettled: invalidate,
    }),
    closePosition: useMutation({
      mutationFn: (args: { exchange: string; symbol: string; segment: CashSegment }) =>
        paperApi.closePosition(args.exchange, args.symbol, args.segment, profileId),
      onSettled: invalidate,
    }),
    updateLevels: useMutation({
      mutationFn: (args: {
        exchange: string;
        symbol: string;
        segment: CashSegment;
        targetPrice: number | null;
        stopPrice: number | null;
        autoExit?: boolean;
      }) =>
        paperApi.updateLevels(args.exchange, args.symbol, {
          segment: args.segment,
          profileId,
          targetPrice: args.targetPrice,
          stopPrice: args.stopPrice,
          // Sent only when it changed: defaulting it would demote a bracket to reminders.
          ...(args.autoExit !== undefined ? { autoExit: args.autoExit } : {}),
        }),
      onSettled: invalidate,
    }),
    reset: useMutation({
      mutationFn: (segment: CashSegment) => paperApi.reset(segment, profileId),
      onSettled: invalidate,
    }),
    sweep: useMutation({ mutationFn: paperApi.sweepIntraday, onSettled: invalidate }),
    setWallet: useMutation({
      mutationFn: (args: { segment: CashSegment; amount: number }) =>
        paperApi.setWallet({ ...args, profileId }),
      onSettled: invalidate,
    }),
    // The list is patched in place before the refetch lands, so selecting a profile that
    // was just created never meets a list that doesn't contain it yet.
    createProfile: useMutation({
      mutationFn: paperApi.createProfile,
      onSuccess: (profile) =>
        queryClient.setQueryData<PaperProfile[]>(paperKeys.profiles, (old) =>
          old ? [...old.filter((item) => item.id !== profile.id), profile] : [profile],
        ),
      onSettled: () => queryClient.invalidateQueries({ queryKey: paperKeys.profiles }),
    }),
    renameProfile: useMutation({
      mutationFn: (args: { profileId: string; name?: string; strategy?: string | null }) =>
        paperApi.renameProfile(args.profileId, { name: args.name, strategy: args.strategy }),
      onSuccess: (profile) =>
        queryClient.setQueryData<PaperProfile[]>(paperKeys.profiles, (old) =>
          old?.map((item) => (item.id === profile.id ? profile : item)),
        ),
      onSettled: () => queryClient.invalidateQueries({ queryKey: paperKeys.profiles }),
    }),
    deleteProfile: useMutation({
      mutationFn: (id: string) => paperApi.deleteProfile(id),
      onSuccess: (_result, id) =>
        queryClient.setQueryData<PaperProfile[]>(paperKeys.profiles, (old) =>
          old?.filter((item) => item.id !== id),
        ),
      onSettled: invalidate,
    }),
    updateAutoTrade: useMutation({
      mutationFn: (patch: Partial<AutoTradeConfig>) => paperApi.updateAutoTradeConfig(patch),
      onSettled: invalidate,
    }),
    runAutoTrade: useMutation({
      mutationFn: (dryRun: boolean) => paperApi.runAutoTrade(dryRun),
      // A dry run wrote nothing; refetching would flicker as though something happened.
      onSuccess: (result) => {
        if (!result.dryRun) void invalidate();
      },
    }),
    runExits: useMutation({ mutationFn: paperApi.runAutoTradeExits, onSettled: invalidate }),
    // Writes a review the next entry run reads; no order and no balance moves.
    prepareAiReview: useMutation({
      mutationFn: paperApi.prepareAutoTradeAiReview,
      onSettled: () => queryClient.invalidateQueries({ queryKey: paperKeys.autoTradeConfig }),
    }),
  };
}
