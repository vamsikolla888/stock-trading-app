import {
  normalizeIntradayDetail,
  normalizeStockTrades,
} from '@/features/strategies/lib/intradayNormalize';
import {
  avoidList,
  barWidth,
  compareRows,
  EXIT_VIEW,
  exitLabel,
  exitReasons,
  filterTrades,
  funnelSteps,
  isJobInFlight,
  jobNotice,
  lineOf,
  minutes,
  notionalLabel,
  REJECTION_VIEW,
  retestMessage,
  shortDay,
  signedPoints,
  signedRupees,
  stockSummary,
  timeOfDay,
  VERDICT_VIEW,
  verdictCounts,
  visibleStocks,
} from '@/features/strategies/lib/intradayView';
import type { IntradayStockRow, IntradayTrade, LineStats } from '@/features/strategies/types';

/**
 * The intraday platform strategy (Bollinger Mid-Band Thrust): its words and arithmetic — ported
 * with the web's pinned cases (server/test/client-intraday-strategy.test.ts) — and the parser that
 * keeps an older server, or a run without one variant, from throwing mid-render.
 */

// The engine's own lists (bb-midband.rules.ts EXIT_ORDER, REJECTION_ORDER, STOCK_VERDICT).
const EXIT_ORDER = ['upper-band', 'stop', 'mid-band', 'square-off', 'end-of-data'] as const;
const REJECTION_ORDER = ['window', 'volume', 'trend', 'vwap', 'room', 'limit', 'risk'] as const;

describe('labels cover everything the engine produces', () => {
  it('names every exit and every rejection, and an unknown exit as itself', () => {
    for (const e of EXIT_ORDER) expect(EXIT_VIEW[e]).toBeTruthy();
    for (const r of REJECTION_ORDER) expect(REJECTION_VIEW[r]).toBeTruthy();
    expect(exitLabel('upper-band')).toBe('Upper band → red candle');
    expect(exitLabel('trailing')).toBe('trailing');
  });

  it('quotes the server’s thresholds in the verdicts', () => {
    expect(VERDICT_VIEW.thin.title).toContain('8 trades');
    expect(VERDICT_VIEW.works.title).toContain('1.3');
  });
});

describe('the funnel', () => {
  it('narrows step by step and ends at the trades taken', () => {
    const f = {
      crosses: 120,
      green: 70,
      rejected: { window: 10, volume: 25, trend: 0, vwap: 6, room: 4, limit: 2, risk: 3 },
      taken: 20,
    };
    const steps = funnelSteps(f);
    expect(steps[0]).toMatchObject({ key: 'crosses', remaining: 120 });
    expect(steps[1]).toMatchObject({ key: 'green', remaining: 70, dropped: 50 });
    // A filter that rejected nothing is not a step.
    expect(steps.some((s) => s.key === 'trend')).toBe(false);
    for (let i = 1; i < steps.length - 1; i++) {
      expect(steps[i]!.remaining).toBeLessThanOrEqual(steps[i - 1]!.remaining);
    }
    expect(steps[steps.length - 2]!.remaining).toBe(20);
    expect(steps[steps.length - 1]).toMatchObject({ key: 'taken', remaining: 20 });
  });
});

describe('your rules vs improved', () => {
  const line = (o: Record<string, number | null>) =>
    ({
      trades: 100,
      winRate: 50,
      avgReturnPct: 0.05,
      profitFactor: 1.1,
      totalReturnPct: 5,
      netPnl: 5000,
      stocksWorking: 3,
      maxDrawdownPct: -6,
      ...o,
    }) as never;

  it('marks the higher figure better, and the shallower drawdown', () => {
    const rows = compareRows(
      line({}),
      line({ avgReturnPct: 0.09, winRate: 46, maxDrawdownPct: -3, trades: 40 }),
    );
    const by = Object.fromEntries(rows.map((r) => [r.key, r.better]));
    expect(by.avg).toBe('improved');
    expect(by.win).toBe('base');
    expect(by.dd).toBe('improved');
    // Fewer trades is neither better nor worse; equal figures have no winner.
    expect(by.trades).toBeNull();
    expect(by.pf).toBeNull();
  });

  it('leaves the drawdown row out without both drawdowns, and a variant out when missing', () => {
    const noDd = { ...(line({}) as LineStats), maxDrawdownPct: undefined };
    expect(compareRows(noDd, noDd).some((r) => r.key === 'dd')).toBe(false);
    expect(lineOf(undefined)).toBeNull();
  });
});

