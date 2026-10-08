import {
  candidate,
  levels,
  normalizeLibrary,
  normalizeQueued,
  normalizeReportDocument,
  normalizeReports,
  normalizeStatus,
  normalizeTrackRecord,
} from '@/features/next-day/lib/normalize';

/**
 * The API boundary: a report stored by an older engine (no `twoSided`, no `avoid`), a document
 * whose run failed, a library before the first backtest, a server that adds fields. Each must come
 * out in the screen's shape — never a throw mid-render, never a division by zero.
 */

const lv = {
  direction: 'LONG',
  trigger: 271.65,
  invalidation: 252.6,
  target1: 300.2,
  target2: 319.3,
  riskPerShare: 19.05,
  riskPct: 7.01,
  rewardRisk: 2.5,
  atr: 12.4,
  capNote: null,
};

const rawCandidate = {
  symbol: 'tatasteel',
  name: 'Tata Steel',
  sector: 'Nifty Metal',
  sectorKey: 'metal',
  fno: true,
  lot: 5500,
  close: 268.1,
  changePct: 3.2,
  direction: 'LONG',
  intradayOnly: false,
  score: 84,
  measured: 95,
  hurdle: 4,
  tier: 'high',
  verdict: 'high-conviction-watchlist',
  setup: 'Breakout',
  components: [
    { key: 'trend', points: 12, max: 15, measured: true, note: 'Above the 20 EMA' },
    { key: 'news', points: 0, max: 5, measured: false, note: 'No news read' },
    { key: 'bad', points: 3, max: 0, measured: true, note: '' },
  ],
  otherScore: 22,
  votes: [
    {
      key: 'breakout',
      vote: 'BUY',
      strength: 3,
      reasons: ['New 20-day high'],
      counted: true,
      countNote: null,
    },
    { key: 'not-a-scanner', vote: 'BUY', strength: 1, reasons: [], counted: true },
    {
      key: 'momentum',
      vote: 'HOLD',
      strength: 1,
      reasons: 'x',
      counted: false,
      countNote: 'History contradicts',
    },
  ],
  tally: { buy: 3, sell: 0, neutral: 5, excluded: 1, consensus: 'strong', lean: 'LONG' },
  levels: lv,
  sizing: {
    riskBudget: 5000,
    shares: 262,
    notional: 71172,
    lots: 0,
    lot: 5500,
    lotRisk: 104775,
    option: { kind: 'CE', strike: 270, premium: 8.4 },
    notes: ['n'],
  },
  metrics: { volRatio: 2.1, rsi: 'high' },
  flags: ['Results in 3 days', '', 7],
  newServerField: { anything: true },
};

const rawDoc = {
  date: '2026-10-07',
  forDate: '2026-10-08',
  status: 'completed',
  error: null,
  durationMs: 41000,
  data: { cash: true, indices: true, fo: false, news: true },
  report: {
    date: '2026-10-07',
    forDate: '2026-10-08',
    generatedAt: '2026-10-07T14:10:00.000Z',
    regime: {
      label: 'Moderately bullish',
      score: 3,
      bias: 'bull',
      volatile: false,
      action: 'normal',
      checks: [
        { key: 'trend', label: 'Nifty trend', state: 'bull', detail: 'Above its 20 EMA' },
        { key: 'x', label: '', state: 'bull' },
        { key: 'vix', label: 'VIX', state: 'weird', detail: 'Spiking' },
      ],
    },
    market: null,
    action: 'reduced',
    actionReason: 'VIX up 12%',
    sectors: [
      { key: 'it', label: 'Nifty IT', ret1: -0.4, ret5: 1.2, composite: 0.2, rank: 2, of: 2 },
      { key: 'metal', label: 'Nifty Metal', ret1: 1.9, ret5: 3.1, composite: 3.4, rank: 1, of: 2 },
      { label: 'No key' },
    ],
    universe: { stocks: 1800, scanned: 812, fno: 180 },
    lists: {
      bullish: ['tatasteel'],
      bearish: [],
      fno: ['TATASTEEL'],
      avoid: ['YESBANK'],
      squeeze: [],
    },
    avoidReasons: { YESBANK: 'Conflicting votes', EMPTY: '' },
    candidates: [rawCandidate, { name: 'no symbol' }],
    strategyHits: [
      {
        key: 'breakout',
        buy: 12,
        sell: 3,
        setups: 0,
        countedBuy: true,
        countedSell: false,
        top: [{ symbol: 'tatasteel', vote: 'BUY', reason: 'High' }],
      },
      { key: 'volatility-squeeze', buy: 0, sell: 0, setups: 4, top: [] },
    ],
    compatibility: [
      { key: 'volatility-squeeze', vote: 'SELL', counted: false, reason: 'History contradicts' },
      { key: 'breakout', vote: 'HOLD', counted: true },
    ],
    risk: {
      capital: 1000000,
      riskPct: 0.5,
      maxTradesPerDay: 5,
      maxDailyLossPct: 1.5,
      minRewardRisk: 1.5,
      preferredRewardRisk: 2,
      stopAfterLosses: 3,
    },
    caveats: ['Not investment advice.'],
  },
  morning: {
    at: '2026-10-08T04:15:00.000Z',
    minute: 585,
    market: { niftyPct: 0.4, direction: 'up' },
    candidates: [
      {
        symbol: 'TATASTEEL',
        direction: 'LONG',
        status: 'confirmed',
        ltp: 273,
        gapPct: 0.6,
        gapAndGo: false,
        checks: [
          { key: 'trigger', label: 'Trigger reached', ok: true, detail: '273 ≥ 271.65' },
          { key: 'vwap', label: 'Above VWAP', ok: 'yes', detail: '' },
        ],
        note: 'All checks pass',
      },
      { status: 'confirmed' },
    ],
    summary: '1 confirmed',
  },
  outcome: null,
};

