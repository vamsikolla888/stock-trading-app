import type { StatusTone } from '@/features/settings/lib/status';
import { isApiError } from '@/types/api';

import type {
  ApiGroupRow,
  ApiLimiter,
  ApiProvider,
  ApiRouteRow,
  ApiTailEntry,
  ApiUsagePoint,
  ApiUsageRange,
  ApiUsageReport,
  BudgetSource,
  BudgetUsage,
  FeedBlock,
  MethodCount,
  SocketPoint,
  SocketScopeTotals,
} from '../types';

/**
 * Admin › Third-party API usage (web: lib/apiUsage.ts) — the parsing, wording and arithmetic
 * behind the screen, dependency-free so it is pinned by tests. One screen for every provider,
 * the same four questions in the same places: how much (traffic), how well (errors, latency),
 * how close to the limit (budgets), and what is connected right now.
 */

export const API_PROVIDERS: readonly { key: ApiProvider; label: string; about: string }[] = [
  {
    key: 'mstock',
    label: 'mStock',
    about: 'Quotes, candles, the index strip, the equity live feed and mStock orders',
  },
  {
    key: 'groww',
    label: 'Groww',
    about: 'F&O chain and live feed, Groww holdings and orders, token minting',
  },
];

export function providerLabel(provider: ApiProvider): string {
  return API_PROVIDERS.find((p) => p.key === provider)?.label ?? provider;
}

// ── Parsing ────────────────────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
/** A finite number, or null — never NaN. */
const num = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
/** A count: a missing or broken figure is 0, not NaN. */
const count = (value: unknown): number => Math.max(0, num(value) ?? 0);

const RANGES: readonly ApiUsageRange[] = ['24h', '7d', '30d', '90d'];
const PROVIDERS: readonly ApiProvider[] = ['mstock', 'groww'];
const SOURCES: readonly BudgetSource[] = ['published', 'self', 'none'];

function asProvider(value: unknown): ApiProvider | null {
  return (PROVIDERS as readonly unknown[]).includes(value) ? (value as ApiProvider) : null;
}

function socketPoint(raw: unknown): SocketPoint | null {
  const p = obj(raw);
  const periodStart = text(p.periodStart);
  if (!periodStart) return null;
  return {
    periodStart,
    ticks: count(p.ticks),
    polls: count(p.polls),
    connects: count(p.connects),
    disconnects: count(p.disconnects),
    reconnects: count(p.reconnects),
  };
}

function socketScope(raw: unknown): SocketScopeTotals {
  const s = obj(raw);
  return {
    ticks: count(s.ticks),
    polls: count(s.polls),
    connects: count(s.connects),
    disconnects: count(s.disconnects),
    reconnects: count(s.reconnects),
    subscribes: count(s.subscribes),
    unsubscribes: count(s.unsubscribes),
    peakConnections: count(s.peakConnections),
    peakSubscribedTokens: count(s.peakSubscribedTokens),
    series: list(s.series)
      .map(socketPoint)
      .filter((p): p is SocketPoint => p !== null),
  };
}

function methodRow(raw: unknown): MethodCount | null {
  const r = obj(raw);
  const method = text(r.method);
  if (!method) return null;
  return {
    method,
    calls: count(r.calls),
    failed: count(r.failed),
    avgLatencyMs: num(r.avgLatencyMs),
    maxLatencyMs: count(r.maxLatencyMs),
  };
}

function routeRow(raw: unknown): ApiRouteRow | null {
  const r = obj(raw);
  const route = text(r.route);
  if (!route) return null;
  return {
    route,
    group: text(r.group),
    method: text(r.method) ?? 'GET',
    calls: count(r.calls),
    failed: count(r.failed),
    avgLatencyMs: num(r.avgLatencyMs),
    maxLatencyMs: count(r.maxLatencyMs),
    bytesIn: count(r.bytesIn),
  };
}

function groupRow(raw: unknown): ApiGroupRow | null {
  const r = obj(raw);
  const group = text(r.group);
  if (!group) return null;
  return {
    group,
    label: text(r.label) ?? group,
    calls: count(r.calls),
    failed: count(r.failed),
    avgLatencyMs: num(r.avgLatencyMs),
    maxLatencyMs: count(r.maxLatencyMs),
  };
}

