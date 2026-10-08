import {
  normalizeAnalytics,
  normalizeGenerate,
  normalizePick,
  normalizeStrongPicks,
  normalizeSweep,
} from '@/features/strong-picks/lib/normalize';

/**
 * The API boundary: an older server sends no `active`/`regime` and no v2 fields on a pick; picks
 * published before 2026-10-04 carry nulls for them; the analytics route may be missing whole
 * lines. Every one of those must come out in the screen's shape — never a throw mid-render.
 */

const v2Pick = {
  symbol: 'TMPV',
  exchange: 'NSE',
  name: 'Tata Motors PV',
  rank: 2,
  entryLow: 1042,
  entryHigh: 1052.4,
  targetPrice: 1110,
  stopPrice: 1008,
  rewardRisk: 2,
  modelSetupScore: 71,
  conviction: 4,
  rationale: 'Held its breakout.',
  invalidation: 'A close below 1,008.',
  caveat: 'Estimated, never scored.',
  monitor: {
    verdict: { state: 'working', suggestion: 'HOLD', headline: 'Working', detail: 'Up 1.2%.' },
    lastPrice: 1060,
    minutesSinceSample: 1,
    samples: 12,
  },
  date: '2026-10-02',
  category: 'futures',
  direction: 'long',
  entryMode: 'trigger',
  horizonDays: 5,
  sessionsElapsed: 2,
  sources: ['Institutional Breakout Swing', 'News'],
  swing: {
    grade: 'A',
    score: 84,
    trigger: 'breakout',
    passed: ['Liquid'],
    warnings: ['No event risk'],
  },
  news: [
    {
      title: 'Order win',
      sentiment: 'positive',
      at: '2026-10-02T03:00:00Z',
      url: 'https://x.y/a',
      publisher: 'ET',
    },
    { title: '', sentiment: null },
  ],
  fundamentals: { verdict: 'bullish', ratingPct: 72 },
  contract: {
    tradingSymbol: 'TMPV26OCTFUT',
    kind: 'FUT',
    strike: null,
    expiry: '2026-10-27',
    lotSize: 550,
    ltp: 1045,
    lotValue: 574750,
  },
  riskNote: 'Leverage magnifies the stop.',
  outcome: {
    status: 'open',
    entryPrice: 1042,
    exitPrice: null,
    returnPct: 1.73,
    progressToTarget: 0.4,
    resolved: false,
    resolvedAt: null,
  },
  triggeredAt: '2026-10-02T04:10:00.000Z',
};

describe('a v2 pick', () => {
  it('keeps every field the server sent', () => {
    const p = normalizePick(v2Pick, '2026-10-05')!;
    expect(p).toMatchObject({
      date: '2026-10-02',
      category: 'futures',
      entryMode: 'trigger',
      horizonDays: 5,
      sessionsElapsed: 2,
      sources: ['Institutional Breakout Swing', 'News'],
      swing: { grade: 'A', score: 84, passed: ['Liquid'], warnings: ['No event risk'] },
      fundamentals: { verdict: 'bullish', ratingPct: 72 },
      contract: { kind: 'FUT', lotSize: 550, lotValue: 574750 },
      riskNote: 'Leverage magnifies the stop.',
      outcome: { status: 'open', returnPct: 1.73, progressToTarget: 0.4, resolved: false },
      triggeredAt: '2026-10-02T04:10:00.000Z',
    });
    // A headline without a title is dropped, not rendered blank.
    expect(p.news).toEqual([
      {
        title: 'Order win',
        sentiment: 'positive',
        at: '2026-10-02T03:00:00Z',
        url: 'https://x.y/a',
        publisher: 'ET',
      },
    ]);
    expect(p.monitor?.verdict).toMatchObject({
      suggestion: 'HOLD',
      detail: 'Up 1.2%.',
      stale: false,
    });
  });
});

describe('a pick from before categories', () => {
  it('gets nulls and empties for every v2 field, and its single source as the list', () => {
    const p = normalizePick(
      { symbol: 'OLD', source: 'Overnight recommendations', category: null, outcome: null },
      '2026-09-01',
    )!;
    expect(p).toMatchObject({
      date: '2026-09-01',
      category: null,
      entryMode: 'band',
      horizonDays: 1,
      sessionsElapsed: 0,
      sources: ['Overnight recommendations'],
      swing: null,
      news: [],
      fundamentals: null,
      contract: null,
      riskNote: '',
      outcome: null,
      triggeredAt: null,
      segments: [],
      segmentVerdicts: [],
      monitor: null,
      structure: 'unclear',
    });
  });

  it('refuses junk it cannot read: unknown enums fall back, a contract without a lot is dropped', () => {
    const p = normalizePick(
      {
        symbol: 'ODD',
        category: 'crypto',
        entryMode: 'market',
        outcome: { status: 'won' },
        contract: { tradingSymbol: 'X', kind: 'FUT', lotSize: 0 },
        rewardRisk: 'NaN',
        monitor: { verdict: { suggestion: 'BUY_NOW' } },
      },
      '2026-10-05',
    )!;
    expect(p.category).toBeNull();
    expect(p.entryMode).toBe('band');
    expect(p.outcome).toBeNull();
    expect(p.contract).toBeNull();
    expect(p.rewardRisk).toBeNull();
    expect(p.monitor?.verdict.suggestion).toBe('NO_PRICE');
  });

  it('drops a row without a symbol', () => {
    expect(normalizePick({ name: 'nameless' }, '2026-10-05')).toBeNull();
    expect(normalizePick(null, '2026-10-05')).toBeNull();
  });
});

