import { normalizePick } from '@/features/strong-picks/lib/normalize';
import {
  buildDayStrip,
  CATEGORY_ORDER,
  categoryChips,
  categoryCounts,
  categoryMix,
  contractLabel,
  dayHeadline,
  dayName,
  dayScore,
  earlierActive,
  entryReference,
  filterByCategory,
  horizonLabel,
  moveFromEntry,
  parseCapital,
  pickPosition,
  pickStatus,
  sessionsLeft,
  settledResult,
  sizeFor,
  sourceChip,
  todayIST,
} from '@/features/strong-picks/lib/picksView';
import { categoryRows, dayBars, scoreSub, successTone } from '@/features/strong-picks/lib/results';
import type { OutcomeStatus, PickContract, StrongPick } from '@/features/strong-picks/types';

/**
 * The Strong picks screen's arithmetic — ported with the web's pinned cases
 * (server/test/client-strong-picks.test.ts): position size at 1% risk in each category, the
 * status a pick shows, a day's score by the server's rule, the day strip and the small labels.
 * Sizing is the one number on the screen a reader may act on directly, so it is pinned hardest.
 */

const fut: PickContract = {
  tradingSymbol: 'TATAMOTORS26OCTFUT',
  kind: 'FUT',
  strike: null,
  expiry: '2026-10-27',
  lotSize: 550,
  ltp: 1045,
  lotValue: 574_750,
};
const ce: PickContract = {
  tradingSymbol: 'TATAMOTORS26OCT1040CE',
  kind: 'CE',
  strike: 1040,
  expiry: '2026-10-27',
  lotSize: 550,
  ltp: 32.5,
  lotValue: 17_875,
};

/** A normalised pick with the given overrides — the shape every screen component receives. */
function makePick(over: Record<string, unknown> = {}): StrongPick {
  return normalizePick({ symbol: 'TMPV', exchange: 'NSE', rank: 1, ...over }, '2026-10-05')!;
}

describe('position size at 1% risk', () => {
  it('buys whole shares so the stop costs 1% of capital (equity and intraday alike)', () => {
    // ₹5,00,000 × 1% = ₹5,000; ₹34 a share to the stop → 147 shares, ₹4,998 at risk, 31% of capital.
    expect(
      sizeFor({ category: 'equity', capital: 500_000, entry: 1042, stop: 1008, contract: null }),
    ).toEqual({ qty: 147, unit: 'shares', risk: 4998, note: 'to the stop', exposurePct: 31 });
    expect(
      sizeFor({ category: 'intraday', capital: 500_000, entry: 1042, stop: 1008, contract: null })
        ?.qty,
    ).toBe(147);
  });

  it('never sizes shares beyond what the capital buys, however tight the stop', () => {
    expect(
      sizeFor({ category: 'equity', capital: 100_000, entry: 1000, stop: 995, contract: null }),
    ).toEqual({
      qty: 100,
      unit: 'shares',
      risk: 500,
      note: 'to the stop — capped at what your capital buys',
      exposurePct: 100,
    });
  });

  it('respects a different risk percentage', () => {
    expect(
      sizeFor({
        category: 'equity',
        capital: 500_000,
        riskPct: 2,
        entry: 1042,
        stop: 1008,
        contract: null,
      })?.qty,
    ).toBe(294);
  });

  it('sizes futures in whole lots by stop distance × lot size, and says when one lot is too much', () => {
    expect(
      sizeFor({ category: 'futures', capital: 2_000_000, entry: 1042, stop: 1008, contract: fut }),
    ).toMatchObject({ qty: 1, unit: 'lots', risk: 18_700 });
    const small = sizeFor({
      category: 'futures',
      capital: 500_000,
      entry: 1042,
      stop: 1008,
      contract: fut,
    });
    expect(small).toMatchObject({ qty: 0, unit: 'lots' });
    expect(small?.note).toMatch(/one lot risks ₹18,700/);
  });

  it('treats an option’s whole premium as the risk', () => {
    expect(
      sizeFor({ category: 'options', capital: 1_000_000, entry: 1042, stop: 1008, contract: ce }),
    ).toMatchObject({ qty: 0, note: expect.stringMatching(/₹17,875/) });
    expect(
      sizeFor({ category: 'options', capital: 5_000_000, entry: 1042, stop: 1008, contract: ce }),
    ).toMatchObject({ qty: 2, unit: 'lots', risk: 35_750, note: 'premium at risk' });
  });

  it('refuses to size what it cannot: no contract, no stop, a stop above entry, no capital', () => {
    const base = { capital: 500_000, entry: 1042, stop: 1008, contract: null };
    expect(sizeFor({ ...base, category: 'futures' })).toBeNull();
    expect(sizeFor({ ...base, category: 'equity', stop: null })).toBeNull();
    expect(sizeFor({ ...base, category: 'equity', entry: 1000, stop: 1010 })).toBeNull();
    expect(sizeFor({ ...base, category: 'equity', capital: 0 })).toBeNull();
  });

  it('reads typed capital, refusing amounts too small to size', () => {
    expect(parseCapital('5,00,000')).toBe(500_000);
    expect(parseCapital('₹ 12000')).toBe(12_000);
    expect(parseCapital('9999')).toBeNull();
    expect(parseCapital('')).toBeNull();
    expect(parseCapital('99999999999')).toBe(1_000_000_000);
  });
});