function budgetRow(raw: unknown): BudgetUsage | null {
  const b = obj(raw);
  const group = text(b.group);
  if (!group) return null;
  const peak = obj(b.busiestHour);
  const peakStart = num(peak.hourStart);
  const source = (SOURCES as readonly unknown[]).includes(b.source)
    ? (b.source as BudgetSource)
    : 'none';
  return {
    group,
    label: text(b.label) ?? group,
    perSecond: num(b.perSecond),
    perMinute: num(b.perMinute),
    perDay: num(b.perDay),
    source,
    note: text(b.note) ?? '',
    calls: count(b.calls),
    busiestHour: peakStart != null ? { hourStart: peakStart, calls: count(peak.calls) } : null,
    busiestPerMinute: num(b.busiestPerMinute),
    utilisationPct: num(b.utilisationPct),
    usedToday: num(b.usedToday),
  };
}

function feedBlock(raw: unknown): FeedBlock | null {
  const f = obj(raw);
  const key = text(f.key);
  if (!key) return null;
  return {
    key,
    label: text(f.label) ?? key,
    detail: text(f.detail) ?? '',
    totals: socketScope(f.totals),
  };
}

function usagePoint(raw: unknown): ApiUsagePoint | null {
  const p = obj(raw);
  const periodStart = text(p.periodStart);
  if (!periodStart) return null;
  return {
    periodStart,
    calls: count(p.calls),
    failed: count(p.failed),
    avgLatencyMs: num(p.avgLatencyMs),
    maxLatencyMs: count(p.maxLatencyMs),
  };
}

function limiterRow(raw: unknown): ApiLimiter | null {
  const l = obj(raw);
  const group = text(l.group);
  if (!group) return null;
  return {
    group,
    label: text(l.label) ?? group,
    queueLength: count(l.queueLength),
    ratePerSecond: count(l.ratePerSecond),
  };
}

function tailEntry(raw: unknown): ApiTailEntry | null {
  const t = obj(raw);
  const at = text(t.at);
  const route = text(t.route);
  if (!at || !route) return null;
  const status = text(t.status) ?? (num(t.status) != null ? String(t.status) : 'unknown');
  return {
    at,
    method: text(t.method) ?? 'GET',
    route,
    status,
    ok: typeof t.ok === 'boolean' ? t.ok : isSuccessStatus(status),
    latencyMs: count(t.latencyMs),
  };
}

const compact = <T>(rows: readonly (T | null)[]): T[] => rows.filter((r): r is T => r !== null);

/**
 * GET /admin/broker-usage → a report where every field exists. A server older than Groww
 * measuring sends no `provider`, `byGroup`, `budgets`, `feeds`, `limiters` or `feedConnections`:
 * its report is mStock's, its live connections are read from the old `socket` block, and its one
 * token bucket stands in for the limiter list. Nothing is estimated — a missing figure is 0 for
 * a count and null for a measurement.
 */
