import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { tradingKeys } from '@/features/trading/hooks';
import type { MstockConnectPayload } from '@/features/trading/types';

import { adminApi, opsApi, recommendationAdminApi } from './api';
import type {
  AdminJobKind,
  BrokerUsageRange,
  BrowserResearchConfig,
  BrowserResearchGuardrails,
  CatalogAction,
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
  aiUsage: (period: UsagePeriod) => ['admin', 'ai-usage', period] as const,
  brokerUsage: (range: BrokerUsageRange) => ['admin', 'broker-usage', range] as const,
  users: ['admin', 'users'] as const,
  jobs: (kind: AdminJobKind) => ['admin', 'jobs', kind] as const,
  jobsAll: ['admin', 'jobs'] as const,
  jobLogs: ['admin', 'job-logs'] as const,
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
    refetchInterval: live ? 10_000 : false,
  });
}

// ── Usage ──────────────────────────────────────────────────────────────────────────────

export function useAiUsage(period: UsagePeriod) {
  return useQuery({
    queryKey: adminKeys.aiUsage(period),
    queryFn: () => adminApi.aiUsage(period),
    staleTime: 60_000,
  });
}

export function useBrokerUsage(range: BrokerUsageRange) {
  return useQuery({
    queryKey: adminKeys.brokerUsage(range),
    queryFn: () => adminApi.brokerUsage(range),
    staleTime: ADMIN_STALE_MS,
    refetchInterval: 30_000,
  });
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
        old?.map((user) => (user.id === updated.id ? { ...user, ...updated } : user)),
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

export function useKillSwitchControl() {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: tradingKeys.killSwitch });
  return {
    engage: useMutation({
      mutationFn: (reason: string) => adminApi.engageKillSwitch(reason),
      onSettled: refresh,
    }),
    disengage: useMutation({ mutationFn: adminApi.disengageKillSwitch, onSettled: refresh }),
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