describe('the entry a pick is measured from', () => {
  it('is the trigger for a buy-above pick and the middle of the band otherwise', () => {
    expect(entryReference({ entryMode: 'trigger', entryLow: 1042, entryHigh: 1052.4 })).toBe(1042);
    expect(entryReference({ entryMode: 'band', entryLow: 99, entryHigh: 101 })).toBe(100);
    expect(entryReference({ entryMode: 'band', entryLow: null, entryHigh: 101 })).toBe(101);
  });

  it('measures the move from it in percent', () => {
    expect(moveFromEntry(1063, 1042)).toBe(2.02);
    expect(moveFromEntry(null, 1042)).toBeNull();
    expect(moveFromEntry(1063, 0)).toBeNull();
  });
});

describe('the status a pick shows', () => {
  const p = (over: Partial<Parameters<typeof pickStatus>[0]> = {}) =>
    pickStatus({
      entryMode: 'band',
      triggeredAt: null,
      outcome: null,
      monitor: { verdict: { suggestion: 'HOLD' } },
      ...over,
    });

  it('shows a settled outcome before anything the monitor says', () => {
    expect(p({ outcome: { status: 'target' } })).toEqual({ label: 'Target hit', tone: 'ok' });
    expect(p({ outcome: { status: 'not-triggered' } }).label).toBe('Not triggered');
  });

  it('shows a reached level next, then whether a buy-above pick has triggered', () => {
    expect(p({ entryMode: 'trigger', monitor: { verdict: { suggestion: 'EXIT' } } }).label).toBe(
      'Stop reached',
    );
    expect(p({ entryMode: 'trigger', outcome: { status: 'open' } }).label).toBe('Awaiting trigger');
    expect(p({ entryMode: 'trigger', triggeredAt: '2026-10-05T04:10:00Z' })).toEqual({
      label: 'Triggered',
      tone: 'info',
    });
  });

  it('reads the entry band for a band pick, and says when there is no price', () => {
    expect(p({ monitor: { verdict: { suggestion: 'ENTER' } } }).label).toBe('In entry zone');
    expect(p({ monitor: null }).label).toBe('No live price');
  });
});

describe('where a pick stands', () => {
  it('marks a live pick to the monitor’s price and its best-price progress', () => {
    const live = makePick({
      entryMode: 'band',
      entryLow: 99,
      entryHigh: 101,
      monitor: { verdict: { suggestion: 'HOLD', progressToTarget: 0.456 }, lastPrice: 102 },
    });
    expect(pickPosition(live)).toEqual({ settled: false, price: 102, movePct: 2, progressPct: 46 });
  });

  it('reads a settled pick from its outcome, never from today’s price', () => {
    const settled = makePick({
      entryLow: 100,
      entryHigh: 100,
      monitor: { verdict: { suggestion: 'HOLD' }, lastPrice: 90 },
      outcome: {
        status: 'target',
        entryPrice: 100,
        exitPrice: 110,
        returnPct: 10,
        progressToTarget: 1,
        resolved: true,
      },
    });
    expect(pickPosition(settled)).toEqual({
      settled: true,
      price: 110,
      movePct: 10,
      progressPct: 100,
    });
  });

  it('says where the pick is in its horizon', () => {
    expect(horizonLabel({ horizonDays: 5, sessionsElapsed: 2, outcome: null })).toBe('Day 2 of 5');
    expect(horizonLabel({ horizonDays: 5, sessionsElapsed: 9, outcome: null })).toBe('Day 5 of 5');
    expect(horizonLabel({ horizonDays: 1, sessionsElapsed: 1, outcome: null })).toBe('Today only');
    const outcome = {
      status: 'stop' as const,
      entryPrice: 1,
      exitPrice: 1,
      returnPct: -1,
      progressToTarget: null,
      resolved: true,
      resolvedAt: '2026-10-05T06:00:00.000Z',
    };
    expect(horizonLabel({ horizonDays: 5, sessionsElapsed: 2, outcome })).toBe('Settled 5 Oct');
  });
});

