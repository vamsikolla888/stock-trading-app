import { ApiError } from '@/types/api';

import {
  averagePerMinute,
  budgetLine,
  budgetTone,
  budgetUsedLabel,
  callSeries,
  endpointsIn,
  failureReasons,
  groupLabel,
  growwUnsupported,
  instrumentationState,
  isPollFeed,
  isQuietFeed,
  isSuccessStatus,
  normalizeApiUsage,
  statusMeaning,
  statusTone,
  tightestBudget,
  usageVerdict,
} from '../lib/apiUsage';
import type { ApiUsageReport, BudgetUsage } from '../types';

const scope = (over: Record<string, unknown> = {}) => ({
  ticks: 0,
  polls: 0,
  connects: 0,
  disconnects: 0,
  reconnects: 0,
  subscribes: 0,
  unsubscribes: 0,
  peakConnections: 0,
  peakSubscribedTokens: 0,
  series: [],
  ...over,
});

/** A report as a server from before Groww measuring sends it (mStock only). */
const oldServer = {
  range: '24h',
  bucket: 'hour',
  from: '2026-10-04T00:00:00.000Z',
  to: '2026-10-05T00:00:00.000Z',
  totals: {
    calls: 1200,
    failed: 6,
    successRate: 99.5,
    avgLatencyMs: 84,
    maxLatencyMs: 900,
    bytesIn: 4096,
    bytesUnknownCalls: 3,
  },
  byMethod: [{ method: 'GET', calls: 1200, failed: 6, avgLatencyMs: 84, maxLatencyMs: 900 }],
  byRoute: [
    {
      route: '/instruments/quote/ltp',
      method: 'GET',
      calls: 1200,
      failed: 6,
      avgLatencyMs: 84,
      maxLatencyMs: 900,
      bytesIn: 4096,
    },
  ],
  statusCounts: [
    { status: '200', count: 1194 },
    { status: '429', count: 4 },
    { status: 'timeout', count: 2 },
  ],
  series: [
    {
      periodStart: '2026-10-04T00:00:00.000Z',
      calls: 10,
      failed: 1,
      byMethod: {},
      avgLatencyMs: null,
      maxLatencyMs: 0,
    },
  ],
  socket: {
    equity: scope({ ticks: 500, connects: 1 }),
    indices: scope({ polls: 80, ticks: 40 }),
    client: scope(),
  },
  live: {
    instrumentation: 'attached',
    rateLimit: { queueLength: 2, ratePerSecond: 8 },
    rateLimitWaits: { waits: 3, avgWaitMs: 120, maxWaitMs: 300 },
    clientSockets: 4,
    indexFeed: {
      running: true,
      subscribers: 2,
      intervalMs: 2000,
      consecutiveFailures: 0,
      asOf: null,
    },
    breakers: [{ name: 'mstock:rest', state: 'closed' }],
    ledger: {
      pendingRestCells: 1,
      pendingSocketCells: 0,
      lastFlushAt: '2026-10-05T00:00:00.000Z',
      lastFlushError: null,
      droppedFlushes: 0,
    },
    tail: [
      {
        at: '2026-10-05T00:00:00.000Z',
        method: 'GET',
        route: '/instruments/quote/ltp',
        status: '200',
        ok: true,
        latencyMs: 80,
      },
    ],
  },
  config: { indexFeedPollMs: 2000 },
};

const budget = (over: Partial<BudgetUsage> = {}): BudgetUsage => ({
  group: 'orders',
  label: 'Orders',
  perSecond: 10,
  perMinute: 250,
  perDay: null,
  source: 'published',
  note: 'Place, modify and cancel',
  calls: 0,
  busiestHour: null,
  busiestPerMinute: null,
  utilisationPct: null,
  usedToday: null,
  ...over,
});

