import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { newsKeys } from '@/features/news/hooks';
import { tradingKeys } from '@/features/trading/hooks';
import type { MstockConnectPayload } from '@/features/trading/types';
import { isApiError } from '@/types/api';

import { adminApi, opsApi, recommendationAdminApi } from './api';
import { growwUnsupported } from './lib/apiUsage';
import { hasRunningRun } from './lib/jobs';
import { mergeUserUpdate } from './lib/users';
import type {
  AdminJobKind,
  AiProvider,
  ApiProvider,
  ApiUsageRange,
  BrowserResearchConfig,
  BrowserResearchGuardrails,
  CatalogAction,
  KillSwitchAdminState,
  ObsRange,
  PlatformUser,
  PlatformUserUpdate,
  UsagePeriod,
} from './types';

export const adminKeys = {
  all: ['admin'] as const,
  liveness: ['admin', 'ops', 'health'] as const,
  readiness: ['admin', 'ops', 'ready'] as const,
  serviceHealth: (range: ObsRange) => ['admin', 'service-health', range] as const,
  analytics: (range: ObsRange) => ['admin', 'server-analytics', range] as const,
  logs: (minLevel: number) => ['admin', 'logs', minLevel] as const,
  aiUsage: (period: UsagePeriod, provider?: AiProvider) =>
    ['admin', 'ai-usage', period, provider ?? 'all'] as const,
  apiUsage: (range: ApiUsageRange, provider: ApiProvider) =>
    ['admin', 'api-usage', range, provider] as const,
  users: ['admin', 'users'] as const,
  jobs: (kind: AdminJobKind) => ['admin', 'jobs', kind] as const,
  jobsAll: ['admin', 'jobs'] as const,
  jobLogs: ['admin', 'job-logs'] as const,
  newsRunsAll: ['admin', 'news-runs'] as const,
  newsRuns: (pageSize: number) => ['admin', 'news-runs', pageSize] as const,
  browserResearch: ['admin', 'browser-research'] as const,
  browserResearchRuns: ['admin', 'browser-research-runs'] as const,
  recServiceStatus: ['recommendations', 'service-status'] as const,
  recServiceUsers: ['recommendations', 'admin', 'service-user-options'] as const,
  recServiceBroker: ['recommendations', 'admin', 'service-broker'] as const,
};

/** Admin data is operator detail: fail fast (no retries on 4xx) and never cache for long. */
const ADMIN_STALE_MS = 15_000;

// ── Ops probes ─────────────────────────────────────────────────────────────────────────

export function useLiveness(enabled = true) {
  return useQuery({
    queryKey: adminKeys.liveness,
    queryFn: opsApi.liveness,
    enabled,
    staleTime: ADMIN_STALE_MS,
    refetchInterval: 30_000,
  });
}

export function useReadiness(enabled = true) {
  return useQuery({
    queryKey: adminKeys.readiness,
    queryFn: opsApi.readiness,
    enabled,
    staleTime: ADMIN_STALE_MS,
    refetchInterval: 30_000,
  });
}

// ── Observability ──────────────────────────────────────────────────────────────────────

export function useServiceHealth(range: ObsRange) {
  return useQuery({
    queryKey: adminKeys.serviceHealth(range),
    queryFn: () => adminApi.serviceHealth(range),
    staleTime: ADMIN_STALE_MS,
    // The checker samples once a minute; faster polling re-reads the same sample.
    refetchInterval: 30_000,
  });
}

export function useServerAnalytics(range: ObsRange) {
  return useQuery({
    queryKey: adminKeys.analytics(range),
    queryFn: () => adminApi.serverAnalytics(range),
    staleTime: ADMIN_STALE_MS,
    refetchInterval: 30_000,
  });
}

export function useRecentLogs(minLevel: number, live: boolean) {
  return useQuery({
    queryKey: adminKeys.logs(minLevel),
    queryFn: () => adminApi.recentLogs(minLevel, 300),
    staleTime: 5_000,
    // Hundreds of lines with their details — not worth persisting for the next cold start.
    gcTime: 5 * 60_000,
    refetchInterval: live ? 10_000 : false,
  });
}

// ── Usage ──────────────────────────────────────────────────────────────────────────────

export function useAiUsage(period: UsagePeriod, provider?: AiProvider, enabled = true) {
  return useQuery({
    queryKey: adminKeys.aiUsage(period, provider),
    queryFn: () => adminApi.aiUsage(period, provider),
    enabled,
    staleTime: 60_000,
  });
}

/**
 * One provider's usage. Asks the server for that provider alone; a server that predates the
 * filter refuses it (422), and then the every-provider report stands in — `filtered` says which
 * one the screen got, so it can say what it can and cannot split.
 */