describe('one day at a time', () => {
  const o = (status: OutcomeStatus, returnPct: number | null) => ({
    outcome: { status, returnPct },
  });

  it('scores a day exactly as the server’s scoreLine does', () => {
    const day = [
      o('target', 6.1),
      o('stop', -2.9),
      o('time', 0.8),
      o('time', -0.4),
      o('open', 1.2),
      o('not-triggered', null),
      { outcome: null },
    ];
    // Server: closed = 4 (target, stop, two time exits), 2 in profit → 50%; avg of the 4 = 0.9.
    expect(dayScore(day)).toEqual({
      picks: 7,
      open: 2,
      notTriggered: 1,
      closed: 4,
      profitable: 2,
      targets: 1,
      stops: 1,
      successRate: 50,
      avgReturnPct: 0.9,
    });
  });

  it('says "no rate yet" rather than 0% before anything closes', () => {
    expect(dayScore([o('open', 1)]).successRate).toBeNull();
  });

  it('puts today first even before it has picks, then earlier days newest first', () => {
    const strip = buildDayStrip(
      [
        { date: '2026-10-01', picks: 5, closed: 5, successRate: 80 },
        { date: '2026-10-02', picks: 4, closed: 4, successRate: 75 },
        { date: '2026-09-30', picks: 2, closed: 1, successRate: 0 },
      ],
      '2026-10-05',
      null,
    );
    expect(strip.map((d) => d.date)).toEqual([
      '2026-10-05',
      '2026-10-02',
      '2026-10-01',
      '2026-09-30',
    ]);
    expect(strip[0]).toMatchObject({ isToday: true, picks: null, successRate: null });
    expect(strip[0]?.label).toBe('Today · Mon, 5 Oct');
    expect(buildDayStrip([], '2026-10-05', 5)[0]?.picks).toBe(5);
  });

  it('keeps a selected day the record does not hold', () => {
    const strip = buildDayStrip([], '2026-10-05', null, '2026-08-14');
    expect(strip.map((d) => d.date)).toEqual(['2026-10-05', '2026-08-14']);
    expect(strip[1]).toMatchObject({ label: 'Fri, 14 Aug', picks: null });
  });

  it('reads the IST date, not the UTC one', () => {
    // 19:00 UTC on 4 Oct is 00:30 IST on 5 Oct.
    expect(todayIST(Date.parse('2026-10-04T19:00:00Z'))).toBe('2026-10-05');
  });

  it('names a day the same on every engine', () => {
    expect(dayName('2026-10-05')).toBe('Mon, 5 Oct');
    expect(dayName('2026-09-30', false)).toBe('30 Sep');
    expect(dayName('not a date')).toBe('not a date');
  });

  it('prices a settled pick at the reader’s size — shares, and futures by the lot', () => {
    const won = { status: 'target' as const, entryPrice: 1042, exitPrice: 1110, returnPct: 6.53 };
    expect(settledResult({ qty: 147, unit: 'shares' }, won)).toEqual({
      pnl: 9996,
      returnPct: 6.53,
    });
    expect(settledResult({ qty: 2, unit: 'lots', lotSize: 550 }, won)?.pnl).toBe(74_800);
    expect(
      settledResult(
        { qty: 147, unit: 'shares' },
        { status: 'not-triggered', entryPrice: null, exitPrice: null, returnPct: null },
      ),
    ).toBeNull();
    expect(
      settledResult(
        { qty: 147, unit: 'shares' },
        { status: 'open', entryPrice: 1042, exitPrice: null, returnPct: 1.2 },
      ),
    ).toBeNull();
  });
});

