import { env } from '@/config/env';
import type { ChallengeResult, MstockConnectPayload } from '@/features/trading/types';
import { apiClient } from '@/services/api/client';

import { normalizeApiUsage } from './lib/apiUsage';
import { normalizeNewsRun, normalizeNewsRuns } from './lib/jobs';
import { normalizeKillSwitch } from './lib/trading';
import type {
  AdminJob,
  AdminJobKind,
  AdminJobLog,
  AdminJobRunResult,
  AdminNewsRun,
  AdminNewsRunsPage,
  AiProvider,
  AiUsageReport,
  ApiProvider,
  ApiUsageRange,
  ApiUsageReport,
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
  RevealCodeSent,
  RevealResult,
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
  /** One provider's calls with `provider`; an older server refuses the parameter (422). */
  async aiUsage(period: UsagePeriod, provider?: AiProvider): Promise<AiUsageReport> {
    const { data } = await apiClient.get<AiUsageReport>('/admin/ai-usage', {
      params: provider ? { period, provider } : { period },
    });
    return data;
  },
  /**
   * One third-party API's calls, limits and live feeds. mStock is asked WITHOUT `broker` — the
   * server's default — so a server older than Groww measuring (whose strict query schema refuses
   * the parameter with 422) still answers it; only Groww names the provider.
   */
  async apiUsage(
    range: ApiUsageRange,
    provider: ApiProvider,
    signal?: AbortSignal,
  ): Promise<ApiUsageReport> {
    const { data } = await apiClient.get<unknown>('/admin/broker-usage', {
      params: provider === 'mstock' ? { range } : { range, broker: provider },
      signal,
    });
    return normalizeApiUsage(data);
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

  // ── News ingestion (any signed-in user may trigger; the admin console shows the timeline) ──
  async newsRuns(pageSize: number, signal?: AbortSignal): Promise<AdminNewsRunsPage> {
    const { data } = await apiClient.get<unknown>('/news/runs', {
      params: { page: 1, pageSize },
      signal,
    });
    return normalizeNewsRuns(data);
  },
  /** Starts a batch and returns at once with status RUNNING — it does not wait for providers. */
  async triggerNewsIngestion(): Promise<AdminNewsRun | null> {
    const { data } = await apiClient.post<unknown>('/news/ingest');
    return normalizeNewsRun(data);
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
  /** Admin only. Refuses every new live order on every broker until released; the reason
   *  (3–500 characters) is recorded and shown to anyone whose order it refuses. */
  async engageKillSwitch(reason: string): Promise<KillSwitchAdminState> {
    const { data } = await apiClient.post<unknown>('/live-trading/kill-switch/engage', { reason });
    return normalizeKillSwitch(data);
  },
  async disengageKillSwitch(): Promise<KillSwitchAdminState> {
    const { data } = await apiClient.post<unknown>('/live-trading/kill-switch/disengage');
    return normalizeKillSwitch(data);
  },
  /** Emails a single-use 6-digit code (5 minutes) to the signed-in admin's own address. */
  async requestGrowwTokenCode(): Promise<RevealCodeSent> {
    const { data } = await apiClient.post<RevealCodeSent>('/admin/broker-tokens/groww/code', {});
    return data;
  },
  /**
   * Shows the admin's OWN Groww connections with their current access token. Read-only: it never
   * mints or refreshes a token, and every reveal is logged and followed by an alert email.
   */
  async revealGrowwToken(code: string): Promise<RevealResult> {
    const { data } = await apiClient.post<RevealResult>('/admin/broker-tokens/groww/reveal', {
      code,
    });
    return { ...data, connections: Array.isArray(data?.connections) ? data.connections : [] };
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