describe('normalizeApiUsage', () => {
  it('reads an older server as mStock, with its sockets as the live connections', () => {
    const report = normalizeApiUsage(oldServer);
    expect(report.provider).toBe('mstock');
    expect(report.providerReported).toBe(false);
    expect(report.byGroup).toEqual([]);
    expect(report.budgets).toEqual([]);
    expect(report.byRoute[0]?.group).toBeNull();
    expect(report.feeds.map((f) => [f.key, f.label])).toEqual([
      ['broker', 'Equity live feed'],
      ['indices', 'Index strip'],
    ]);
    expect(report.feeds[0]?.totals.ticks).toBe(500);
    expect(report.feeds[1]?.totals.polls).toBe(80);
    // The one token bucket stands in for the limiter list.
    expect(report.live.limiters).toEqual([
      { group: 'all', label: 'Every call', queueLength: 2, ratePerSecond: 8 },
    ]);
    expect(report.live.feedConnections).toBeNull();
    expect(report.live.indexFeed.source).toBeNull();
    expect(report.series[0]?.avgLatencyMs).toBeNull();
  });

  it('keeps the provider fields a current server sends', () => {
    const report = normalizeApiUsage({
      ...oldServer,
      provider: 'groww',
      providers: ['mstock', 'groww'],
      byRoute: [{ route: '/v1/order/create', group: 'orders', method: 'POST', calls: 3 }],
      byGroup: [{ group: 'orders', label: 'Orders', calls: 3, failed: 0, maxLatencyMs: 40 }],
      budgets: [
        {
          group: 'orders',
          label: 'Orders',
          perSecond: 10,
          perMinute: 250,
          perDay: null,
          source: 'published',
          note: 'Place, modify and cancel',
          calls: 3,
          busiestHour: { hourStart: 1_759_622_400_000, calls: 3 },
          busiestPerMinute: 0.05,
          utilisationPct: 0.02,
          usedToday: null,
        },
        { group: 'historical', label: 'Historical candles', source: 'mystery' },
      ],
      feeds: [{ key: 'groww-feed', label: 'Live feed', detail: 'Groww WebSocket', totals: {} }],
      live: {
        ...oldServer.live,
        limiters: [{ group: 'orders', label: 'Orders', queueLength: 0, ratePerSecond: 9 }],
        feedConnections: 2,
      },
    });
    expect(report.provider).toBe('groww');
    expect(report.providerReported).toBe(true);
    expect(report.byRoute[0]).toMatchObject({ group: 'orders', bytesIn: 0, avgLatencyMs: null });
    expect(report.byGroup[0]).toMatchObject({ group: 'orders', calls: 3, avgLatencyMs: null });
    expect(report.budgets[0]?.busiestHour).toEqual({ hourStart: 1_759_622_400_000, calls: 3 });
    // An unknown limit source is never presented as a published limit.
    expect(report.budgets[1]?.source).toBe('none');
    expect(report.budgets[1]?.perMinute).toBeNull();
    expect(report.feeds).toHaveLength(1);
    expect(report.feeds[0]?.totals.series).toEqual([]);
    expect(report.live.limiters).toHaveLength(1);
    expect(report.live.feedConnections).toBe(2);
  });

  it('survives garbage without throwing or inventing figures', () => {
    const report = normalizeApiUsage({ totals: { calls: 'x', failed: Number.NaN }, live: null });
    expect(report.totals).toMatchObject({ calls: 0, failed: 0, successRate: null });
    expect(report.live.instrumentation).toBe('idle');
    expect(report.live.tail).toEqual([]);
    expect(report.range).toBe('24h');
    expect(normalizeApiUsage(null).feeds).toHaveLength(2);
    expect(normalizeApiUsage({ provider: 'groww' }).feeds).toEqual([]);
  });

  it('drops rows it cannot name', () => {
    const report = normalizeApiUsage({
      byRoute: [{ calls: 3 }],
      byGroup: [{ label: 'x' }],
      statusCounts: [{ status: 503, count: 2 }, { count: 1 }],
      live: { tail: [{ at: 'x' }, { at: 't', route: '/r', status: 'timeout' }] },
    });
    expect(report.byRoute).toEqual([]);
    expect(report.byGroup).toEqual([]);
    expect(report.statusCounts).toEqual([{ status: '503', count: 2 }]);
    expect(report.live.tail).toEqual([
      { at: 't', method: 'GET', route: '/r', status: 'timeout', ok: false, latencyMs: 0 },
    ]);
  });
});

