import { candidate, normalizeReportDocument } from '@/features/next-day/lib/normalize';
import {
  verdictHead,
  VERDICT_VIEW,
  boardSections,
  clampSizing,
  compatState,
  edgeText,
  effectiveScore,
  hitCell,
  levelsLine,
  libraryRows,
  missingData,
  missingDataNote,
  morningCounts,
  parseCapital,
  parseRisk,
  pickResult,
  regimeScoreText,
  regimeTone,
  reportOptions,
  reportPollMs,
  scoreSub,
  sessionDay,
  sessionLine,
  signed,
  sizeFor,
  sizeLine,
  sizingSummary,
  squeezeSides,
  todayText,
  voteRows,
} from '@/features/next-day/lib/view';
import type {
  Candidate,
  Compatibility,
  LibraryStrategy,
  MorningCheck,
  NextDayReport,
  StrategyHits,
} from '@/features/next-day/types';

/** The board's pure logic — a port of the web's nextDayView.ts plus the phone's helpers. */

const lv = {
  direction: 'LONG',
  trigger: 200,
  invalidation: 190,
  target1: 215,
  target2: 225,
  riskPerShare: 10,
  riskPct: 5,
  rewardRisk: 2.5,
};

function cand(over: Record<string, unknown> = {}): Candidate {
  return candidate({
    symbol: 'AAA',
    name: 'Aaa Ltd',
    direction: 'LONG',
    score: 80,
    hurdle: 0,
    verdict: 'watchlist',
    tier: 'high',
    levels: lv,
    ...over,
  })!;
}

function reportWith(
  candidates: Candidate[],
  lists: Partial<NextDayReport['lists']>,
): NextDayReport {
  const doc = normalizeReportDocument({
    date: '2026-10-07',
    forDate: '2026-10-08',
    status: 'completed',
    report: {},
  })!;
  return {
    ...doc.report!,
    candidates,
    lists: { bullish: [], bearish: [], fno: [], avoid: [], squeeze: [], ...lists },
  };
}

describe('dates and labels', () => {
  it('names a session day and the report line', () => {
    expect(sessionDay('2026-10-08')).toBe('Thu 8 Oct');
    expect(sessionDay('8 Oct')).toBe('—');
    expect(sessionDay(null)).toBe('—');
    expect(sessionLine({ date: '2026-10-07', forDate: '2026-10-08' })).toBe(
      'For Thu 8 Oct · from the Wed 7 Oct close',
    );
  });

  it('tones the regime and prints its score', () => {
    expect(regimeTone('Trending bullish')).toBe('good');
    expect(regimeTone('Moderately bearish')).toBe('bad');
    expect(regimeTone('Choppy')).toBe('warn');
    expect(regimeTone('Volatile')).toBe('warn');
    expect(regimeTone('Unknown')).toBe('none');
    expect(regimeScoreText(3)).toBe('+3 of ±7');
    expect(regimeScoreText(-2)).toBe('−2 of ±7');
    expect(regimeScoreText(0)).toBe('0 of ±7');
  });

  it('signs numbers without ever printing −0', () => {
    expect(signed(0.172)).toBe('+0.17%');
    expect(signed(-0.004)).toBe('0.00%');
    expect(signed(-1.5, 1, 'R')).toBe('−1.5R');
    expect(signed(null)).toBe('—');
    expect(signed(Number.NaN)).toBe('—');
  });
});