export function useProviderUsage(period: UsagePeriod, provider: AiProvider) {
  const filtered = useAiUsage(period, provider);
  const unsupported = !filtered.data && isApiError(filtered.error) && filtered.error.status === 422;
  const all = useAiUsage(period, undefined, unsupported);
  const source = unsupported ? all : filtered;
  return {
    data: source.data,
    filtered: !unsupported,
    error: source.error,
    isPending: unsupported ? all.isPending : filtered.isPending,
    refetch: () => (unsupported ? all.refetch() : filtered.refetch()),
  };
}

function useApiUsageReport(range: ApiUsageRange, provider: ApiProvider, enabled = true) {
  return useQuery({
    queryKey: adminKeys.apiUsage(range, provider),
    queryFn: ({ signal }) => adminApi.apiUsage(range, provider, signal),
    enabled,
    staleTime: ADMIN_STALE_MS,
    // The serving process's live state (limiter queues, the tail) moves; history is hourly. A
    // server that refused the provider (422) will refuse it again — no point asking every 30s.
    refetchInterval: (query) =>
      isApiError(query.state.error) && query.state.error.status === 422 ? false : 30_000,
  });
}

/**
 * One third-party API's usage report. Groww is asked by name; a server that predates Groww
 * measuring refuses the parameter (422) or answers without a provider — then the mStock report
 * stands in and `fallback` says so, so the screen never labels mStock figures as Groww.
 */
export function useApiUsage(range: ApiUsageRange, provider: ApiProvider) {
  const asked = useApiUsageReport(range, provider);
  const unsupported = growwUnsupported(provider, asked.error, asked.data);
  // Same key as the mStock view, so switching back is instant. Enabled only when needed.
  const mstock = useApiUsageReport(range, 'mstock', unsupported);
  const source = unsupported ? mstock : asked;
  return {
    data: source.data,
    /** True when Groww was asked for and the mStock report is shown instead. */
    fallback: unsupported,
    error: source.error,
    isPending: source.isPending,
    refetch: () => source.refetch(),
  };
}

// ── Users ──────────────────────────────────────────────────────────────────────────────

export function usePlatformUsers(enabled = true) {
  return useQuery({
    queryKey: adminKeys.users,
    queryFn: adminApi.users,
    enabled,
    staleTime: 30_000,
  });
}

export function useUpdatePlatformUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, update }: { userId: string; update: PlatformUserUpdate }) =>
      adminApi.updateUser(userId, update),
    onSuccess: (updated) => {
      queryClient.setQueryData<PlatformUser[]>(adminKeys.users, (old) =>
        old?.map((user) => (user.id === updated.id ? mergeUserUpdate(user, updated) : user)),
      );
      void queryClient.invalidateQueries({ queryKey: adminKeys.users });
    },
  });
}

// ── Jobs ───────────────────────────────────────────────────────────────────────────────

export function useAdminJobs(kind: AdminJobKind, enabled = true) {
  return useQuery({
    queryKey: adminKeys.jobs(kind),
    queryFn: () => adminApi.jobs(kind),
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useAdminJobLogs(enabled = true) {
  return useQuery({
    queryKey: adminKeys.jobLogs,
    queryFn: adminApi.jobLogs,
    enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useRunAdminJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, id }: { kind: AdminJobKind; id: string }) => adminApi.runJob(kind, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobsAll });
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobLogs });
    },
  });
}

export function useUpdateAdminCron() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, pattern }: { id: string; pattern: string }) =>
      adminApi.updateCron(id, pattern),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobs('cron') });
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobLogs });
    },
  });
}

// ── News ingestion ─────────────────────────────────────────────────────────────────

/** Recent ingestion batches with their per-provider timeline. Polls quickly only while a run is
 *  still waiting on providers to report back. */
export function useAdminNewsRuns(pageSize = 15, enabled = true) {
  return useQuery({
    queryKey: adminKeys.newsRuns(pageSize),
    queryFn: ({ signal }) => adminApi.newsRuns(pageSize, signal),
    enabled,
    staleTime: 10_000,
    refetchInterval: (query) => (hasRunningRun(query.state.data?.runs ?? []) ? 10_000 : 60_000),
  });
}

export function useTriggerNewsIngestion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.triggerNewsIngestion,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.newsRunsAll });
      // Today's activity rows read the same runs through the news feature.
      void queryClient.invalidateQueries({ queryKey: [...newsKeys.all, 'runs'] });
    },
  });
}

// ── Catalog ────────────────────────────────────────────────────────────────────────────

export function useCatalogAction() {
  return useMutation({ mutationFn: (action: CatalogAction) => adminApi.catalogAction(action) });
}

// ── Browser research ───────────────────────────────────────────────────────────────────

