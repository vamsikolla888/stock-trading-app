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

/** The ledger's providers. Ollama (the default) has no per-token price, so its usage is tokens. */
export type AiProvider = 'ollama' | 'openai';

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
  /** The provider the report is limited to (GET ?provider=); absent from an older server. */
  provider?: AiProvider | null;
  from: string;
  to: string;
  totals: UsageTotals;
  series: UsageBucket[];
  byFeature: UsageGroup[];
  byModel: UsageGroup[];
  pricing: { asOf: string; usdToInr: number; knownModels: string[] };
}

// ── Third-party API usage (mStock, Groww) ────────────────────────────────────────────
// GET /admin/broker-usage?range=&broker= — parsed by lib/apiUsage.ts into the shape below, where
// every field exists: a server older than Groww measuring sends none of the provider fields and
// refuses `broker` (strict query schema → 422), and its report is mStock's whatever was asked.

export type ApiUsageRange = '24h' | '7d' | '30d' | '90d';

/** The third-party APIs the server measures. */
export type ApiProvider = 'mstock' | 'groww';

export interface MethodCount {
  method: string;
  calls: number;
  failed: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
}

export interface ApiRouteRow {
  route: string;
  /** Budget (Groww) or purpose (mStock); null from an older server. */
  group: string | null;
  method: string;
  calls: number;
  failed: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
  bytesIn: number;
}

/** Calls per budget (Groww) or purpose (mStock), largest first. */
export interface ApiGroupRow {
  group: string;
  label: string;
  calls: number;
  failed: number;
  avgLatencyMs: number | null;
  maxLatencyMs: number;
}

/** `published` = the provider's documented limit; `self` = this platform's own throttle (mStock
 *  publishes none); `none` = no known limit. */
export type BudgetSource = 'published' | 'self' | 'none';

/** One rate limit and how close the busiest hour came to it (server broker-usage.catalog.ts). */
export interface BudgetUsage {
  /** A group key, or `all` for a budget every call shares. */
  group: string;
  label: string;
  perSecond: number | null;
  perMinute: number | null;
  perDay: number | null;
  source: BudgetSource;
  note: string;
  calls: number;
  busiestHour: { hourStart: number; calls: number } | null;
  /** The busiest hour's AVERAGE calls a minute — bursts inside the hour run higher. */
  busiestPerMinute: number | null;
  /** `busiestPerMinute` as a share of the per-minute limit; null with no limit or no calls. */
  utilisationPct: number | null;
  /** Calls since IST midnight against a per-day limit; null where there is none. */
  usedToday: number | null;
}

export interface ApiUsagePoint {
  periodStart: string;
  calls: number;
  failed: number;
  /** Null on an empty bucket — 0ms would draw a floor implying instant responses. */
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

/** One live connection held to the provider (for mStock's index strip, a poll it fans out). */
export interface FeedBlock {
  key: string;
  label: string;
  detail: string;
  totals: SocketScopeTotals;
}

/** One of this process's token buckets — one for mStock, one per budget for Groww. */
export interface ApiLimiter {
  group: string;
  label: string;
  queueLength: number;
  ratePerSecond: number;
}

export interface ApiTailEntry {
  at: string;
  method: string;
  route: string;
  /** An HTTP code, or a failure kind when nothing answered (`timeout`, `network`, …). */
  status: string;
  ok: boolean;
  latencyMs: number;
}

export type BreakerState = 'open' | 'closed' | 'halfOpen';

export interface ApiUsageReport {
  range: ApiUsageRange;
  /** The provider every figure describes. */
  provider: ApiProvider;
  /** False when the server did not say (an older server: the report is mStock's). */
  providerReported: boolean;
  bucket: 'hour' | 'day';
  from: string;
  to: string;
  totals: {
    calls: number;
    failed: number;
    /** Null with no calls — not 100, which would claim a record never tested. */
    successRate: number | null;
    avgLatencyMs: number | null;
    maxLatencyMs: number;
    /** A floor: some responses carry no size (see bytesUnknownCalls). */
    bytesIn: number;
    bytesUnknownCalls: number;
  };
  byMethod: MethodCount[];
  byRoute: ApiRouteRow[];
  byGroup: ApiGroupRow[];
  budgets: BudgetUsage[];
  feeds: FeedBlock[];
  statusCounts: { status: string; count: number }[];
  series: ApiUsagePoint[];
  /** THIS server process only — never a cluster-wide figure. */
  live: {
    /** `idle` = no call made in this process yet, `attached` = measuring, `failed` = the mStock
     *  SDK hook broke and REST counts are structurally zero. */
    instrumentation: 'idle' | 'attached' | 'failed';
    limiters: ApiLimiter[];
    /** Groww only: users whose live feed is connected in this process right now. */
    feedConnections: number | null;
    rateLimitWaits: { waits: number; avgWaitMs: number | null; maxWaitMs: number };
    indexFeed: {
      running: boolean;
      subscribers: number;
      intervalMs: number;
      consecutiveFailures: number;
      asOf: string | null;
      /** Which broker answered the last successful poll — 'groww' while an mStock failover runs. */
      source: 'mstock' | 'groww' | null;
    };
    breakers: { name: string; state: BreakerState | string }[];
    ledger: {
      pendingRestCells: number;
      lastFlushAt: string | null;
      lastFlushError: string | null;
      droppedFlushes: number;
    };
    tail: ApiTailEntry[];
  };
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

// ── News ingestion runs (GET /news/runs, POST /news/ingest) ──────────────────────────

export type NewsRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';

/** OK = produced items; EMPTY = ran and returned nothing (the normal case for sites that block
 *  automated readers); FAILED = the provider's workflow errored or never reported back. */
export type NewsRunStageStatus = 'PENDING' | 'RUNNING' | 'OK' | 'EMPTY' | 'FAILED';

/** One provider's progress inside a batch. */
export interface NewsRunStage {
  key: string;
  label: string;
  status: NewsRunStageStatus;
  detail: string | null;
  itemCount: number | null;
}

/** One ingestion batch with its per-provider timeline, parsed by lib/jobs.ts. */
export interface AdminNewsRun {
  runId: string;
  status: NewsRunStatus;
  trigger: 'MANUAL' | 'SCHEDULED';
  startedAt: string;
  finishedAt: string | null;
  stages: NewsRunStage[];
  /** Articles written for this run; null when the server did not say. */
  inserted: number | null;
  errorMessage: string | null;
}

export interface AdminNewsRunsPage {
  runs: AdminNewsRun[];
  total: number;
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

/* ── Admin › Groww access token (server: modules/broker-token-reveal) ── */

/** POST /admin/broker-tokens/groww/code — a 6-digit code emailed to the admin's own address. */
export interface RevealCodeSent {
  /** Masked address the code went to. */
  sentTo: string;
  expiresAt: string;
  /** Codes left in this 15-minute window. */
  codesLeft: number;
}

export interface RevealedConnection {
  connectionId: string;
  accountLabel: string | null;
  status: string;
  token: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  expired: boolean;
  minutesLeft: number | null;
  note: string | null;
}

/** POST /admin/broker-tokens/groww/reveal — the caller's OWN Groww connections. Read-only. */
export interface RevealResult {
  revealedAt: string;
  visibleForSeconds: number;
  connections: RevealedConnection[];
}