describe('the day’s headline', () => {
  it('reads today live, with the window’s record when the server has one', () => {
    const picks = [
      makePick({ category: 'equity', entryMode: 'trigger', entryLow: 100 }),
      makePick({ symbol: 'B', category: 'options', monitor: { verdict: { suggestion: 'ENTER' } } }),
    ];
    const tiles = dayHeadline({ picks, runStatus: 'published' }, true, {
      days: 30,
      successRate: 62.5,
      closed: 8,
      profitable: 5,
    });
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Today’s picks', '2'],
      ['In play', '1 of 2'],
      ['Today so far', '—'],
      ['30-day success', '63%'],
    ]);
    expect(tiles[0]?.sub).toBe('1 equity · 1 options');
    expect(tiles[3]).toMatchObject({ sub: '5 of 8 closed in profit', opensResults: true });
  });

  it('leaves the record out on an older server, and says when the review has not run', () => {
    const tiles = dayHeadline({ picks: [], runStatus: 'not-run-yet' }, true, null);
    expect(tiles).toHaveLength(3);
    expect(tiles[0]?.sub).toBe('Review runs at 09:30 IST');
  });

  it('reads an earlier day settled', () => {
    const settled = (status: OutcomeStatus, returnPct: number | null) =>
      makePick({ category: 'equity', outcome: { status, returnPct } });
    const tiles = dayHeadline(
      {
        picks: [settled('target', 6), settled('stop', -3), settled('time', 1), settled('open', 0)],
        runStatus: 'published',
      },
      false,
      null,
    );
    expect(tiles.map((t) => [t.label, t.value])).toEqual([
      ['Picks', '4'],
      ['Closed in profit', '2 of 3'],
      ['Success', '67%'],
      ['Avg return', '+1.33%'],
    ]);
    expect(tiles[2]?.status).toBe('ok');
    expect(tiles[1]?.sub).toBe('1 still open');
  });
});

describe('labels, counts and filters', () => {
  it('reads a contract the way a desk does', () => {
    expect(contractLabel(fut)).toBe('27 Oct FUT');
    expect(contractLabel(ce)).toBe('27 Oct 1040 CE');
  });

  it('counts categories in their fixed order, and words the mix', () => {
    const picks = [
      { category: 'options' as const },
      { category: 'equity' as const },
      { category: 'equity' as const },
      { category: null },
    ];
    expect(categoryCounts(picks)).toEqual({
      all: 4,
      equity: 2,
      intraday: 0,
      futures: 0,
      options: 1,
    });
    expect(categoryMix(picks)).toBe('2 equity · 1 options');
    expect(CATEGORY_ORDER).toEqual(['equity', 'intraday', 'futures', 'options']);
    expect(categoryChips(picks).map((c) => c.label)).toEqual([
      'All · 4',
      'Equity · 2',
      'Intraday · 0',
      'Futures · 0',
      'Options · 1',
    ]);
    expect(filterByCategory(picks, 'equity')).toHaveLength(2);
    expect(filterByCategory(picks, 'all')).toHaveLength(4);
  });

  it('lists only earlier days’ picks as still active', () => {
    const active = [
      makePick({ date: '2026-10-01', category: 'equity' }),
      makePick({ symbol: 'X', date: '2026-10-05', category: 'equity' }),
      makePick({ symbol: 'Y', date: '2026-10-02', category: 'futures' }),
    ];
    expect(earlierActive(active, '2026-10-05', 'all').map((p) => p.date)).toEqual([
      '2026-10-01',
      '2026-10-02',
    ]);
    expect(earlierActive(active, '2026-10-05', 'futures').map((p) => p.symbol)).toEqual(['Y']);
  });

  it('names sources briefly and never lets a horizon go negative', () => {
    expect(sourceChip('Institutional Breakout Swing', 'A')).toBe('Swing setup · A');
    expect(sourceChip('News')).toBe('News');
    expect(sourceChip('Overnight recommendations')).toBe('Recommendation');
    expect(sessionsLeft(10, 3)).toBe(7);
    expect(sessionsLeft(1, 4)).toBe(0);
  });
});

describe('the Results view', () => {
  it('colours a success rate only once enough trades closed — amber, never red, below half', () => {
    expect(successTone(80, 2)).toBeUndefined();
    expect(successTone(80, 3)).toBe('ok');
    expect(successTone(40, 5)).toBe('warn');
    expect(successTone(null, 9)).toBeUndefined();
  });

  it('sums a line in words', () => {
    expect(scoreSub({ picks: 0, closed: 0, profitable: 0 })).toBe('No picks in this window');
    expect(scoreSub({ picks: 4, closed: 0, profitable: 0 })).toBe('4 picks · none closed yet');
    expect(scoreSub({ picks: 9, closed: 8, profitable: 5 })).toBe('5 of 8 closed trades in profit');
  });

  it('orders categories and draws the days oldest first, leaving out days with no close', () => {
    const rows = [{ category: 'options' as const }, { category: 'equity' as const }];
    expect(categoryRows(rows).map((r) => r.category)).toEqual(['equity', 'options']);
    expect(
      dayBars([
        { date: '2026-10-05', avgReturnPct: 1.5 },
        { date: '2026-10-02', avgReturnPct: null },
        { date: '2026-10-01', avgReturnPct: -0.5 },
      ]),
    ).toEqual([
      { label: '1 Oct', value: -0.5 },
      { label: '5 Oct', value: 1.5 },
    ]);
  });
});
