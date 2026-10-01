// Mirrored from the web client's admin services (features/admin/services/*.ts) and
// recommendation-admin.service.ts. Every /admin/* route sits behind requireAuth +
// requireAdmin on the server (routes/index.ts); a non-admin gets AUTH_INVALID
// "Admin access required".

import type { BrokerConnectionSummary, MfaMethod } from '@/features/trading/types';

// ── Ops (/health, /ready — outside /api/v1, unauthenticated) ─────────────────────────

export interface LivenessResult {
  status: string;
  uptimeSeconds: number;
}

export interface ReadyChecks {
  checks: Record<string, boolean>;
  breakers: Record<string, unknown>;
}

/** A non-2xx /ready is a RESULT (it names the failing dependency), not an error. */
export interface OpsProbe<T> {
  ok: boolean;
  data: T | null;
}

// ── Observability ────────────────────────────────────────────────────────────────────

export type ObsRange = '1h' | '24h' | '7d' | '30d';

export interface HttpPoint {
  periodStart: string;
  count: number;
  byClass: Record<string, number>;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
}

export interface VitalsPoint {
  periodStart: string;
  heapUsedAvgMb: number | null;
  heapUsedMaxMb: number;
  rssMaxMb: number;
  eventLoopLagAvgMs: number | null;
  eventLoopLagMaxMs: number;
  cpuAvgPct: number | null;
  cpuMaxPct: number;
  inFlightMax: number;
}

export interface HttpRouteRow {
  route: string;
  method: string;
  count: number;
  errors: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
  bytesOut: number;
}

export interface HttpTailEntry {
  at: string;
  method: string;
  route: string;
  status: number;
  latencyMs: number;
}

export interface ServerAnalyticsReport {
  range: ObsRange;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  totals: {
    requests: number;
    errors4xx: number;
    errors5xx: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    maxLatencyMs: number;
    bytesOut: number;
    requestsPerSecond: number | null;
  };
  series: HttpPoint[];
  byRoute: HttpRouteRow[];
  byStatusClass: { statusClass: string; count: number }[];
  slowest: HttpRouteRow[];
  vitals: VitalsPoint[];
  live: {
    process: {
      proc: string;
      uptimeSeconds: number;
      heapUsedMb: number;
      heapTotalMb: number;
      rssMb: number;
      eventLoopLagMs: number | null;
      inFlight: number;
      nodeVersion: string;
    };
    ledger: {
      pendingHttpCells: number;
      pendingVitalsCells: number;
      lastFlushAt: string | null;
      lastFlushError: string | null;
      droppedFlushes: number;
    };
    tail: HttpTailEntry[];
  };
}

export interface ServiceHealthRow {
  service: string;
  ok: boolean;
  latencyMs: number | null;
  detail: string | null;
  uptimePct: number | null;
  checks: number;
  failures: number;
  avgLatencyMs: number | null;
  lastFailureAt: string | null;
  series: { periodStart: string; uptimePct: number | null; checks: number }[];
}

export interface ServiceHealthReport {
  range: ObsRange;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  checkedAt: string | null;
  intervalMs: number;
  retentionDays: number;
  services: ServiceHealthRow[];
  overall: { ok: boolean; degraded: string[] };
}

/** Mirrors the server's LogRecord (common/logging/logBus.ts). */
export interface LogRecord {
  time: number;
  /** pino numeric level: 10 trace, 20 debug, 30 info, 40 warn, 50 error, 60 fatal. */
  level: number;
  msg: string;
  proc: string;
  pid: number;
  reqId?: string;
  extra?: Record<string, unknown>;
}

export interface RecentLogsResponse {
  logs: LogRecord[];
  scope: string;
  logDir: string | null;
}

// ── AI usage ─────────────────────────────────────────────────────────────────────────

export type UsagePeriod = 'day' | 'week' | 'month';