export function useBrowserResearch() {
  return useQuery({
    queryKey: adminKeys.browserResearch,
    queryFn: adminApi.browserResearch,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

export function useBrowserResearchRuns() {
  return useQuery({
    queryKey: adminKeys.browserResearchRuns,
    queryFn: adminApi.browserResearchRuns,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

export function useSaveBrowserResearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (guardrails: BrowserResearchGuardrails) => adminApi.saveBrowserResearch(guardrails),
    onSuccess: (config) => queryClient.setQueryData(adminKeys.browserResearch, config),
  });
}

export function useCreateBrowserPairing() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.createBrowserPairing,
    onSuccess: (pairing) => {
      // The server is now in pairing mode; show it at once rather than after the refetch.
      queryClient.setQueryData<BrowserResearchConfig>(adminKeys.browserResearch, (old) =>
        old
          ? {
              ...old,
              connectionStatus: 'pairing',
              pairingExpiresAt: pairing.expiresAt,
              lastError: null,
            }
          : old,
      );
      void queryClient.invalidateQueries({ queryKey: adminKeys.browserResearch });
    },
  });
}

export function useTestBrowserResearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.testBrowserResearch,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: adminKeys.browserResearchRuns }),
  });
}

export function useRevokeBrowserDevice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminApi.revokeBrowserDevice,
    onSuccess: (config) => queryClient.setQueryData(adminKeys.browserResearch, config),
  });
}

// ── Live trading controls ──────────────────────────────────────────────────────────────

export function useSetLiveTradingEnabled() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => adminApi.setLiveTradingEnabled(enabled),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tradingKeys.liveSettings }),
  });
}

/**
 * Engage (with a reason) or release the platform kill switch. Never optimistic: the shared
 * kill-switch query (read by every order ticket) takes the state the server CONFIRMED, then
 * re-reads it.
 */
export function useKillSwitchControl() {
  const queryClient = useQueryClient();
  const confirmed = (state: KillSwitchAdminState) =>
    queryClient.setQueryData(tradingKeys.killSwitch, state);
  const refresh = () => queryClient.invalidateQueries({ queryKey: tradingKeys.killSwitch });
  return {
    engage: useMutation({
      mutationFn: (reason: string) => adminApi.engageKillSwitch(reason),
      onSuccess: confirmed,
      onSettled: refresh,
    }),
    disengage: useMutation({
      mutationFn: adminApi.disengageKillSwitch,
      onSuccess: confirmed,
      onSettled: refresh,
    }),
  };
}

// ── Recommendations engine ─────────────────────────────────────────────────────────────

export function useRecServiceStatus(enabled = true) {
  return useQuery({
    queryKey: adminKeys.recServiceStatus,
    queryFn: recommendationAdminApi.serviceStatus,
    enabled,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export function useServiceUserOptions() {
  return useQuery({
    queryKey: adminKeys.recServiceUsers,
    queryFn: recommendationAdminApi.serviceUserOptions,
    staleTime: 30_000,
  });
}

/** 503 DEPENDENCY_UNAVAILABLE = no service user yet; retrying only delays that answer. */
export function useServiceBroker() {
  return useQuery({
    queryKey: adminKeys.recServiceBroker,
    queryFn: recommendationAdminApi.serviceBroker,
    staleTime: 30_000,
    retry: false,
  });
}

function useInvalidateRecService() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.recServiceUsers }),
      queryClient.invalidateQueries({ queryKey: adminKeys.recServiceStatus }),
      queryClient.invalidateQueries({ queryKey: adminKeys.recServiceBroker }),
    ]);
}

export function useSetServiceUser() {
  const invalidate = useInvalidateRecService();
  return useMutation({
    mutationFn: (userId: string) => recommendationAdminApi.setServiceUser(userId),
    onSuccess: () => invalidate(),
  });
}

export function useCreateServiceAccount() {
  const invalidate = useInvalidateRecService();
  return useMutation({
    mutationFn: recommendationAdminApi.createServiceAccount,
    onSuccess: () => invalidate(),
  });
}

export function useConnectServiceBroker() {
  return useMutation({
    mutationFn: (payload: MstockConnectPayload) =>
      recommendationAdminApi.connectServiceBroker(payload),
  });
}

export function useVerifyServiceBroker() {
  const invalidate = useInvalidateRecService();
  return useMutation({
    mutationFn: (code: string) => recommendationAdminApi.verifyServiceBroker(code),
    onSuccess: () => invalidate(),
  });
}

export function useGenerateRecommendations() {
  const queryClient = useQueryClient();
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['insights'] }),
      queryClient.invalidateQueries({ queryKey: ['recommendations'] }),
    ]);
  return {
    today: useMutation({ mutationFn: recommendationAdminApi.generate, onSuccess: refresh }),
    preMarket: useMutation({
      mutationFn: recommendationAdminApi.generatePreMarket,
      onSuccess: refresh,
    }),
  };
}