export function normalizeApiUsage(raw: unknown): ApiUsageReport {
  const r = obj(raw);
  const reported = asProvider(r.provider);
  const provider = reported ?? 'mstock';
  const totals = obj(r.totals);
  const live = obj(r.live);
  const socket = obj(r.socket);
  const rateLimit = obj(live.rateLimit);
  const waits = obj(live.rateLimitWaits);
  const indexFeed = obj(live.indexFeed);
  const ledger = obj(live.ledger);

  const feeds = Array.isArray(r.feeds)
    ? compact(r.feeds.map(feedBlock))
    : provider === 'mstock'
      ? [
          {
            key: 'broker',
            label: 'Equity live feed',
            detail: 'mStock WebSocket — stock ticks',
            totals: socketScope(socket.equity),
          },
          {
            key: 'indices',
            label: 'Index strip',
            detail: 'REST polls to mStock, pushed to the app',
            totals: socketScope(socket.indices),
          },
        ]
      : [];

  const limiters = Array.isArray(live.limiters)
    ? compact(live.limiters.map(limiterRow))
    : Object.keys(rateLimit).length > 0
      ? [
          {
            group: 'all',
            label: 'Every call',
            queueLength: count(rateLimit.queueLength),
            ratePerSecond: count(rateLimit.ratePerSecond),
          },
        ]
      : [];

  const instrumentation =
    live.instrumentation === 'attached' || live.instrumentation === 'failed'
      ? live.instrumentation
      : 'idle';
  const feedSource =
    indexFeed.source === 'mstock' || indexFeed.source === 'groww' ? indexFeed.source : null;

  return {
    range: (RANGES as readonly unknown[]).includes(r.range) ? (r.range as ApiUsageRange) : '24h',
    provider,
    providerReported: reported !== null,
    bucket: r.bucket === 'day' ? 'day' : 'hour',
    from: text(r.from) ?? '',
    to: text(r.to) ?? '',
    totals: {
      calls: count(totals.calls),
      failed: count(totals.failed),
      successRate: num(totals.successRate),
      avgLatencyMs: num(totals.avgLatencyMs),
      maxLatencyMs: count(totals.maxLatencyMs),
      bytesIn: count(totals.bytesIn),
      bytesUnknownCalls: count(totals.bytesUnknownCalls),
    },
    byMethod: compact(list(r.byMethod).map(methodRow)),
    byRoute: compact(list(r.byRoute).map(routeRow)),
    byGroup: compact(list(r.byGroup).map(groupRow)),
    budgets: compact(list(r.budgets).map(budgetRow)),
    feeds,
    statusCounts: compact(
      list(r.statusCounts).map((raw) => {
        const s = obj(raw);
        const status = text(s.status) ?? (num(s.status) != null ? String(s.status) : null);
        return status ? { status, count: count(s.count) } : null;
      }),
    ),
    series: compact(list(r.series).map(usagePoint)),
    live: {
      instrumentation,
      limiters,
      feedConnections: num(live.feedConnections),
      rateLimitWaits: {
        waits: count(waits.waits),
        avgWaitMs: num(waits.avgWaitMs),
        maxWaitMs: count(waits.maxWaitMs),
      },
      indexFeed: {
        running: indexFeed.running === true,
        subscribers: count(indexFeed.subscribers),
        intervalMs: count(indexFeed.intervalMs),
        consecutiveFailures: count(indexFeed.consecutiveFailures),
        asOf: text(indexFeed.asOf),
        source: feedSource,
      },
      breakers: compact(
        list(live.breakers).map((raw) => {
          const b = obj(raw);
          const name = text(b.name);
          return name ? { name, state: text(b.state) ?? 'closed' } : null;
        }),
      ),
      ledger: {
        pendingRestCells: count(ledger.pendingRestCells),
        lastFlushAt: text(ledger.lastFlushAt),
        lastFlushError: text(ledger.lastFlushError),
        droppedFlushes: count(ledger.droppedFlushes),
      },
      tail: compact(list(live.tail).map(tailEntry)),
    },
  };
}

/**
 * True when Groww was asked for and this server cannot answer it: it refused the `broker`
 * parameter (422 from its strict query schema) or answered without naming a provider (then the
 * figures are mStock's). The screen then shows the mStock report with a notice, never mStock
 * figures labelled as Groww.
 */
export function growwUnsupported(
  asked: ApiProvider,
  error: unknown,
  data: Pick<ApiUsageReport, 'providerReported' | 'provider'> | undefined,
): boolean {
  if (asked !== 'groww') return false;
  if (data) return !data.providerReported || data.provider !== 'groww';
  return isApiError(error) && error.status === 422;
}

// ── Outcomes ───────────────────────────────────────────────────────────────────────────

/** What a status means, in words — `408` alone says nothing to most readers. Non-HTTP outcomes
 *  (no response at all) are recorded under their own names, never as a code. */