export interface UsageTotals {
  calls: number;
  promptTokens: number;
  completionTokens: number;
  cachedPromptTokens: number;
  totalTokens: number;
  costUsd: number;
  unpricedCalls: number;
  noTokenPriceCalls: number;
  missingUsageCalls: number;
  failedCalls: number;
  avgLatencyMs: number | null;
}

export interface UsageBucket extends UsageTotals {
  periodStart: string;
}

export interface UsageGroup extends UsageTotals {
  key: string;
}

export interface AiUsageReport {
  period: UsagePeriod;
  from: string;
  to: string;
  totals: UsageTotals;
  series: UsageBucket[];
  byFeature: UsageGroup[];
  byModel: UsageGroup[];
  pricing: { asOf: string; usdToInr: number; knownModels: string[] };
}

// ── Broker (mStock) usage ────────────────────────────────────────────────────────────

export type BrokerUsageRange = '24h' | '7d' | '30d' | '90d';

export interface MethodCount {
  method: string;
  calls: number;
  failed: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
}

export interface BrokerRouteRow {
  route: string;
  method: string;
  calls: number;
  failed: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
  bytesIn: number;
}

export interface BrokerUsagePoint {
  periodStart: string;
  calls: number;
  failed: number;
  byMethod: Record<string, number>;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
}

export interface SocketPoint {
  periodStart: string;
  ticks: number;
  polls: number;
  connects: number;
  disconnects: number;
  reconnects: number;
}

export interface SocketScopeTotals {
  ticks: number;
  polls: number;
  connects: number;
  disconnects: number;
  reconnects: number;
  subscribes: number;
  unsubscribes: number;
  peakConnections: number;
  peakSubscribedTokens: number;
  series: SocketPoint[];
}

export interface BrokerTailEntry {
  at: string;
  method: string;
  route: string;
  status: string;
  ok: boolean;
  latencyMs: number;
}

export interface BrokerUsageReport {
  range: BrokerUsageRange;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  totals: {
    calls: number;
    failed: number;
    successRate: number | null;
    avgLatencyMs: number | null;
    maxLatencyMs: number;
    bytesIn: number;
    bytesUnknownCalls: number;
  };
  byMethod: MethodCount[];
  byRoute: BrokerRouteRow[];
  statusCounts: { status: string; count: number }[];
  series: BrokerUsagePoint[];
  socket: { equity: SocketScopeTotals; indices: SocketScopeTotals; client: SocketScopeTotals };
  live: {
    instrumentation: 'idle' | 'attached' | 'failed';
    rateLimit: { queueLength: number; ratePerSecond: number };
    rateLimitWaits: { waits: number; avgWaitMs: number | null; maxWaitMs: number };
    clientSockets: number;
    indexFeed: {
      running: boolean;
      subscribers: number;
      intervalMs: number;
      consecutiveFailures: number;
      asOf: string | null;
      /** Which broker answered the last successful poll — 'groww' while an mStock failover runs. */
      source?: 'mstock' | 'groww' | null;
      /** Index-feed failover status. Optional: an older API omits it. */
      failover?: {
        source: 'primary' | 'fallback' | null;
        failoverUntil: string | null;
        fallbackBlockedUntil: string | null;
        lastPrimaryError: string | null;
        lastFallbackError: string | null;
      };
    };
    breakers: { name: string; state: 'open' | 'closed' | 'halfOpen' }[];
    ledger: {
      pendingRestCells: number;
      pendingSocketCells: number;
      lastFlushAt: string | null;
      lastFlushError: string | null;
      droppedFlushes: number;
    };
    tail: BrokerTailEntry[];
  };
  config: { indexFeedPollMs: number };
}

// ── Users ────────────────────────────────────────────────────────────────────────────

export type PlatformUserRole = 'user' | 'admin';
export type PlatformUserApproval = 'pending' | 'approved' | 'rejected';

export interface PlatformUser {
  id: string;
  email: string;
  role: PlatformUserRole;
  approvalStatus: PlatformUserApproval;
  createdAt: string;
  updatedAt: string;
}

export type PlatformUserUpdate = Partial<Pick<PlatformUser, 'role' | 'approvalStatus'>>;

