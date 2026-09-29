import { env } from '@/config/env';
import type { ChallengeResult, MstockConnectPayload } from '@/features/trading/types';
import { apiClient } from '@/services/api/client';

import type {
  AdminJob,
  AdminJobKind,
  AdminJobLog,
  AdminJobRunResult,
  AiUsageReport,
  BrokerUsageRange,
  BrokerUsageReport,
  BrowserResearchConfig,
  BrowserResearchGuardrails,
  BrowserResearchPairing,
  BrowserResearchRun,
  BrowserResearchTestResult,
  CatalogAction,
  CatalogActionResult,
  GenerateRunResult,
  KillSwitchAdminState,
  LiveTradingSettingsAdmin,
  LivenessResult,
  ObsRange,
  OpsProbe,
  PlatformUser,
  PlatformUserUpdate,
  ReadyChecks,
  RecentLogsResponse,
  ServerAnalyticsReport,
  ServiceAccountResult,
  ServiceBrokerConnections,
  ServiceHealthReport,
  ServiceSessionStatus,
  ServiceUserOptionsResponse,
  UsagePeriod,
} from './types';

const OPS_TIMEOUT_MS = 8_000;
const CATALOG_TIMEOUT_MS = 120_000;
/** The connection test drives the paired Chrome twice (open a page, read it), up to 30s each. */
const BROWSER_TEST_TIMEOUT_MS = 75_000;

/**
 * GET /health and /ready live OUTSIDE /api/v1 and need no token, so they bypass the API
 * client. /ready answers 503 with a body naming the failing dependency — that is a result
 * to show, so the body is read whatever the status. An unreachable server is also a result.
 */
async function opsProbe<T>(path: string): Promise<OpsProbe<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPS_TIMEOUT_MS);
  try {
    const response = await fetch(`${env.serverOrigin}${path}`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const body = (await response.json().catch(() => null)) as { data?: T } | null;
    return { ok: response.ok, data: body?.data ?? null };
  } catch {
    return { ok: false, data: null };
  } finally {
    clearTimeout(timer);
  }
}

export const opsApi = {
  liveness: () => opsProbe<LivenessResult>('/health'),
  readiness: () => opsProbe<ReadyChecks>('/ready'),
};