describe('sizing', () => {
  const prefs = { capital: 1_000_000, riskPct: 0.5 };

  it('sizes from the stop distance, capped by what the capital buys', () => {
    expect(sizeFor({ riskPerShare: 10, trigger: 200 }, prefs, null)).toEqual({
      riskBudget: 5000,
      shares: 500,
      notional: 100_000,
      cappedByCapital: false,
      lots: null,
      lot: null,
      lotRisk: null,
    });
    // A very tight stop: the budget allows 50,000 shares, the capital buys 5,000.
    const tight = sizeFor({ riskPerShare: 0.1, trigger: 200 }, prefs, null);
    expect(tight).toMatchObject({ shares: 5000, cappedByCapital: true, notional: 1_000_000 });
  });

  it('counts whole futures lots inside the budget — 0 when one lot is too much risk', () => {
    expect(sizeFor({ riskPerShare: 10, trigger: 200 }, prefs, 250)).toMatchObject({
      lots: 2,
      lotRisk: 2500,
    });
    expect(sizeFor({ riskPerShare: 10, trigger: 200 }, prefs, 1000)).toMatchObject({
      lots: 0,
      lotRisk: 10000,
    });
  });

  it('never divides by zero', () => {
    expect(sizeFor({ riskPerShare: 0, trigger: 0 }, prefs, 100)).toMatchObject({
      shares: 0,
      lots: null,
    });
  });

  it('prints the size line and the sizing summary', () => {
    const size = sizeFor({ riskPerShare: 10, trigger: 200 }, prefs, 1000);
    expect(sizeLine(size, true)).toBe('500 sh · ₹1,00,000 · 1 lot over budget');
    expect(sizeLine(sizeFor({ riskPerShare: 10, trigger: 200 }, prefs, 250), true)).toBe(
      '500 sh · ₹1,00,000 · 2 lots',
    );
    expect(sizeLine(size, false)).toBe('500 sh · ₹1,00,000');
    expect(sizingSummary(prefs)).toBe('₹10L at 0.5% risk');
    expect(sizingSummary({ capital: 250_000, riskPct: 0.25 })).toBe('₹2.50L at 0.25% risk');
    expect(sizingSummary({ capital: 20_000_000, riskPct: 1 })).toBe('₹2Cr at 1% risk');
    expect(sizingSummary({ capital: 50_000, riskPct: 1 })).toBe('₹50,000 at 1% risk');
  });

  it('clamps and parses what a person types', () => {
    const fallback = { capital: 1_000_000, riskPct: 0.5 };
    expect(clampSizing({ capital: 5, riskPct: 9 }, fallback)).toEqual({
      capital: 10_000,
      riskPct: 2,
    });
    expect(clampSizing({ capital: Number.NaN }, fallback)).toEqual(fallback);
    expect(clampSizing({ riskPct: 0.333 }, fallback)).toEqual({
      capital: 1_000_000,
      riskPct: 0.33,
    });
    expect(parseCapital('10,00,000')).toBe(1_000_000);
    expect(parseCapital('₹ 50000')).toBe(50_000);
    expect(parseCapital('500')).toBeNull();
    expect(parseCapital('abc')).toBeNull();
    expect(parseCapital('')).toBeNull();
    expect(parseRisk('0.5')).toBe(0.5);
    expect(parseRisk('3')).toBeNull();
    expect(parseRisk('')).toBeNull();
  });
});