describe('growwUnsupported', () => {
  const refused = new ApiError({ status: 422, code: 'VALIDATION_ERROR', message: 'broker' });
  it('falls back only for Groww on a server that cannot answer it', () => {
    expect(growwUnsupported('mstock', refused, undefined)).toBe(false);
    expect(growwUnsupported('groww', refused, undefined)).toBe(true);
    expect(growwUnsupported('groww', new Error('offline'), undefined)).toBe(false);
  });

  it('treats a report that names no provider as mStock’s', () => {
    expect(growwUnsupported('groww', null, { providerReported: false, provider: 'mstock' })).toBe(
      true,
    );
    expect(growwUnsupported('groww', null, { providerReported: true, provider: 'groww' })).toBe(
      false,
    );
  });
});

describe('outcomes', () => {
  it('says what a status means', () => {
    expect(statusMeaning('429')).toBe('Rate limited');
    expect(statusMeaning('418')).toBe('HTTP 418');
    expect(statusMeaning('timeout')).toBe('No response — timed out');
    expect(statusMeaning('eaddrinuse')).toBe('No response — eaddrinuse');
  });

  it('counts 2xx and 3xx as success and tones the rest', () => {
    expect(isSuccessStatus('204')).toBe(true);
    expect(isSuccessStatus('304')).toBe(true);
    expect(isSuccessStatus('404')).toBe(false);
    expect(statusTone('200')).toBe('ok');
    expect(statusTone('429')).toBe('warn');
    expect(statusTone('408')).toBe('warn');
    expect(statusTone('network')).toBe('bad');
  });

  it('lists failure reasons most common first, as a share of failures', () => {
    const reasons = failureReasons(normalizeApiUsage(oldServer).statusCounts);
    expect(reasons.map((r) => [r.status, r.count, Math.round(r.share)])).toEqual([
      ['429', 4, 67],
      ['timeout', 2, 33],
    ]);
    expect(failureReasons([{ status: '200', count: 5 }])).toEqual([]);
  });
});

describe('budgets', () => {
  it('tones utilisation: comfortable, worth watching from half, close from 80%', () => {
    expect(budgetTone(null)).toBe('neutral');
    expect(budgetTone(10)).toBe('ok');
    expect(budgetTone(50)).toBe('warn');
    expect(budgetTone(80)).toBe('bad');
  });

  it('finds the budget the busiest hour came closest to', () => {
    const a = budget({ group: 'a', utilisationPct: 12 });
    const b = budget({ group: 'b', utilisationPct: 61 });
    const none = budget({ group: 'c', source: 'none', perMinute: null });
    expect(tightestBudget([a, none, b])?.group).toBe('b');
    expect(tightestBudget([none])).toBeNull();
  });

  it('says whose limit it is and how busy the busiest hour was', () => {
    expect(budgetLine(budget())).toBe('Not used in this window · 250 a minute allowed');
    expect(budgetLine(budget({ busiestPerMinute: 4.25, utilisationPct: 1.7 }))).toBe(
      'Busiest hour averaged 4.3 a minute · 250 a minute allowed',
    );
    expect(
      budgetLine(budget({ source: 'self', perMinute: 480, busiestPerMinute: 150, label: 'All' })),
    ).toBe('Busiest hour averaged 150 a minute · 480 a minute (our own throttle)');
    expect(
      budgetLine(budget({ source: 'none', note: 'Groww publishes no limit', calls: 12 })),
    ).toBe('Groww publishes no limit · 12 calls');
    expect(budgetUsedLabel(budget({ utilisationPct: 4.21 }))).toBe('4.2% of limit');
    expect(budgetUsedLabel(budget({ utilisationPct: 63.4 }))).toBe('63% of limit');
    expect(budgetUsedLabel(budget({ source: 'none' }))).toBe('No limit');
    expect(budgetUsedLabel(budget())).toBe('Unused');
  });
});