// ── Jobs ─────────────────────────────────────────────────────────────────────────────

export type AdminJobKind = 'cron' | 'queue';

export interface AdminJob {
  id: string;
  label: string;
  queue: string;
  jobName: string;
  schedule: string | null;
  /** False = the timing comes from the worker's environment (FA_WEEKLY_CRON), read-only here. */
  editable?: boolean;
  nextRunAt: string | null;
  note: string;
  manual: boolean;
  actionLabel: string | null;
  counts: Record<'waiting' | 'active' | 'delayed' | 'completed' | 'failed', number>;
}

export interface AdminJobLog {
  id: string;
  queue: string;
  name: string;
  state: string;
  createdAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
}

export interface AdminJobRunResult {
  enqueued: boolean;
  jobId: string | null;
  detail?: string;
}

// ── Catalog maintenance (/stocks/admin/*) ────────────────────────────────────────────

export type CatalogAction = 'sync' | 'groww' | 'snapshots';

export interface CatalogActionResult {
  action: CatalogAction;
  result: Record<string, unknown>;
}

// ── Browser research ─────────────────────────────────────────────────────────────────

export type BrowserResearchStatus = 'disconnected' | 'pairing' | 'connected' | 'error';

export interface BrowserResearchConfig {
  connectionStatus: BrowserResearchStatus;
  deviceName: string | null;
  lastSeenAt: string | null;
  lastError: string | null;
  pairingExpiresAt: string | null;
  endpoint: string;
  transport: 'websocket';
  tokenConfigured: boolean;
  allowedDomains: string[];
  limits: {
    maxPagesPerStock: number;
    maxPagesPerRun: number;
    requestTimeoutMs: number;
    navigationDelayMs: number;
  };
  schedule: { mode: 'manual' | 'pre-market' | 'post-market' | 'custom'; cron: string | null };
}

export type BrowserResearchScheduleMode = BrowserResearchConfig['schedule']['mode'];

/** PUT /admin/browser-research — the editable policy (the server validates it again). */
export type BrowserResearchGuardrails = Pick<
  BrowserResearchConfig,
  'allowedDomains' | 'limits' | 'schedule'
>;

export interface BrowserResearchPairing {
  code: string;
  expiresAt: string;
  installPath: string;
}

export interface BrowserResearchTestResult {
  ok: boolean;
  url?: string;
  textLength?: number;
  reason: string | null;
}

export interface BrowserResearchRun {
  id: string;
  outcome: 'success' | 'failed' | 'limited';
  pagesVisited: number;
  durationMs: number;
  tokensUsed: number;
  detail: string;
  createdAt: string;
}

// ── Live trading controls (admin writes) ─────────────────────────────────────────────

export interface KillSwitchAdminState {
  engaged: boolean;
  reason: string | null;
  engagedAt: string | null;
  engagedBy?: string | null;
}

export interface LiveTradingSettingsAdmin {
  enabled: boolean;
  updatedAt: string | null;
  updatedBy?: string | null;
}

// ── Recommendations engine ───────────────────────────────────────────────────────────

export interface ServiceSessionStatus {
  connected: boolean;
  lastRefreshedAt: string | null;
  lastError: string | null;
}

export type MstockConnectionStatus =
  'pending_verification' | 'connected' | 'disconnected' | 'error' | 'not_connected';

export interface ServiceUserOption {
  id: string;
  email: string;
  mstock: { status: MstockConnectionStatus; mfaMethod: MfaMethod | null };
}

export interface ServiceUserOptionsResponse {
  selectedUserId: string | null;
  users: ServiceUserOption[];
}

export interface ServiceAccountResult {
  userId: string;
  created: boolean;
}

export interface ServiceBrokerConnections {
  connections: BrokerConnectionSummary[];
}

/** POST /recommendations/generate and /pre-market/generate. */
export interface GenerateRunResult {
  enqueued: boolean;
  /** True when today's run was already queued or running — nothing new was started. */
  alreadyRunning?: boolean;
  jobId: string;
  date: string;
}