describe('formatting', () => {
  it('reads times in IST and minutes as a trader would', () => {
    // 2026-10-06 09:15 IST = 03:45 UTC.
    expect(timeOfDay(Date.UTC(2026, 9, 6, 3, 45) / 1000)).toBe('09:15');
    expect(shortDay('2026-10-06')).toBe('Tue, 6 Oct');
    expect(minutes(45)).toBe('45 min');
    expect(minutes(125)).toBe('2 h 5 min');
    expect(minutes(120)).toBe('2 h');
    expect(minutes(null)).toBe('—');
  });

  it('joins the sign to the rupee and uses a true minus', () => {
    expect(signedRupees(1240.4)).toBe('+₹1,240');
    expect(signedRupees(-310)).toBe('−₹310');
    expect(signedRupees(0)).toBe('₹0');
    expect(signedPoints(1.24)).toBe('+1.2 pts');
    expect(signedPoints(-0.4)).toBe('−0.4 pts');
    expect(notionalLabel(100_000)).toBe('₹1 lakh');
    expect(notionalLabel(null)).toBe('₹1 lakh');
    expect(notionalLabel(250_000)).toBe('₹2.50 lakh');
  });

  it('scales bars to the largest magnitude present', () => {
    expect(barWidth(-0.2, [0.1, -0.2, 0.05])).toBe(100);
    expect(barWidth(0.1, [0.1, -0.2, 0.05])).toBe(50);
    expect(barWidth(null, [0.1])).toBe(0);
    expect(barWidth(0.1, [0, 0])).toBe(0);
  });
});

describe('the re-test job', () => {
  it('says plainly when a job waits for a worker that is not there', () => {
    expect(jobNotice({ state: 'waiting', workers: 0, failedReason: null })).toMatchObject({
      tone: 'error',
      text: expect.stringMatching(/no worker is running/),
    });
    expect(jobNotice({ state: 'waiting', workers: 1, failedReason: null })).toMatchObject({
      tone: 'info',
    });
    expect(jobNotice({ state: 'active', workers: 1, failedReason: null })).toMatchObject({
      tone: 'info',
      text: expect.stringMatching(/Running/),
    });
    expect(
      jobNotice({ state: 'failed', workers: 1, failedReason: 'session expired' }),
    ).toMatchObject({ tone: 'error', text: expect.stringMatching(/session expired/) });
    expect(jobNotice({ state: 'completed', workers: 1, failedReason: null })).toBeNull();
    expect(jobNotice(null)).toBeNull();
  });

  it('polls only while the job is queued or running', () => {
    for (const state of ['waiting', 'active', 'delayed', 'prioritized']) {
      expect(isJobInFlight({ state })).toBe(true);
    }
    for (const state of ['completed', 'failed', null]) expect(isJobInFlight({ state })).toBe(false);
    expect(isJobInFlight(null)).toBe(false);
    expect(retestMessage(true).title).toBe('Already queued');
    expect(retestMessage(false).title).toBe('Re-test queued');
  });
});

const row = (symbol: string, o: Partial<IntradayStockRow> = {}): IntradayStockRow => ({
  symbol,
  trades: 10,
  wins: 5,
  winRate: 50,
  avgReturnPct: 0.1,
  totalReturnPct: 1,
  netPnl: 1000,
  profitFactor: 1.4,
  avgWinPct: 0.4,
  avgLossPct: 0.2,
  avgHoldMinutes: 40,
  maxLosingStreak: 2,
  firstHalfPct: 0.1,
  secondHalfPct: 0.1,
  verdict: 'works',
  score: 1,
  ...o,
});

