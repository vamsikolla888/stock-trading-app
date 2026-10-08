import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { useAuthStore } from '@/store/authStore';

import { indexBotApi } from './api';
import type {
  BacktestDays,
  BacktestUnderlying,
  BotNumbers,
  BotStatus,
  DecisionOutcome,
  IndexDecisions,
  IndexOverview,
  ModeFilter,
  RangeKey,
  RunView,
} from './types';

/** The decision log and the overview move every five minutes in market hours; 30 s is plenty. */
const POLL_MS = 30_000;
/** The controls poll a little faster — an operator is looking at a switch they just flipped. */
const STATUS_POLL_MS = 15_000;
/** A test scan runs for a minute or two; its trace grows step by step. */
const RUN_POLL_MS = 3_000;
/** Statements and logs can be thousands of rows: dropped soon after the screen closes, so they
 *  stay out of the persisted cache every cold start parses. */
const SHORT_GC_MS = 10 * 60_000;

export const indexBotKeys = {
  all: ['index-bot'] as const,
  overview: (mode: ModeFilter, range: RangeKey) => ['index-bot', 'overview', mode, range] as const,
  trades: (mode: ModeFilter, range: RangeKey) => ['index-bot', 'trades', mode, range] as const,
  decisions: (range: RangeKey, outcome: DecisionOutcome, hideClosed: boolean) =>
    ['index-bot', 'decisions', range, outcome, hideClosed] as const,
  status: ['index-bot', 'status'] as const,
  run: (id: string) => ['index-bot', 'run', id] as const,
  backtest: (underlying: BacktestUnderlying, days: BacktestDays) =>
    ['index-bot', 'backtest', underlying, days] as const,
};

/** The admin role, as the session knows it — every index-bot route is admin-only. */
export function useIsAdmin(): boolean {
  return useAuthStore((state) => state.user?.role === 'admin');
}

/** `active`: the screen shows this data now (its tab is open and the screen focused). */
export function useIndexOverview(mode: ModeFilter, range: RangeKey, active = true) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useQuery({
    queryKey: indexBotKeys.overview(mode, range),
    queryFn: ({ signal }) => indexBotApi.overview(mode, range, signal),
    enabled: isAdmin,
    staleTime: 20_000,
    refetchInterval: POLL_MS,
    subscribed: focused && active,
    placeholderData: keepPreviousData,
  });
}

export function useIndexTrades(mode: ModeFilter, range: RangeKey, active = true) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useQuery({
    queryKey: indexBotKeys.trades(mode, range),
    queryFn: ({ signal }) => indexBotApi.trades(mode, range, signal),
    enabled: isAdmin && active,
    staleTime: 20_000,
    gcTime: SHORT_GC_MS,
    refetchInterval: POLL_MS,
    subscribed: focused && active,
    placeholderData: keepPreviousData,
  });
}

export function useIndexDecisions(
  range: RangeKey,
  outcome: DecisionOutcome,
  hideClosed: boolean,
  active = true,
) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useInfiniteQuery({
    queryKey: indexBotKeys.decisions(range, outcome, hideClosed),
    queryFn: ({ pageParam, signal }) =>
      indexBotApi.decisions({ range, outcome, hideClosed, before: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled: isAdmin && active,
    staleTime: 20_000,
    gcTime: SHORT_GC_MS,
    // Older pages do not change; only the first one is worth refreshing on a timer.
    refetchInterval: (query) => ((query.state.data?.pages.length ?? 0) <= 1 ? POLL_MS : false),
    subscribed: focused && active,
    placeholderData: keepPreviousData,
  });
}

/**
 * The historical replay. History does not move while the screen is open, so it never polls; the
 * server caches it for 15 minutes and so does this. One retry only — a cold run is slow, and a
 * missing Groww session will not fix itself.
 */
export function useIndexBacktest(
  underlying: BacktestUnderlying,
  days: BacktestDays,
  active = true,
) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useQuery({
    queryKey: indexBotKeys.backtest(underlying, days),
    queryFn: ({ signal }) => indexBotApi.backtest(underlying, days, signal),
    enabled: isAdmin && active,
    staleTime: 15 * 60_000,
    gcTime: SHORT_GC_MS,
    retry: 1,
    subscribed: focused && active,
    placeholderData: keepPreviousData,
  });
}