describe('the board', () => {
  it('splits the report into its lists, with the next names in line', () => {
    const a = cand({ symbol: 'A' });
    const b = cand({ symbol: 'B', direction: 'SHORT' });
    const w1 = cand({ symbol: 'W1', score: 70, hurdle: 5, verdict: 'weak' });
    const w2 = cand({ symbol: 'W2', score: 74, hurdle: 0, verdict: 'watchlist' });
    const ig = cand({ symbol: 'IG', verdict: 'ignore' });
    const av = cand({ symbol: 'AV', verdict: 'avoid', avoid: 'Conflicting votes' });
    const report = reportWith([a, b, w1, w2, ig, av], {
      bullish: ['A', 'GONE'],
      bearish: ['B'],
      avoid: ['AV', 'NOTSCORED'],
    });
    report.avoidReasons = { NOTSCORED: 'Results tomorrow' };
    const sec = boardSections(report);
    expect(sec.bullish.map((c) => c.symbol)).toEqual(['A']);
    expect(sec.bearish.map((c) => c.symbol)).toEqual(['B']);
    expect(sec.avoid).toEqual([
      { symbol: 'AV', reason: 'Conflicting votes', candidate: av },
      { symbol: 'NOTSCORED', reason: 'Results tomorrow', candidate: null },
    ]);
    // Best after the hurdle first; ignored and avoided names never.
    expect(sec.watch.map((c) => c.symbol)).toEqual(['W2', 'W1']);
  });

  it('scores after the hurdle', () => {
    expect(effectiveScore({ score: 84, hurdle: 4 })).toBe(80);
    expect(scoreSub({ score: 84, hurdle: 4 })).toBe('80 after hurdle');
    expect(scoreSub({ score: 84, hurdle: 0 })).toBe('of 100');
  });

  it('orders votes: counted with, against, uncounted, neutral, unavailable', () => {
    const c = cand({
      votes: [
        { key: 'news-catalyst', vote: 'NEUTRAL', unavailable: true, counted: false },
        { key: 'volatility-squeeze', vote: 'NEUTRAL', twoSided: true, counted: false },
        { key: 'delivery', vote: 'BUY', strength: 1, counted: false },
        { key: 'futures-oi', vote: 'SELL', strength: 2, counted: true },
        { key: 'momentum', vote: 'BUY', strength: 1, counted: true },
        { key: 'breakout', vote: 'BUY', strength: 3, counted: true },
      ],
    });
    const rows = voteRows(c);
    expect(rows.map((v) => v.key)).toEqual([
      'breakout',
      'momentum',
      'futures-oi',
      'delivery',
      'volatility-squeeze',
      'news-catalyst',
    ]);
    expect(rows.map((v) => v.state)).toEqual([
      'Counted',
      'Counted',
      'Counted',
      'Not counted',
      'Two-sided setup',
      'No data',
    ]);
    expect(rows[2]!.side).toBe('against');
  });

  it('says which files a report was built without', () => {
    expect(missingData({ data: { cash: true, indices: true, fo: true, news: true } })).toEqual([]);
    const missing = missingData({ data: { cash: true, indices: false, fo: false, news: true } });
    expect(missing).toEqual(['index closes', 'F&O positioning']);
    expect(missingDataNote(missing)).toBe(
      'Built without index closes, F&O positioning — futures and options are left out of every score.',
    );
    expect(missingDataNote(['company news'])).toBe(
      'Built without company news — those components are left out of the score.',
    );
  });

  it('prints the plan in one line', () => {
    expect(levelsLine(cand().levels!)).toBe('Above ₹200.00 · Stop ₹190.00 · T1 ₹215.00');
    expect(levelsLine({ ...cand().levels!, direction: 'SHORT' })).toMatch(/^Below ₹200\.00/);
  });

  it('orders a squeeze’s sides: the one history supports first', () => {
    const c = cand({
      direction: 'LONG',
      score: 70,
      otherScore: 75,
      twoSided: { long: lv, short: { ...lv, direction: 'SHORT', trigger: 180 } },
    });
    const compat: Compatibility[] = [
      {
        key: 'volatility-squeeze',
        vote: 'SELL',
        counted: false,
        signals: 0,
        excessPct: null,
        t: null,
        trades: 0,
        expectancyR: null,
        winRatePct: null,
        reason: '',
      },
    ];
    expect(squeezeSides(c, compat).map((s) => [s.dir, s.counted, s.score])).toEqual([
      ['LONG', true, 70],
      ['SHORT', false, 75],
    ]);
    // Both counted: the higher score first.
    expect(squeezeSides(c, []).map((s) => s.dir)).toEqual(['SHORT', 'LONG']);
    expect(squeezeSides(cand(), [])).toEqual([]);
  });

  it('counts the morning check by status', () => {
    const morning = {
      at: null,
      minute: null,
      market: { niftyPct: 0.2, direction: 'up' },
      candidates: [
        { status: 'confirmed' },
        { status: 'waiting' },
        { status: 'confirmed' },
        { status: 'no-data' },
      ],
      summary: '',
    } as unknown as MorningCheck;
    expect(morningCounts(morning)).toBe('2 confirmed · 1 waiting · 1 no quote');
  });

  it('marks an uncounted side of a scanner’s hits', () => {
    const h = {
      key: 'breakout',
      buy: 12,
      sell: 3,
      setups: 0,
      countedBuy: true,
      countedSell: false,
      top: [],
    } as StrategyHits;
    expect(hitCell(h, 'buy')).toBe('12');
    expect(hitCell(h, 'sell')).toBe('3*');
    const sq = { ...h, key: 'volatility-squeeze', setups: 4 } as StrategyHits;
    expect(hitCell(sq, 'buy')).toBe('4 setups');
    expect(hitCell(sq, 'sell')).toBe('');
  });

  it('lists completed reports for the picker, with how each did', () => {
    const opts = reportOptions([
      {
        date: '2026-10-07',
        forDate: '2026-10-08',
        status: 'completed',
        regimeLabel: 'Choppy',
        action: 'no-trade',
        picks: 0,
        outcome: null,
        error: null,
      },
      {
        date: '2026-10-06',
        forDate: '2026-10-07',
        status: 'failed',
        regimeLabel: null,
        action: null,
        picks: 0,
        outcome: null,
        error: 'x',
      },
      {
        date: '2026-10-05',
        forDate: '2026-10-06',
        status: 'completed',
        regimeLabel: 'Moderately bullish',
        action: 'normal',
        picks: 3,
        outcome: {
          date: '2026-10-05',
          forDate: '2026-10-06',
          picks: [],
          triggered: 2,
          wins: 1,
          totalR: 1.25,
        },
        error: null,
      },
    ]);
    expect(opts).toEqual([
      { date: '2026-10-07', label: 'For Thu 8 Oct', detail: 'Choppy · No trade today · no picks' },
      {
        date: '2026-10-05',
        label: 'For Tue 6 Oct',
        detail: 'Moderately bullish · Normal size · 3 picks · +1.25R on 2 triggered',
      },
    ]);
  });

  it('prints a graded pick: R, no trade, or pending', () => {
    expect(pickResult({ r: 1.5, state: 'target' })).toBe('+1.50R');
    expect(pickResult({ r: null, state: 'not-triggered' })).toBe('–');
    expect(pickResult({ r: null, state: 'pending' })).toBe('…');
  });
});