describe('normalizeReportDocument', () => {
  it('parses a full document into the screen shape', () => {
    const doc = normalizeReportDocument(rawDoc)!;
    expect(doc.date).toBe('2026-10-07');
    expect(doc.data).toEqual({ cash: true, indices: true, fo: false, news: true });
    const r = doc.report!;
    expect(r.action).toBe('reduced');
    expect(r.regime.checks).toHaveLength(2);
    expect(r.regime.checks[1]).toMatchObject({ label: 'VIX', state: 'na' });
    // Sectors arrive ranked; one without a key is dropped.
    expect(r.sectors.map((s) => s.key)).toEqual(['metal', 'it']);
    expect(r.lists.bullish).toEqual(['TATASTEEL']);
    expect(r.avoidReasons).toEqual({ YESBANK: 'Conflicting votes' });
    expect(r.candidates).toHaveLength(1);
    expect(r.strategyHits[1]).toMatchObject({
      key: 'volatility-squeeze',
      setups: 4,
      countedBuy: true,
    });
    expect(r.strategyHits[0]!.countedSell).toBe(false);
    expect(r.compatibility).toEqual([
      expect.objectContaining({ key: 'volatility-squeeze', vote: 'SELL', counted: false }),
    ]);
    expect(doc.morning!.candidates).toHaveLength(1);
    expect(doc.morning!.candidates[0]!.checks[1]!.ok).toBeNull();
    expect(doc.outcome).toBeNull();
  });

  it('keeps a failed run as failed, with no report', () => {
    const doc = normalizeReportDocument({
      date: '2026-10-07',
      status: 'failed',
      error: 'NSE 503',
      report: rawDoc.report,
    })!;
    expect(doc.status).toBe('failed');
    expect(doc.report).toBeNull();
    expect(doc.error).toBe('NSE 503');
    expect(doc.forDate).toBe('2026-10-07');
  });

  it('refuses a document without a session date, and treats a missing data record as complete', () => {
    expect(normalizeReportDocument({ status: 'completed' })).toBeNull();
    expect(normalizeReportDocument(null)).toBeNull();
    const doc = normalizeReportDocument({ date: '2026-10-07', status: 'completed', report: {} })!;
    expect(doc.data).toEqual({ cash: true, indices: true, fo: true, news: true });
    expect(doc.report).toMatchObject({ date: '2026-10-07', candidates: [], action: 'normal' });
    expect(doc.report!.regime.label).toBe('Unknown');
    expect(doc.report!.risk).toMatchObject({ capital: 1_000_000, riskPct: 0.5 });
  });
});