describe('the stocks tab', () => {
  const rows = [
    row('INFY', { verdict: 'mixed', score: 0.5, avgReturnPct: 0.02 }),
    row('TCS', { verdict: 'works', score: 2, avgReturnPct: 0.2 }),
    row('SBIN', { verdict: 'avoid', score: -1, avgReturnPct: -0.3, profitFactor: null }),
    row('HDFC', { verdict: 'works', score: 3, avgReturnPct: 0.1 }),
    row('ITC', { verdict: 'thin', score: 9, avgReturnPct: -0.05 }),
  ];

  it('ranks works first by score, then mixed, too few, avoid', () => {
    expect(
      visibleStocks(rows, { query: '', show: 'all', sort: 'verdict' }).map((r) => r.symbol),
    ).toEqual(['HDFC', 'TCS', 'INFY', 'ITC', 'SBIN']);
  });

  it('filters by symbol and verdict, sorts on a figure, and counts verdicts', () => {
    expect(
      visibleStocks(rows, { query: 'c', show: 'all', sort: 'symbol' }).map((r) => r.symbol),
    ).toEqual(['HDFC', 'ITC', 'TCS']);
    expect(
      visibleStocks(rows, { query: '', show: 'works', sort: 'avg' }).map((r) => r.symbol),
    ).toEqual(['TCS', 'HDFC']);
    // No profit factor (no losing trade) sorts last, never first.
    expect(visibleStocks(rows, { query: '', show: 'all', sort: 'pf' }).at(-1)?.symbol).toBe('SBIN');
    expect(verdictCounts(rows)).toEqual({ works: 2, mixed: 1, avoid: 1, thin: 1 });
    expect(avoidList(rows).map((r) => r.symbol)).toEqual(['SBIN']);
  });
});

const trade = (o: Partial<IntradayTrade>): IntradayTrade => ({
  symbol: 'TCS',
  day: '2026-10-06',
  entryTime: 1_000,
  exitTime: 2_000,
  entryPrice: 100,
  exitPrice: 101,
  stop: 99,
  qty: 1000,
  grossPnl: 1000,
  charges: 60,
  slippage: 40,
  netPnl: 900,
  returnPct: 0.9,
  exit: 'upper-band',
  holdMinutes: 30,
  volumeRatio: 1.8,
  mfePct: 1.2,
  maePct: -0.2,
  ...o,
});

describe('the trades tab and a stock’s trades', () => {
  const trades = [
    trade({ symbol: 'TCS', returnPct: 0.9, exit: 'square-off' }),
    trade({ symbol: 'INFY', returnPct: -0.4, netPnl: -400, exit: 'stop' }),
    trade({ symbol: 'TCS', returnPct: 0, netPnl: -10, exit: 'upper-band' }),
  ];

  it('filters by symbol, outcome (zero is a loss) and exit', () => {
    expect(filterTrades(trades, { query: 'tc', outcome: 'all', exit: null })).toHaveLength(2);
    expect(filterTrades(trades, { query: '', outcome: 'wins', exit: null })).toHaveLength(1);
    expect(filterTrades(trades, { query: '', outcome: 'losses', exit: null })).toHaveLength(2);
    expect(filterTrades(trades, { query: '', outcome: 'all', exit: 'stop' })).toHaveLength(1);
    expect(exitReasons([...trades, trade({ exit: 'novel' })])).toEqual([
      'upper-band',
      'stop',
      'square-off',
      'novel',
    ]);
  });

  it('sums a stock’s trades with the server’s definitions', () => {
    const s = stockSummary(trades)!;
    expect(s.trades).toBe(3);
    expect(s.winRate).toBeCloseTo(33.33, 1);
    expect(s.avgReturnPct).toBeCloseTo(0.1667, 3);
    expect(s.profitFactor).toBeCloseTo(2.25, 5);
    expect(s.netPnl).toBe(490);
    expect(stockSummary([trade({ returnPct: 1 })])?.profitFactor).toBeNull();
    expect(stockSummary([])).toBeNull();
  });
});