export const adminApi = {
  // ── Observability ──
  async serviceHealth(range: ObsRange): Promise<ServiceHealthReport> {
    const { data } = await apiClient.get<ServiceHealthReport>('/admin/observability/health', {
      params: { range },
    });
    return data;
  },
  async serverAnalytics(range: ObsRange): Promise<ServerAnalyticsReport> {
    const { data } = await apiClient.get<ServerAnalyticsReport>('/admin/observability/analytics', {
      params: { range },
    });
    return data;
  },
  async recentLogs(minLevel = 10, limit = 300): Promise<RecentLogsResponse> {
    const { data } = await apiClient.get<RecentLogsResponse>('/admin/observability/logs', {
      params: { minLevel, limit },
    });
    return data;
  },

  // ── Usage ──
  async aiUsage(period: UsagePeriod): Promise<AiUsageReport> {
    const { data } = await apiClient.get<AiUsageReport>('/admin/ai-usage', { params: { period } });
    return data;
  },
  async brokerUsage(range: BrokerUsageRange): Promise<BrokerUsageReport> {
    const { data } = await apiClient.get<BrokerUsageReport>('/admin/broker-usage', {
      params: { range },
    });
    return data;
  },

  // ── Users ──
  async users(): Promise<PlatformUser[]> {
    const { data } = await apiClient.get<{ users: PlatformUser[] }>('/admin/users');
    return data.users;
  },
  async updateUser(userId: string, update: PlatformUserUpdate): Promise<PlatformUser> {
    const { data } = await apiClient.patch<PlatformUser>(
      `/admin/users/${encodeURIComponent(userId)}`,
      update,
    );
    return data;
  },

  // ── Jobs ──
  async jobs(kind: AdminJobKind): Promise<AdminJob[]> {
    const { data } = await apiClient.get<{ jobs: AdminJob[] }>('/admin/jobs', { params: { kind } });
    return data.jobs;
  },
  async jobLogs(): Promise<AdminJobLog[]> {
    const { data } = await apiClient.get<{ logs: AdminJobLog[] }>('/admin/jobs/logs');
    return data.logs;
  },
  async runJob(kind: AdminJobKind, id: string): Promise<AdminJobRunResult> {
    const { data } = await apiClient.post<AdminJobRunResult>(
      `/admin/jobs/${kind}/${encodeURIComponent(id)}/run`,
    );
    return data;
  },
  async updateCron(id: string, pattern: string): Promise<AdminJob> {
    const { data } = await apiClient.patch<AdminJob>(
      `/admin/jobs/${encodeURIComponent(id)}/schedule`,
      { pattern },
    );
    return data;
  },

  // ── Catalog maintenance ──
  async catalogAction(action: CatalogAction): Promise<CatalogActionResult> {
    const path = {
      sync: '/stocks/admin/sync',
      groww: '/stocks/admin/sync-groww',
      snapshots: '/stocks/admin/refresh-snapshots',
    }[action];
    // A full master sync or re-price can outlast the default 15s request timeout.
    const { data } = await apiClient.post<Record<string, unknown>>(path, undefined, {
      timeout: CATALOG_TIMEOUT_MS,
    });
    return { action, result: data ?? {} };
  },

  // ── Browser research ──
  async browserResearch(): Promise<BrowserResearchConfig> {
    const { data } = await apiClient.get<BrowserResearchConfig>('/admin/browser-research');
    return data;
  },
  async saveBrowserResearch(guardrails: BrowserResearchGuardrails): Promise<BrowserResearchConfig> {
    const { data } = await apiClient.put<BrowserResearchConfig>(
      '/admin/browser-research',
      guardrails,
    );
    return data;
  },
  async browserResearchRuns(): Promise<BrowserResearchRun[]> {
    const { data } = await apiClient.get<{ runs: BrowserResearchRun[] }>(
      '/admin/browser-research/logs',
    );
    return data.runs;
  },
  async createBrowserPairing(): Promise<BrowserResearchPairing> {
    const { data } = await apiClient.post<BrowserResearchPairing>(
      '/admin/browser-research/pairing',
    );
    return data;
  },
  async testBrowserResearch(): Promise<BrowserResearchTestResult> {
    const { data } = await apiClient.post<BrowserResearchTestResult>(
      '/admin/browser-research/test',
      undefined,
      { timeout: BROWSER_TEST_TIMEOUT_MS },
    );
    return data;
  },
  async revokeBrowserDevice(): Promise<BrowserResearchConfig> {
    const { data } = await apiClient.delete<BrowserResearchConfig>(
      '/admin/browser-research/device',
    );
    return data;
  },

  // ── Live trading controls (admin writes; reads come from features/trading) ──
  async setLiveTradingEnabled(enabled: boolean): Promise<LiveTradingSettingsAdmin> {
    const { data } = await apiClient.patch<LiveTradingSettingsAdmin>('/live-trading/settings', {
      enabled,
    });
    return data;
  },
  async engageKillSwitch(reason: string): Promise<KillSwitchAdminState> {
    const { data } = await apiClient.post<KillSwitchAdminState>(
      '/live-trading/kill-switch/engage',
      {
        reason,
      },
    );
    return data;
  },
  async disengageKillSwitch(): Promise<KillSwitchAdminState> {
    const { data } = await apiClient.post<KillSwitchAdminState>(
      '/live-trading/kill-switch/disengage',
    );
    return data;
  },
};

/** The recommendation engine's data session and manual runs (web: RecommendationsAdmin). */
export const recommendationAdminApi = {
  /** Display-only status of the engine's mStock session — readable by any signed-in user. */
  async serviceStatus(): Promise<ServiceSessionStatus> {
    const { data } = await apiClient.get<ServiceSessionStatus>('/recommendations/service-status');
    return data;
  },
  async serviceUserOptions(): Promise<ServiceUserOptionsResponse> {
    const { data } = await apiClient.get<ServiceUserOptionsResponse>(
      '/recommendations/admin/service-user-options',
    );
    return data;
  },
  async setServiceUser(userId: string): Promise<{ selectedUserId: string }> {
    const { data } = await apiClient.post<{ selectedUserId: string }>(
      '/recommendations/admin/service-user',
      { userId },
    );
    return data;
  },
  async createServiceAccount(): Promise<ServiceAccountResult> {
    const { data } = await apiClient.post<ServiceAccountResult>(
      '/recommendations/admin/service-account',
    );
    return data;
  },
  /** 503 DEPENDENCY_UNAVAILABLE when no service user is set — a state, not a failure. */
  async serviceBroker(): Promise<ServiceBrokerConnections> {
    const { data } = await apiClient.get<ServiceBrokerConnections>(
      '/recommendations/admin/service-broker',
    );
    return data;
  },
  async connectServiceBroker(payload: MstockConnectPayload): Promise<ChallengeResult> {
    const { data } = await apiClient.post<ChallengeResult>(
      '/recommendations/admin/service-broker/mstock/connect',
      payload,
    );
    return data;
  },
  async verifyServiceBroker(code: string): Promise<unknown> {
    const { data } = await apiClient.post('/recommendations/admin/service-broker/mstock/verify', {
      code,
    });
    return data;
  },
  async generate(): Promise<GenerateRunResult> {
    const { data } = await apiClient.post<GenerateRunResult>('/recommendations/generate');
    return data;
  },
  async generatePreMarket(): Promise<GenerateRunResult> {
    const { data } = await apiClient.post<GenerateRunResult>(
      '/recommendations/pre-market/generate',
    );
    return data;
  },
};