const MEANINGS: Record<string, string> = {
  '200': 'OK',
  '201': 'Created',
  '204': 'No content',
  '304': 'Not modified',
  '400': 'Bad request',
  '401': 'Credentials refused',
  '403': 'Not permitted',
  '404': 'Not found',
  '408': 'Timed out at the provider',
  '409': 'Conflict',
  '422': 'Rejected',
  '429': 'Rate limited',
  '500': 'Provider error',
  '502': 'Bad gateway',
  '503': 'Provider unavailable',
  '504': 'Gateway timeout',
  timeout: 'No response — timed out',
  network: 'No response — network error',
  aborted: 'No response — cancelled',
  econnreset: 'No response — connection reset',
  econnrefused: 'No response — connection refused',
  enotfound: 'No response — host not found',
};

export function statusMeaning(status: string): string {
  return (
    MEANINGS[status] ?? (/^\d{3}$/.test(status) ? `HTTP ${status}` : `No response — ${status}`)
  );
}

/** A call counts as answered-and-fine for 2xx/3xx only. */
export function isSuccessStatus(status: string): boolean {
  return /^[23]\d\d$/.test(status);
}

/** Rate-limited and timed-out calls are worth watching; anything else that failed is an error. */
export function statusTone(status: string): StatusTone {
  if (isSuccessStatus(status)) return 'ok';
  if (status === '429' || status === '408') return 'warn';
  return 'bad';
}

export interface FailureReason {
  status: string;
  meaning: string;
  count: number;
  /** Share of all FAILED calls, 0–100. */
  share: number;
}