describe('the parser', () => {
  const run = {
    runId: 'r',
    ranAt: '2026-10-07T12:00:00.000Z',
    metrics: {
      totalTrades: 40,
      winRate: 55,
      profitFactor: 1.4,
      maxDrawdownPct: -3.2,
      cagrPct: null,
      totalReturnPct: 4,
      expectancyPct: 0.08,
      wins: 22,
      losses: 18,
    },
    analysis: null,
    trades: [],
    equityCurve: [
      { t: 1, v: 100 },
      { t: 2, v: 101 },
    ],
    symbolStats: [],
    maxOpenPositions: 5,
  };
  const strategy = {
    key: 'bb-midband-5m',
    kind: 'intraday',
    name: 'Bollinger Mid-Band Thrust',
    timeframe: '5 min',
    holding: 'Intraday',
    universe: 'Nifty 500',
    latestScan: null,
    backtest: null,
    worksOn: [],
    stocks: null,
    deployments: [],
    universeKey: 'nifty500',
    universes: [
      { key: 'nifty50', label: 'Nifty 50' },
      { key: 'nifty500', label: 'Nifty 500' },
      { key: 'midcap', label: 'Midcap' },
    ],
    job: { state: 'active', workers: 1.4, queuedAt: '2026-10-07T11:00:00.000Z' },
    status: 'completed',
    runAt: '2026-10-07T12:00:00.000Z',
    durationMs: 120_000,
    error: null,
    data: {
      universe: { label: 'Nifty 500', size: 500 },
      stocks: 480,
      sessions: 60,
      bars: 2_000_000,
      from: '2026-07-01',
      to: '2026-10-07',
    },
    costs: { notionalInr: 100_000, slippageBps: 2 },
    variants: {
      improved: {
        key: 'improved',
        label: 'Improved',
        line: {
          trades: 40,
          winRate: 55,
          avgReturnPct: 0.08,
          profitFactor: 1.4,
          totalReturnPct: 3.2,
          netPnl: 3200,
          stocksWorking: 4,
        },
        run,
        funnel: { crosses: 100, green: 60, rejected: { volume: 20, bogus: 3 }, taken: 40 },
        analytics: {
          byHour: [
            {
              key: '9',
              label: '09:00–09:59',
              trades: 5,
              winRate: 60,
              avgReturnPct: 0.1,
              totalReturnPct: 0.5,
            },
            {},
          ],
          byExit: [
            {
              key: 'stop',
              label: 'Stop',
              trades: 10,
              winRate: 0,
              avgReturnPct: -0.3,
              totalReturnPct: -3,
              sharePct: 25,
            },
          ],
          costs: { charges: 600, slippage: 400, perTrade: 25 },
          days: {
            traded: 30,
            positive: 18,
            positivePct: 60,
            best: { day: '2026-09-01', netPnl: 900 },
            worst: null,
          },
        },
        stocks: [
          { symbol: 'TCS', trades: 12, verdict: 'works' },
          { symbol: 'X', verdict: 'legendary' },
          {},
        ],
        recentTrades: [
          {
            symbol: 'TCS',
            day: '2026-10-06',
            entryTime: 10,
            exitTime: 20,
            entryPrice: 100,
            exitPrice: 101,
            returnPct: 0.9,
            exit: 'upper-band',
          },
          { symbol: 'BROKEN', day: '2026-10-06' },
        ],
        rules: { entry: ['Close crosses above the middle band'], exit: ['Square off at 15:15'] },
      },
      // A variant whose run has no metrics is no variant.
      base: { key: 'base', run: { metrics: {} } },
    },
    rules: {
      improved: { label: 'Improved', entry: ['A', 'B'], exit: ['C'] },
      base: { entry: ['A'], exit: ['C', 7] },
    },
    ablations: [
      {
        key: 'volume',
        label: 'Volume ≥ 1.5× average',
        addsAvgReturnPct: 0.03,
        addsWinRate: 2.1,
        addsTrades: -12,
      },
      {},
    ],
    sync: { at: '2026-10-07T11:30:00.000Z', error: 'Session expired' },
    caveats: ['Signal on the close.', null],
  };

  it('reads a full detail, dropping a variant without a run and every broken row', () => {
    const d = normalizeIntradayDetail({ strategy }, 'nifty50')!;
    expect(d.universeKey).toBe('nifty500');
    expect(d.universes.map((u) => u.key)).toEqual(['nifty50', 'nifty500']);
    expect(d.job).toMatchObject({ state: 'active', workers: 1, failedReason: null });
    expect(Object.keys(d.variants)).toEqual(['improved']);
    const v = d.variants.improved!;
    expect(v.run.metrics.maxDrawdownPct).toBe(-3.2);
    expect(v.funnel.rejected).toEqual({
      window: 0,
      volume: 20,
      trend: 0,
      vwap: 0,
      room: 0,
      limit: 0,
      risk: 0,
    });
    expect(v.analytics.byHour).toHaveLength(1);
    expect(v.analytics.byWeekday).toEqual([]);
    expect(v.analytics.byExit[0]?.sharePct).toBe(25);
    expect(v.analytics.costs).toMatchObject({ charges: 600, grossPnl: 0, shareOfGrossPct: null });
    expect(v.analytics.days.worst).toBeNull();
    expect(v.stocks.map((r) => [r.symbol, r.verdict])).toEqual([
      ['TCS', 'works'],
      ['X', 'thin'],
    ]);
    expect(v.recentTrades.map((t) => t.symbol)).toEqual(['TCS']);
    expect(v.recentTrades[0]?.netPnl).toBe(0);
    expect(d.rules.base).toEqual({ label: 'Your rules', entry: ['A'], exit: ['C'] });
    expect(d.ablations).toEqual([
      expect.objectContaining({ key: 'volume', addsTrades: -12, addsWinRate: 2.1, trades: 0 }),
    ]);
    expect(d.sync).toEqual({ at: '2026-10-07T11:30:00.000Z', error: 'Session expired' });
    expect(d.caveats).toEqual(['Signal on the close.']);
    expect(d.costs).toEqual({ notionalInr: 100_000, slippageBps: 2 });
  });

  it('reads a strategy before its first run, and refuses anything else', () => {
    const d = normalizeIntradayDetail(
      { strategy: { key: 'bb-midband-5m', variants: {}, job: null, status: null } },
      'nifty50',
    )!;
    expect(d.variants).toEqual({});
    expect(d.status).toBeNull();
    expect(d.data).toBeNull();
    expect(d.costs).toBeNull();
    expect(d.universeKey).toBe('nifty50');
    expect(d.universes.map((u) => u.label)).toEqual(['Nifty 50', 'Nifty 500']);
    expect(d.rules.improved).toEqual({ label: 'Improved', entry: [], exit: [] });
    expect(
      normalizeIntradayDetail({ strategy: { key: 'institutional-breakout-swing' } }, 'nifty50'),
    ).toBeNull();
    expect(normalizeIntradayDetail(null, 'nifty50')).toBeNull();
  });

  it('reads a stock’s trades newest first', () => {
    const r = normalizeStockTrades(
      {
        symbol: 'TCS',
        variant: 'base',
        universe: 'nifty500',
        trades: [
          {
            symbol: 'TCS',
            day: '2026-10-05',
            entryTime: 10,
            exitTime: 20,
            entryPrice: 1,
            exitPrice: 2,
            returnPct: 1,
          },
          {
            symbol: 'TCS',
            day: '2026-10-06',
            entryTime: 30,
            exitTime: 40,
            entryPrice: 1,
            exitPrice: 2,
            returnPct: 1,
          },
          { nope: true },
        ],
      },
      { symbol: 'TCS', variant: 'improved', universe: 'nifty50' },
    );
    expect(r.variant).toBe('base');
    expect(r.universe).toBe('nifty500');
    expect(r.trades.map((t) => t.entryTime)).toEqual([30, 10]);
    expect(
      normalizeStockTrades({}, { symbol: 'X', variant: 'improved', universe: 'nifty50' }),
    ).toEqual({
      symbol: 'X',
      variant: 'improved',
      universe: 'nifty50',
      trades: [],
    });
  });
});