describe('the day’s read', () => {
  it('gives an older server’s answer an empty `active` and no regime', () => {
    const r = normalizeStrongPicks({
      date: '2026-09-01',
      picks: [{ symbol: 'A' }],
      run: { status: 'published', verdict: 'Published 1.', considered: 3 },
      marketOpen: false,
    });
    expect(r.active).toEqual([]);
    expect(r.regime).toBeNull();
    expect(r.caveats).toEqual([]);
    expect(r.picks[0]?.date).toBe('2026-09-01');
    expect(r.run).toMatchObject({
      status: 'published',
      verdict: 'Published 1.',
      considered: 3,
      survivedOpen: 0,
      rejections: [],
      unavailableSources: [],
      consideredBySource: [],
    });
    expect(r).not.toHaveProperty('nextRunAt');
  });

  it('reads the v2 regime (with its as-of day) and the still-active picks', () => {
    const r = normalizeStrongPicks({
      date: '2026-10-05',
      picks: [],
      active: [v2Pick, { nope: true }],
      regime: { state: 'risk-off', close: 24100, detail: 'Below the 50 DMA.', asOf: '2026-10-02' },
      run: {},
      lastPublished: { date: '2026-10-02', count: 3 },
      marketOpen: true,
      caveats: ['Research, not advice.', 7],
      nextRunAt: '2026-10-06T04:00:00.000Z',
    });
    expect(r.active.map((p) => p.symbol)).toEqual(['TMPV']);
    expect(r.regime).toMatchObject({
      state: 'risk-off',
      close: 24100,
      dma50: null,
      detail: 'Below the 50 DMA.',
      asOf: '2026-10-02',
    });
    expect(r.lastPublished).toEqual({ date: '2026-10-02', count: 3 });
    expect(r.caveats).toEqual(['Research, not advice.']);
    expect(r.run.status).toBe('not-run-yet');
    expect(r.nextRunAt).toBe('2026-10-06T04:00:00.000Z');
  });

  it('never throws on a body that is not an object', () => {
    expect(normalizeStrongPicks(null).picks).toEqual([]);
    expect(normalizeStrongPicks('oops').run.status).toBe('not-run-yet');
  });
});

describe('the track record', () => {
  it('fills a line the server left short, and drops rows it cannot place', () => {
    const a = normalizeAnalytics({
      days: 30,
      since: '2026-09-06',
      sessionClosed: false,
      today: {
        date: '2026-10-05',
        picks: 2,
        entries: [
          { date: '2026-10-05', symbol: 'A', category: 'equity', status: 'open', returnPct: 1.2 },
          { date: '2026-10-05', symbol: 'B', category: null },
        ],
      },
      overall: { picks: 9, closed: 8, profitable: 5, successRate: 62.5 },
      byCategory: [
        { category: 'equity', picks: 4 },
        { category: 'bonds', picks: 1 },
      ],
      byDay: [{ date: '2026-10-05', picks: 2 }, { picks: 1 }],
    });
    expect(a.sessionClosed).toBe(false);
    expect(a.today?.entries.map((e) => e.symbol)).toEqual(['A']);
    expect(a.today?.entries[0]).toMatchObject({ status: 'open', returnPct: 1.2, horizonDays: 1 });
    expect(a.overall).toMatchObject({
      picks: 9,
      closed: 8,
      profitable: 5,
      successRate: 62.5,
      targetHitRate: null,
      openInProfitPct: null,
      stops: 0,
    });
    expect(a.byCategory.map((c) => c.category)).toEqual(['equity']);
    expect(a.byDay.map((d) => d.date)).toEqual(['2026-10-05']);
  });

  it('reads an empty window as no day', () => {
    const a = normalizeAnalytics({ days: 7, since: '2026-09-29', today: null, overall: {} });
    expect(a.today).toBeNull();
    expect(a.overall.successRate).toBeNull();
    expect(a.byDay).toEqual([]);
  });
});

describe('the admin actions’ answers', () => {
  it('reads a sweep and a queued review', () => {
    expect(normalizeSweep({ date: '2026-10-05', picks: 4, sampled: 3, skipped: null })).toEqual({
      date: '2026-10-05',
      picks: 4,
      sampled: 3,
      unpriced: 0,
      newTargetHits: 0,
      newStopHits: 0,
      skipped: null,
    });
    expect(normalizeSweep({ skipped: 'Market is closed.' }).skipped).toBe('Market is closed.');
    expect(normalizeGenerate({ jobId: 'j1', alreadyRunning: true, date: '2026-10-05' })).toEqual({
      jobId: 'j1',
      alreadyRunning: true,
      date: '2026-10-05',
    });
  });
});