/** Every failure outcome, most common first — the "why" behind the error rate. */
export function failureReasons(
  statusCounts: readonly { status: string; count: number }[],
): FailureReason[] {
  const failed = statusCounts.filter((s) => !isSuccessStatus(s.status) && s.count > 0);
  const total = failed.reduce((n, s) => n + s.count, 0);
  return failed
    .map((s) => ({
      status: s.status,
      meaning: statusMeaning(s.status),
      count: s.count,
      share: total > 0 ? (s.count / total) * 100 : 0,
    }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

// ── Budgets ────────────────────────────────────────────────────────────────────────────

/** Utilisation tone: comfortable under half, worth watching from half, close from 80%. */
export function budgetTone(pct: number | null): StatusTone {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'bad';
  if (pct >= 50) return 'warn';
  return 'ok';
}

/** The budget the busiest hour came closest to, or null when none is measured. */
export function tightestBudget(budgets: readonly BudgetUsage[]): BudgetUsage | null {
  let best: BudgetUsage | null = null;
  for (const b of budgets) {
    if (b.utilisationPct == null) continue;
    if (!best || b.utilisationPct > (best.utilisationPct ?? 0)) best = b;
  }
  return best;
}

/** 4.2 → "4.2%", 63.4 → "63%". */
export function formatSharePct(pct: number): string {
  return pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
}

const perMinute = (n: number): string =>
  n >= 100 ? Math.round(n).toLocaleString('en-IN') : n >= 10 ? n.toFixed(0) : n.toFixed(1);

/** The figure beside a budget's meter. */
export function budgetUsedLabel(b: BudgetUsage): string {
  if (b.utilisationPct != null) return `${formatSharePct(b.utilisationPct)} of limit`;
  return b.source === 'none' ? 'No limit' : 'Unused';
}

/** One line under a budget's meter, in words — and whose limit it is. */
export function budgetLine(b: BudgetUsage): string {
  if (b.source === 'none') {
    return b.calls > 0 ? `${b.note} · ${b.calls.toLocaleString('en-IN')} calls` : b.note;
  }
  const limit =
    b.perMinute != null
      ? `${b.perMinute.toLocaleString('en-IN')} a minute ${b.source === 'self' ? '(our own throttle)' : 'allowed'}`
      : 'no per-minute limit';
  if (b.busiestPerMinute == null) return `Not used in this window · ${limit}`;
  return `Busiest hour averaged ${perMinute(b.busiestPerMinute)} a minute · ${limit}`;
}

/** Average calls a minute across the whole window, or null with no calls. */
export function averagePerMinute(calls: number, fromIso: string, toIso: string): number | null {
  const minutes = (Date.parse(toIso) - Date.parse(fromIso)) / 60_000;
  return Number.isFinite(minutes) && minutes > 0 && calls > 0 ? calls / minutes : null;
}

export function formatPerMinute(value: number): string {
  return value >= 10 ? String(Math.round(value)) : value.toFixed(1);
}

// ── The verdict ────────────────────────────────────────────────────────────────────────

export interface UsageVerdict {
  tone: StatusTone;
  text: string;
}

/**
 * The screen's one-line verdict, worst first: not measuring > a breaker open > failure rate >
 * a budget nearly spent > calls queued behind our own throttle. No calls is said as such, never
 * as "healthy".
 */
export function usageVerdict(
  r: Pick<ApiUsageReport, 'totals' | 'budgets'> & {
    live: Pick<ApiUsageReport['live'], 'instrumentation' | 'breakers' | 'limiters'>;
  },
): UsageVerdict {
  if (r.live.instrumentation === 'failed') {
    return { tone: 'bad', text: 'Not measuring — the usage hook did not attach' };
  }
  const open = r.live.breakers.filter((b) => b.state === 'open');
  if (open.length > 0) {
    return {
      tone: 'bad',
      text: `${open.length === 1 ? open[0]!.name : `${open.length} circuits`} open — calls are being refused`,
    };
  }
  const { calls, failed } = r.totals;
  if (calls === 0) return { tone: 'neutral', text: 'No calls in this window' };
  const failRate = (failed / calls) * 100;
  if (failRate >= 5) return { tone: 'bad', text: `${formatSharePct(failRate)} of calls failed` };
  const tight = tightestBudget(r.budgets);
  if (tight && (tight.utilisationPct ?? 0) >= 80) {
    return { tone: 'warn', text: `${tight.label} nearly at its limit` };
  }
  if (failRate >= 1) return { tone: 'warn', text: `${formatSharePct(failRate)} of calls failed` };
  const queued = r.live.limiters.reduce((n, l) => n + l.queueLength, 0);
  if (queued > 0) {
    return {
      tone: 'warn',
      text: `${queued} call${queued === 1 ? '' : 's'} waiting on our throttle now`,
    };
  }
  return { tone: 'ok', text: 'Healthy' };
}

// ── Endpoints, feeds, the process ──────────────────────────────────────────────────────

/** The endpoints of one group ('all' for every one), busiest first as the server sent them. */
export function endpointsIn(rows: readonly ApiRouteRow[], group: string): ApiRouteRow[] {
  return group === 'all' ? [...rows] : rows.filter((row) => row.group === group);
}

/** A route's group, as the report labels it. */
export function groupLabel(groups: readonly ApiGroupRow[], key: string | null): string | null {
  if (!key) return null;
  return groups.find((g) => g.group === key)?.label ?? key;
}

/** Calls per bucket split into the two stacked series the chart draws. */
export function callSeries(series: readonly ApiUsagePoint[]): { ok: number[]; failed: number[] } {
  return {
    ok: series.map((p) => Math.max(0, p.calls - p.failed)),
    failed: series.map((p) => p.failed),
  };
}

/** The index strip is a REST poller, not a socket: its messages are polls, its viewers peak. */
export function isPollFeed(feed: Pick<FeedBlock, 'key'>): boolean {
  return feed.key === 'indices';
}

/** Nothing happened on a feed in the window — said in words rather than an empty chart. */
export function isQuietFeed(feed: Pick<FeedBlock, 'totals'>): boolean {
  const t = feed.totals;
  return t.ticks + t.polls + t.connects + t.reconnects === 0;
}

export const BREAKER_STATE: Record<string, { tone: StatusTone; label: string }> = {
  closed: { tone: 'ok', label: 'Closed' },
  halfOpen: { tone: 'warn', label: 'Testing' },
  open: { tone: 'bad', label: 'Open' },
};

export function instrumentationState(state: ApiUsageReport['live']['instrumentation']): {
  tone: StatusTone;
  label: string;
} {
  if (state === 'attached') return { tone: 'ok', label: 'Measuring' };
  if (state === 'failed') return { tone: 'bad', label: 'Not measuring' };
  return { tone: 'neutral', label: 'No call yet' };
}