export function useBotStatus(active = true) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  return useQuery({
    queryKey: indexBotKeys.status,
    queryFn: ({ signal }) => indexBotApi.status(signal),
    enabled: isAdmin && active,
    staleTime: 10_000,
    refetchInterval: STATUS_POLL_MS,
    subscribed: focused && active,
  });
}

/** A scan already on screen somewhere (the log, the overview, the controls), to paint at once. */
export function cachedRun(client: QueryClient, id: string): RunView | undefined {
  for (const [, data] of client.getQueriesData<InfiniteData<IndexDecisions>>({
    queryKey: ['index-bot', 'decisions'],
  })) {
    const hit = data?.pages.flatMap((page) => page.runs).find((run) => run.id === id);
    if (hit) return hit;
  }
  for (const [, data] of client.getQueriesData<IndexOverview>({
    queryKey: ['index-bot', 'overview'],
  })) {
    if (data?.latestRun?.id === id) return data.latestRun;
  }
  const status = client.getQueryData<BotStatus>(indexBotKeys.status);
  return [...(status?.runs ?? []), ...(status?.dryRuns ?? [])].find((run) => run.id === id);
}

/** One scan with its trace; polled every 3 s while it is still running. */
export function useBotRun(id: string | null) {
  const isAdmin = useIsAdmin();
  const focused = useIsFocused();
  const client = useQueryClient();
  return useQuery<RunView, Error, RunView, ReturnType<typeof indexBotKeys.run>>({
    queryKey: indexBotKeys.run(id ?? ''),
    queryFn: ({ signal }) => indexBotApi.run(id!, signal),
    enabled: isAdmin && Boolean(id),
    staleTime: 15_000,
    gcTime: SHORT_GC_MS,
    placeholderData: () => (id ? cachedRun(client, id) : undefined),
    refetchInterval: (query) => (query.state.data?.status === 'RUNNING' ? RUN_POLL_MS : false),
    subscribed: focused,
  });
}

/**
 * After any control: every index-bot read, and the Agents hub (its summary carries the bot's
 * switch and today's figures). Never optimistic — the screens wait for the server's answer.
 */
function refreshAll(client: QueryClient) {
  return Promise.all([
    client.invalidateQueries({ queryKey: indexBotKeys.all }),
    client.invalidateQueries({ queryKey: ['agents'] }),
  ]);
}

export function useSaveBotSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { enabled: boolean } & BotNumbers) => indexBotApi.saveSettings(body),
    onSuccess: () => refreshAll(client),
  });
}

export function useKillBot() {
  const client = useQueryClient();
  return useMutation({ mutationFn: indexBotApi.kill, onSuccess: () => refreshAll(client) });
}

export function useRunBotNow() {
  const client = useQueryClient();
  return useMutation({ mutationFn: indexBotApi.runNow, onSuccess: () => refreshAll(client) });
}

export function useTestScan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: indexBotApi.testScan,
    onSuccess: () => client.invalidateQueries({ queryKey: indexBotKeys.status }),
  });
}

export function useDeployLive() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (confirm: string) => indexBotApi.deployLive(confirm),
    onSuccess: () => refreshAll(client),
  });
}

export function useBackToTestMode() {
  const client = useQueryClient();
  return useMutation({ mutationFn: indexBotApi.testMode, onSuccess: () => refreshAll(client) });
}

export function useResolveIntent() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (intentId: string) => indexBotApi.resolve(intentId),
    onSuccess: () => refreshAll(client),
  });
}