describe('reportPollMs', () => {
  // IST = UTC + 5:30.
  const at = (iso: string) => new Date(iso);

  it('polls in the evening build and the morning check on weekdays', () => {
    expect(reportPollMs(at('2026-10-07T13:00:00Z'))).toBe(300_000); // Wed 18:30 IST
    expect(reportPollMs(at('2026-10-08T04:00:00Z'))).toBe(300_000); // Thu 09:30 IST
    expect(reportPollMs(at('2026-10-07T16:15:00Z'))).toBe(300_000); // Wed 21:45 IST
  });

  it('never polls outside those windows or at the weekend', () => {
    expect(reportPollMs(at('2026-10-07T07:00:00Z'))).toBe(false); // Wed 12:30 IST
    expect(reportPollMs(at('2026-10-07T17:00:00Z'))).toBe(false); // Wed 22:30 IST
    expect(reportPollMs(at('2026-10-10T13:00:00Z'))).toBe(false); // Sat 18:30 IST
  });
});

describe('the library', () => {
  const strategy: LibraryStrategy = {
    key: 'momentum',
    name: 'Momentum',
    family: 'trend',
    summary: 'Trend and strength',
    when: 'evening',
    measurable: true,
    needs: 'Daily bars',
    rules: [],
    measure: {
      key: 'momentum',
      measurable: true,
      long: {
        edge: {
          signals: 120,
          meanPct: { d1: 0.3, d5: 0.8 },
          excessPct: { d1: 0.172, d5: 0.41 },
          t: { d1: 2.31, d5: -0.4 },
          hitPct: 54,
        },
        byRegime: {
          bull: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
          bear: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
          choppy: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
        },
        trade: {
          signals: 120,
          trades: 60,
          wins: 30,
          winRatePct: 50,
          avgR: 0.12,
          totalR: 7.2,
          profitFactor: 1.3,
          maxDrawdownR: 4,
          avgWinR: 1,
          avgLossR: -1,
          triggerRatePct: 50,
        },
      },
      short: {
        edge: {
          signals: 0,
          meanPct: { d1: null, d5: null },
          excessPct: { d1: null, d5: null },
          t: { d1: null, d5: null },
          hitPct: null,
        },
        byRegime: {
          bull: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
          bear: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
          choppy: {
            signals: 0,
            meanPct: { d1: null, d5: null },
            excessPct: { d1: null, d5: null },
            t: { d1: null, d5: null },
            hitPct: null,
          },
        },
        trade: {
          signals: 0,
          trades: 0,
          wins: 0,
          winRatePct: null,
          avgR: null,
          totalR: 0,
          profitFactor: null,
          maxDrawdownR: 0,
          avgWinR: null,
          avgLossR: null,
          triggerRatePct: null,
        },
      },
    },
    compatibility: [
      {
        key: 'momentum',
        vote: 'BUY',
        counted: true,
        signals: 120,
        excessPct: 0.17,
        t: 2.3,
        trades: 60,
        expectancyR: 0.12,
        winRatePct: 50,
        reason: 'Measured edge t 2.3',
      },
      {
        key: 'momentum',
        vote: 'SELL',
        counted: false,
        signals: 90,
        excessPct: -0.2,
        t: -2.5,
        trades: 40,
        expectancyR: -0.1,
        winRatePct: 40,
        reason: 'History contradicts it',
      },
    ],
    today: {
      key: 'momentum',
      buy: 7,
      sell: 2,
      setups: 0,
      countedBuy: true,
      countedSell: false,
      top: [],
    },
  };

  it('prints an edge with its t-statistic', () => {
    expect(edgeText(strategy.measure!.long.edge)).toBe('+0.17% (t 2.3)');
    expect(edgeText(strategy.measure!.long.edge, 'd5')).toBe('+0.41% (t −0.4)');
    expect(edgeText(strategy.measure!.short.edge)).toBe('—');
    expect(edgeText(null)).toBe('—');
  });

  it('reads whether a side’s vote counts', () => {
    expect(compatState(strategy.compatibility[0])).toBe('proven');
    expect(compatState(strategy.compatibility[1])).toBe('excluded');
    expect(compatState({ ...strategy.compatibility[0]!, reason: 'Counted provisionally' })).toBe(
      'provisional',
    );
    expect(compatState({ ...strategy.compatibility[0]!, reason: 'No contradiction' })).toBe(
      'counted',
    );
    expect(compatState(undefined)).toBe('provisional');
  });

  it('builds a row per scanner', () => {
    const row = libraryRows([strategy])[0]!;
    expect(row.long).toMatchObject({
      edge: '+0.17% (t 2.3)',
      trades: 60,
      avgR: 0.12,
      state: 'proven',
    });
    expect(row.short).toMatchObject({
      edge: '—',
      trades: 0,
      state: 'excluded',
      reason: 'History contradicts it',
    });
    expect(todayText(row)).toBe('7 / 2');
    expect(todayText({ key: 'volatility-squeeze', today: { buy: 0, sell: 0, setups: 4 } })).toBe(
      '4 setups',
    );
    expect(todayText({ key: 'momentum', today: null })).toBe('—');

    const unmeasured = libraryRows([
      { ...strategy, measure: null, compatibility: [], measurable: false },
    ])[0]!;
    expect(unmeasured.long).toMatchObject({
      edge: '—',
      state: 'provisional',
      reason: 'Not measurable on stored history — counted provisionally',
    });
  });
});

describe('verdictHead', () => {
  it('keeps the headline word for a small tile and moves the qualifier under it', () => {
    expect(verdictHead('Weak — no trade')).toEqual({ head: 'Weak', rest: 'no trade' });
    expect(verdictHead('Watchlist')).toEqual({ head: 'Watchlist', rest: '' });
    for (const { label } of Object.values(VERDICT_VIEW)) {
      expect(verdictHead(label).head.length).toBeGreaterThan(0);
    }
  });
});