describe('candidate', () => {
  it('drops unknown scanners, bad components and invalid option data', () => {
    const c = candidate(rawCandidate)!;
    expect(c.symbol).toBe('TATASTEEL');
    expect(c.components.map((k) => k.key)).toEqual(['trend', 'news']);
    expect(c.votes.map((v) => v.key)).toEqual(['breakout', 'momentum']);
    expect(c.votes[1]).toMatchObject({
      vote: 'NEUTRAL',
      reasons: [],
      counted: false,
      twoSided: false,
    });
    expect(c.sizing!.option).toBeNull();
    expect(c.metrics.rsi).toBeNull();
    expect(c.metrics.volRatio).toBe(2.1);
    expect(c.flags).toEqual(['Results in 3 days']);
    // Older engines: no twoSided, no avoid.
    expect(c.twoSided).toBeNull();
    expect(c.avoid).toBeNull();
  });

  it('keeps a squeeze’s two sides when at least one can size', () => {
    const c = candidate({
      ...rawCandidate,
      twoSided: { long: lv, short: { ...lv, riskPerShare: 0 } },
    })!;
    expect(c.twoSided).toEqual({ long: expect.objectContaining({ trigger: 271.65 }), short: null });
    expect(
      candidate({ ...rawCandidate, twoSided: { long: null, short: null } })!.twoSided,
    ).toBeNull();
  });

  it('drops a candidate without a symbol', () => {
    expect(candidate({ score: 90 })).toBeNull();
  });
});

describe('levels', () => {
  it('refuses levels that cannot size a trade', () => {
    expect(levels(lv)).toMatchObject({ direction: 'LONG', rewardRisk: 2.5 });
    expect(levels({ ...lv, riskPerShare: 0 })).toBeNull();
    expect(levels({ ...lv, trigger: -1 })).toBeNull();
    expect(levels({ ...lv, direction: 'UP' })).toBeNull();
    expect(levels({ ...lv, target2: null })).toBeNull();
    expect(levels(undefined)).toBeNull();
  });
});