describe('usageVerdict', () => {
  const base = (over: Partial<ApiUsageReport> = {}) => {
    const r = normalizeApiUsage(oldServer);
    return { ...r, ...over, live: { ...r.live, limiters: [], ...over.live } };
  };

  it('puts not measuring and open circuits first', () => {
    expect(usageVerdict(base({ live: { ...base().live, instrumentation: 'failed' } })).tone).toBe(
      'bad',
    );
    expect(
      usageVerdict(
        base({ live: { ...base().live, breakers: [{ name: 'mstock:rest', state: 'open' }] } }),
      ).text,
    ).toBe('mstock:rest open — calls are being refused');
  });

  it('never calls an empty window healthy', () => {
    const r = base({ totals: { ...base().totals, calls: 0, failed: 0 } });
    expect(usageVerdict(r)).toEqual({ tone: 'neutral', text: 'No calls in this window' });
  });

  it('weighs failures, budgets and the queue in that order', () => {
    expect(usageVerdict(base({ totals: { ...base().totals, failed: 120 } })).text).toBe(
      '10% of calls failed',
    );
    expect(usageVerdict(base({ budgets: [budget({ utilisationPct: 85 })] })).text).toBe(
      'Orders nearly at its limit',
    );
    expect(usageVerdict(base({ totals: { ...base().totals, failed: 24 } })).tone).toBe('warn');
    const queued = base();
    queued.live.limiters = [
      { group: 'all', label: 'Every call', queueLength: 1, ratePerSecond: 8 },
    ];
    expect(usageVerdict(queued).text).toBe('1 call waiting on our throttle now');
    expect(usageVerdict(base())).toEqual({ tone: 'ok', text: 'Healthy' });
  });
});

describe('helpers', () => {
  it('averages calls a minute over the window', () => {
    expect(averagePerMinute(1440, '2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z')).toBe(1);
    expect(averagePerMinute(0, '2026-10-04T00:00:00Z', '2026-10-05T00:00:00Z')).toBeNull();
    expect(averagePerMinute(5, '', '')).toBeNull();
  });

  it('filters endpoints by group and labels them', () => {
    const rows = normalizeApiUsage({
      byRoute: [
        { route: '/a', group: 'orders', calls: 2 },
        { route: '/b', group: 'live', calls: 1 },
      ],
    }).byRoute;
    expect(endpointsIn(rows, 'all')).toHaveLength(2);
    expect(endpointsIn(rows, 'live').map((r) => r.route)).toEqual(['/b']);
    const groups = [
      {
        group: 'live',
        label: 'Live data',
        calls: 1,
        failed: 0,
        avgLatencyMs: null,
        maxLatencyMs: 0,
      },
    ];
    expect(groupLabel(groups, 'live')).toBe('Live data');
    expect(groupLabel(groups, 'other')).toBe('other');
    expect(groupLabel(groups, null)).toBeNull();
  });

  it('splits calls into succeeded and failed for the stacked chart', () => {
    const series = normalizeApiUsage({
      series: [
        { periodStart: 'a', calls: 10, failed: 2 },
        { periodStart: 'b', calls: 0, failed: 0 },
      ],
    }).series;
    expect(callSeries(series)).toEqual({ ok: [8, 0], failed: [2, 0] });
  });

  it('reads the index strip as a poller and a quiet feed as quiet', () => {
    const [equity, indices] = normalizeApiUsage(oldServer).feeds;
    expect(isPollFeed(indices!)).toBe(true);
    expect(isPollFeed(equity!)).toBe(false);
    expect(isQuietFeed(equity!)).toBe(false);
    expect(isQuietFeed({ totals: normalizeApiUsage({}).feeds[0]!.totals })).toBe(true);
  });

  it('names the recording state', () => {
    expect(instrumentationState('attached').label).toBe('Measuring');
    expect(instrumentationState('failed').tone).toBe('bad');
    expect(instrumentationState('idle').tone).toBe('neutral');
  });
});