describe('normalizeReports', () => {
  it('slims each report and counts a name in two lists once', () => {
    const rows = normalizeReports({
      reports: [
        {
          date: '2026-10-07',
          forDate: '2026-10-08',
          status: 'completed',
          report: {
            regime: { label: 'Choppy' },
            action: 'no-trade',
            lists: { bullish: ['A', 'B'], bearish: ['C'], fno: ['A'] },
          },
          outcome: {
            date: '2026-10-07',
            forDate: '2026-10-08',
            picks: [{ symbol: 'A', list: 'bullish', state: 'target', r: 1.5 }],
            triggered: 1,
            wins: 1,
            totalR: 1.5,
          },
        },
        { date: '2026-10-06', status: 'failed', report: null, error: 'boom' },
        { status: 'completed' },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ regimeLabel: 'Choppy', action: 'no-trade', picks: 3 });
    expect(rows[0]!.outcome!.picks[0]).toMatchObject({ symbol: 'A', state: 'target', r: 1.5 });
    expect(rows[1]).toMatchObject({
      status: 'failed',
      regimeLabel: null,
      action: null,
      picks: 0,
      error: 'boom',
    });
  });
});

describe('normalizeTrackRecord', () => {
  it('fills a missing record and sorts the days newest first', () => {
    const t = normalizeTrackRecord({
      record: {
        days: 2,
        picks: 4,
        triggered: 3,
        wins: 2,
        winRatePct: 66.67,
        avgR: 0.4,
        totalR: 1.2,
        lossStreak: 1,
        byList: { bullish: { triggered: 2, wins: 1, avgR: 0.2 } },
      },
      days: [
        { date: '2026-10-05', forDate: '2026-10-06', picks: [], triggered: 0, wins: 0, totalR: 0 },
        {
          date: '2026-10-06',
          forDate: '2026-10-07',
          picks: [{ symbol: 'x', state: 'not-triggered' }],
          triggered: 0,
          wins: 0,
          totalR: 0,
        },
        { date: 'bad' },
      ],
    });
    expect(t.record.byList.bearish).toEqual({ triggered: 0, wins: 0, avgR: null });
    expect(t.days.map((d) => d.forDate)).toEqual(['2026-10-07', '2026-10-06']);
    expect(t.days[0]!.picks[0]).toMatchObject({ symbol: 'X', state: 'not-triggered', r: null });
    expect(normalizeTrackRecord({}).record).toMatchObject({ days: 0, winRatePct: null, totalR: 0 });
  });
});

describe('normalizeLibrary', () => {
  it('parses a library before the first backtest', () => {
    const lib = normalizeLibrary({
      strategies: [
        {
          key: 'breakout',
          name: 'Price + volume breakout',
          family: 'trend',
          summary: 'S',
          when: 'evening',
          measurable: true,
          needs: 'Daily bars',
          rules: ['r1'],
          measure: null,
          compatibility: [],
          today: null,
        },
        { key: 'unknown-scanner', name: 'X' },
      ],
      tiers: [],
      window: null,
      measuredAt: null,
      caveats: [],
      reportDate: '2026-10-07',
      weights: [
        { key: 'trend', label: 'Trend / momentum', max: 15 },
        { key: 'zero', max: 0 },
      ],
      tiersTable: [
        { tier: 'exceptional', from: 90, label: 'Exceptional' },
        { tier: 'nope', from: 1 },
      ],
      risk: { capital: 1000000, riskPct: 0.5, levels: { t1R: 1.5 }, tradableScore: 75 },
      rules: { minSignals: 30, harmT: 2, minRegimeSignals: 20 },
    });
    expect(lib.strategies.map((s) => s.key)).toEqual(['breakout']);
    expect(lib.strategies[0]!.measure).toBeNull();
    expect(lib.weights).toEqual([{ key: 'trend', label: 'Trend / momentum', max: 15 }]);
    expect(lib.tiersTable).toEqual([{ tier: 'exceptional', from: 90, label: 'Exceptional' }]);
    expect(lib.risk).toMatchObject({ tradableScore: 75, levels: { t1R: 1.5, t2R: 0 } });
    expect(lib.measuredAt).toBeNull();
  });

  it('fills every regime of a measured direction and keeps only its own compatibility', () => {
    const lib = normalizeLibrary({
      strategies: [
        {
          key: 'momentum',
          measure: {
            long: {
              edge: { signals: 120, excessPct: { d1: 0.17 }, t: { d1: 2.3 } },
              byRegime: { bull: { signals: 80 } },
              trade: { trades: 40, avgR: 0.12 },
            },
            short: {},
          },
          compatibility: [
            { key: 'momentum', vote: 'BUY', counted: true, reason: 'Measured edge' },
            { key: 'breakout', vote: 'BUY', counted: true, reason: 'other' },
          ],
        },
      ],
    });
    const m = lib.strategies[0]!.measure!;
    expect(m.long.edge).toMatchObject({ signals: 120, excessPct: { d1: 0.17, d5: null } });
    expect(m.long.byRegime.bear.signals).toBe(0);
    expect(m.short.trade.trades).toBe(0);
    expect(lib.strategies[0]!.compatibility).toHaveLength(1);
  });
});

describe('normalizeStatus / normalizeQueued', () => {
  it('reads the data coverage, the last backtest and the queue', () => {
    const s = normalizeStatus({
      eod: {
        sessions: 270,
        first: '2025-09-01',
        last: '2026-10-07',
        foSessions: 65,
        latest: {},
        recent: [],
      },
      measure: {
        at: '2026-10-04T02:00:00.000Z',
        durationMs: 120000,
        window: { sessions: 250, stocks: 900 },
      },
      latest: {
        date: '2026-10-07',
        forDate: '2026-10-08',
        status: 'completed',
        data: { fo: false },
        morning: { at: '2026-10-08T04:00:00.000Z' },
      },
      queue: { workers: 1, active: 0, waiting: 2 },
    });
    expect(s.eod).toEqual({
      sessions: 270,
      first: '2025-09-01',
      last: '2026-10-07',
      foSessions: 65,
    });
    expect(s.measure!.window).toMatchObject({ sessions: 250, from: null });
    expect(s.latest).toMatchObject({ status: 'completed', morningAt: '2026-10-08T04:00:00.000Z' });
    expect(s.latest!.data.fo).toBe(false);
    expect(s.queue).toEqual({ workers: 1, active: 0, waiting: 2 });
    expect(normalizeStatus({ eod: {} })).toMatchObject({ measure: null, latest: null });
  });

  it('reads a queued answer; anything but false is queued', () => {
    expect(normalizeQueued({ queued: false })).toEqual({ queued: false });
    expect(normalizeQueued({ queued: true })).toEqual({ queued: true });
  });
});
