import {
  aiProblem,
  axisMoney,
  backtestContract,
  backtestExitView,
  backtestSeries,
  backtestTone,
  BOT_TABS,
  botHeadline,
  breakdownShares,
  dayExtremes,
  dayLabel,
  edgeLine,
  filterTrades,
  fillsLine,
  funnelBars,
  holdTime,
  istClock,
  modeBadge,
  noDebateLine,
  outcomeShare,
  outcomeView,
  parseBacktestDays,
  parseBacktestUnderlying,
  parseMode,
  parsePhase,
  parseRange,
  parseTab,
  periodLabel,
  phaseView,
  pnlLabel,
  pnlSign,
  pnlTone,
  premium,
  proposalLabel,
  signedMoney,
  signedPct,
  stageSteps,
  stageSummary,
  statusTone,
  streakText,
  testScanView,
  traceStepView,
  tradeLine,
  traderCall,
  winRateTone,
} from '@/features/index-bot/lib/view';
import type { FunnelStage, TradeRow } from '@/features/index-bot/types';

const row = (over: Partial<TradeRow> = {}): TradeRow => ({
  intentId: 'AT-1',
  day: '2026-10-05',
  mode: 'paper',
  underlying: 'NIFTY',
  tradingSymbol: 'NIFTY25OCT25000CE',
  kind: 'CE',
  lots: 1,
  quantity: 75,
  plannedEntry: 120,
  stop: 96,
  target: 156,
  rewardRisk: 1.5,
  entryPrice: 120.5,
  exitPrice: 156.2,
  exitPriceDerived: false,
  status: 'CLOSED',
  phase: 'closed',
  exitReason: 'target',
  gross: 2677.5,
  charges: 92.4,
  net: 2585.1,
  enteredAt: '2026-10-05T04:35:00.000Z',
  exitedAt: '2026-10-05T05:10:00.000Z',
  holdMinutes: 35,
  pnlSource: 'paper-estimate',
  reason: '',
  edge: null,
  entryOrder: null,
  exitOrder: null,
  smartOrderStatus: null,
  ...over,
});

describe('route params', () => {
  it('honours a known tab and falls back to the overview', () => {
    expect(parseTab('controls')).toBe('controls');
    expect(parseTab(['decisions', 'x'])).toBe('decisions');
    expect(parseTab('bogus')).toBe('overview');
    expect(parseTab(undefined)).toBe('overview');
  });

  it('defaults mode to all, range to 30 days and phase to all', () => {
    expect(parseMode('live')).toBe('live');
    expect(parseMode('x')).toBe('all');
    expect(parseRange('90d')).toBe('90d');
    expect(parseRange(undefined)).toBe('30d');
    expect(parsePhase('review')).toBe('review');
    expect(parsePhase('resolved')).toBe('all');
  });
});

describe('money', () => {
  it('puts the sign before the currency and never shows −₹0', () => {
    expect(signedMoney(1240)).toBe('+₹1,240');
    expect(signedMoney(-310)).toBe('−₹310');
    expect(signedMoney(-0.4)).toBe('₹0');
    expect(signedMoney(0)).toBe('₹0');
    expect(signedMoney(-1240.456, 2)).toBe('−₹1,240.46');
    expect(signedMoney(null)).toBe('—');
    expect(signedMoney(Number.NaN)).toBe('—');
  });

  it('quotes premiums with two decimals and groups the Indian way', () => {
    expect(premium(120.5)).toBe('₹120.50');
    expect(premium(125000)).toBe('₹1,25,000.00');
    expect(premium(null)).toBe('—');
  });

  it('shortens axis values', () => {
    expect(axisMoney(800)).toBe('₹800');
    expect(axisMoney(-2500)).toBe('−₹2.5k');
    expect(axisMoney(120000)).toBe('₹1.2L');
    expect(axisMoney(0)).toBe('₹0');
  });

  it('colours by sign only', () => {
    expect(pnlSign(5)).toBe('gain');
    expect(pnlSign(-5)).toBe('loss');
    expect(pnlSign(0.001)).toBeNull();
    expect(pnlSign(null)).toBeNull();
    expect(pnlTone(10)).toBe('ok');
    expect(pnlTone(-10)).toBe('bad');
    expect(pnlTone(0)).toBeUndefined();
  });
});

describe('time and days', () => {
  it('reads hold times', () => {
    expect(holdTime(42)).toBe('42 min');
    expect(holdTime(65)).toBe('1 h 05 min');
    expect(holdTime(120)).toBe('2 h');
    expect(holdTime(3 * 24 * 60)).toBe('3 d');
    expect(holdTime(null)).toBe('—');
  });

  it('labels a day key', () => {
    expect(dayLabel('2026-10-05')).toMatch(/5 Oct/);
    expect(dayLabel('nope')).toBe('nope');
  });
});

describe('trades', () => {
  it('labels phases calmly — only an uncertain entry is red', () => {
    expect(phaseView('review')).toEqual({ label: 'Needs review', tone: 'bad' });
    expect(phaseView('closed').tone).toBe('neutral');
    expect(phaseView('open').tone).toBe('info');
    expect(phaseView('rejected').tone).toBe('warn');
  });

  it('describes a row', () => {
    expect(tradeLine(row())).toBe('NIFTY · Call · Paper · 1 lot');
    expect(tradeLine(row({ kind: 'PE', mode: 'live', lots: 2 }))).toBe(
      'NIFTY · Put · Live · 2 lots',
    );
    expect(fillsLine(row())).toBe('₹120.50 → ₹156.20');
    expect(fillsLine(row({ exitPriceDerived: true }))).toBe('₹120.50 → ≈ ₹156.20');
    expect(fillsLine(row({ exitPrice: null, entryPrice: null }))).toBe('₹120.00');
  });

  it('filters by phase', () => {
    const rows = [
      row(),
      row({ intentId: 'b', phase: 'open' }),
      row({ intentId: 'c', phase: 'review' }),
    ];
    expect(filterTrades(rows, 'all')).toHaveLength(3);
    expect(filterTrades(rows, 'review').map((r) => r.intentId)).toEqual(['c']);
  });

  it('warns on a low win rate only with enough trades', () => {
    expect(winRateTone(30, 4)).toBeUndefined();
    expect(winRateTone(30, 10)).toBe('warn');
    expect(winRateTone(45, 10)).toBeUndefined();
    expect(winRateTone(null, 10)).toBeUndefined();
  });

  it('finds the best and worst trading day', () => {
    expect(
      dayExtremes([
        { day: 'a', net: 0, trades: 0, cumulative: 0 },
        { day: 'b', net: -300, trades: 1, cumulative: -300 },
        { day: 'c', net: 900, trades: 2, cumulative: 600 },
      ]),
    ).toEqual({ best: 900, worst: -300, tradeDays: 2 });
    expect(dayExtremes([])).toEqual({ best: null, worst: null, tradeDays: 0 });
  });

  it('words a streak', () => {
    expect(streakText({ kind: 'win', length: 3 })).toBe('3 wins');
    expect(streakText({ kind: 'loss', length: 1 })).toBe('1 loss');
    expect(streakText({ kind: 'loss', length: 2 })).toBe('2 losses');
    expect(streakText(null)).toBe('—');
  });

  it('scales breakdown bars to the largest group', () => {
    expect(
      breakdownShares([
        { key: 'a', label: 'a', trades: 4, wins: 2, winRate: 50, net: 1 },
        { key: 'b', label: 'b', trades: 1, wins: 0, winRate: 0, net: -1 },
      ]),
    ).toEqual([100, 25]);
    expect(breakdownShares([])).toEqual([]);
  });
});

describe('scans', () => {
  it('keeps HOLD grey — never red', () => {
    expect(outcomeView('hold')).toEqual({ label: 'Held', tone: 'neutral' });
    expect(outcomeView('error').tone).toBe('bad');
    expect(outcomeView('ordered').tone).toBe('ok');
    expect(outcomeView('running').tone).toBe('info');
    expect(statusTone('HOLD')).toBe('neutral');
    expect(statusTone('DRY_RUN')).toBe('neutral');
    expect(statusTone('closed')).toBe('neutral');
    expect(statusTone('UNKNOWN')).toBe('bad');
    expect(statusTone('OPEN')).toBe('ok');
    expect(statusTone('SUBMITTING')).toBe('info');
  });

  it('labels a proposal', () => {
    expect(proposalLabel({ action: 'BUY_CALL', underlying: 'NIFTY' })).toBe('Buy call · NIFTY');
    expect(proposalLabel({ action: 'BUY_PUT', underlying: null })).toBe('Buy put');
    expect(proposalLabel({ action: 'HOLD', underlying: 'NIFTY' })).toBe('Hold');
    expect(proposalLabel({ action: null, underlying: null })).toBe('—');
    expect(traderCall('BUY_PUT', 'BANKNIFTY')).toBe('Buy a put on BANKNIFTY');
    expect(traderCall(null, null)).toBe('Hold');
  });

  it('compares the lower bound with break-even', () => {
    expect(
      edgeLine({
        edge: {
          samples: 40,
          wins: 20,
          observedWinRate: 50,
          wilsonLower95: 34.6,
          breakEvenRate: 41.2,
          expectedNetAtLowerBound: null,
          allowed: false,
        },
      }),
    ).toBe('35% vs 41%');
    expect(edgeLine({ edge: null })).toBe('—');
  });

  it('marks where a scan stopped', () => {
    expect(stageSteps({ stage: 'debated', outcome: 'hold' }).map((s) => s.state)).toEqual([
      'done',
      'done',
      'stop',
      'todo',
      'todo',
      'todo',
    ]);
    expect(stageSteps({ stage: 'scanned', outcome: 'running' })[1]?.state).toBe('run');
    expect(
      stageSteps({ stage: 'ordered', outcome: 'ordered' }).every((s) => s.state === 'done'),
    ).toBe(true);
    expect(stageSummary({ stage: 'debated', outcome: 'hold' })).toBe('Stopped at Proposal');
    expect(stageSummary({ stage: 'scanned', outcome: 'running' })).toBe('Running · Debate');
    expect(stageSummary({ stage: 'ordered', outcome: 'ordered' })).toBe('Every step passed');
  });

  it('draws the funnel as shares of all scans, never a zero-width non-empty stage', () => {
    const stages: FunnelStage[] = [
      { key: 'scanned', label: 'Scans', hint: '', count: 200, ofPrevious: null },
      { key: 'debated', label: 'Debated', hint: '', count: 50, ofPrevious: 25 },
      { key: 'ordered', label: 'Order placed', hint: '', count: 1, ofPrevious: 2 },
      { key: 'edge', label: 'Edge', hint: '', count: 0, ofPrevious: 0 },
    ];
    expect(funnelBars(stages).map((s) => s.width)).toEqual([100, 25, 1.5, 0]);
    expect(funnelBars([{ ...stages[0]!, count: 0 }])[0]?.width).toBe(0);
  });

  it('shares of finished scans', () => {
    expect(outcomeShare(1, 400)).toBe('0.3%');
    expect(outcomeShare(200, 400)).toBe('50%');
    expect(outcomeShare(0, 0)).toBe('—');
  });

  it('reads a trace step', () => {
    expect(
      traceStepView({
        step: 'data',
        ok: true,
        detail: 'Groww feed\nNIFTY +0.6%\n\nBANKNIFTY −0.2%',
        at: null,
      }),
    ).toEqual({
      label: 'Market data',
      verdict: 'Passed',
      tone: 'ok',
      first: 'Groww feed',
      rest: ['NIFTY +0.6%', 'BANKNIFTY −0.2%'],
    });
    expect(traceStepView({ step: 'window', ok: null, detail: 'Closed', at: null })).toMatchObject({
      verdict: 'Noted',
      tone: 'neutral',
    });
    expect(traceStepView({ step: 'risk', ok: false, detail: 'Cap', at: null }).tone).toBe('bad');
    expect(traceStepView({ step: 'custom', ok: false, detail: '', at: null }).label).toBe('custom');
  });

  it('words a test scan', () => {
    expect(testScanView({ status: 'RUNNING', reason: 'Test scan' }).tone).toBe('info');
    expect(testScanView({ status: 'DRY_RUN', reason: 'Would buy 1 lot of X' }).tone).toBe('ok');
    expect(testScanView({ status: 'DRY_RUN', reason: 'Would hold — no candidate' }).tone).toBe(
      'neutral',
    );
    expect(testScanView({ status: 'DRY_RUN', reason: 'Test scan failed — timeout' }).tone).toBe(
      'bad',
    );
  });
});

describe('the bot’s state', () => {
  it('words the header', () => {
    expect(botHeadline({ enabled: true, mode: 'paper' })).toEqual({
      label: 'Paper trading armed',
      tone: 'ok',
    });
    expect(botHeadline({ enabled: true, mode: 'live' })).toEqual({
      label: 'Live trading armed',
      tone: 'warn',
    });
    expect(botHeadline({ enabled: false, mode: 'live' })).toEqual({
      label: 'Live trading off',
      tone: 'neutral',
    });
    expect(modeBadge('live')).toEqual({ label: 'LIVE', variant: 'warning' });
    expect(modeBadge('paper').label).toBe('PAPER');
  });

  it('never calls figures that include live trades "paper"', () => {
    expect(pnlLabel('paper')).toBe('Paper P&L');
    expect(pnlLabel('live')).toBe('Live P&L');
    expect(pnlLabel('all')).toBe('Net P&L');
  });

  it('says plainly when the AI service is missing or not answering', () => {
    expect(aiProblem({ aiConfigured: false, aiReady: null, aiReason: null })?.title).toBe(
      'AI service is not configured.',
    );
    expect(
      aiProblem({ aiConfigured: true, aiReady: false, aiReason: 'The AI worker is not running.' }),
    ).toEqual({
      title: 'The AI service is not answering.',
      message: 'The AI worker is not running. Scans keep retrying.',
    });
    expect(aiProblem({ aiConfigured: true, aiReady: false, aiReason: null })?.message).toBe(
      'Scans cannot reach the debate. Scans keep retrying.',
    );
    // An older server does not report readiness: configured is all that is known.
    expect(aiProblem({ aiConfigured: true, aiReady: null, aiReason: null })).toBeNull();
    expect(aiProblem({ aiConfigured: true, aiReady: true, aiReason: null })).toBeNull();
  });

  it('tells a debate that ran apart from a scan that never reached it', () => {
    expect(noDebateLine('The AI debate failed: the answer did not match')).toBe(
      'The debate ran but gave no usable answer — The AI debate failed: the answer did not match',
    );
    expect(noDebateLine('AI agent failed: timeout')).toMatch(/^The debate ran/);
    expect(noDebateLine('Outside exchange hours')).toBe(
      'This scan stopped before the debate: Outside exchange hours',
    );
    expect(noDebateLine('  ')).toBe('This scan stopped before the debate: no reason recorded');
    expect(noDebateLine(null)).toMatch(/no reason recorded$/);
  });
});

describe('backtest view', () => {
  it('parses the tab, index and window from the route', () => {
    expect(parseTab('backtest')).toBe('backtest');
    expect(BOT_TABS.map((t) => t.key)).toEqual([
      'overview',
      'trades',
      'decisions',
      'backtest',
      'controls',
    ]);
    expect(parseBacktestUnderlying('BANKNIFTY')).toBe('BANKNIFTY');
    expect(parseBacktestUnderlying('FINNIFTY')).toBe('NIFTY');
    expect(parseBacktestUnderlying(undefined)).toBe('NIFTY');
    expect(parseBacktestDays('60')).toBe(60);
    expect(parseBacktestDays(['90'])).toBe(90);
    expect(parseBacktestDays('45')).toBe(30);
  });

  it('signs percentages without a negative zero', () => {
    expect(signedPct(4.234)).toBe('+4.2%');
    expect(signedPct(-1.86)).toBe('−1.9%');
    expect(signedPct(-0.04)).toBe('0.0%');
    expect(signedPct(0.625, 2)).toBe('+0.63%');
    expect(signedPct(null)).toBe('—');
  });

  it('colours the return only once there is a sample', () => {
    expect(backtestTone({ trades: 3, grossReturnPct: 40 })).toBeUndefined();
    expect(backtestTone({ trades: 12, grossReturnPct: 8.5 })).toBe('ok');
    expect(backtestTone({ trades: 12, grossReturnPct: -3 })).toBe('bad');
    expect(backtestTone({ trades: 12, grossReturnPct: 0 })).toBeUndefined();
  });

  it('draws the compounded return from the equity curve', () => {
    const series = backtestSeries([
      { day: '2026-09-01', returnPct: 25, equity: 125 },
      { day: '2026-09-03', returnPct: -15, equity: 106.25 },
    ]);
    expect(series.running).toEqual([25, 6.25]);
    expect(series.perTrade.map((b) => b.value)).toEqual([25, -15]);
    expect(series.labels).toHaveLength(2);
    expect(series.perTrade[0]?.label).toBe(series.labels[0]);
    expect(backtestSeries([])).toEqual({ labels: [], running: [], perTrade: [] });
  });

  it('words exits, times, contracts and the window', () => {
    expect(backtestExitView('target')).toEqual({ label: 'Target', tone: 'ok' });
    expect(backtestExitView('stop').tone).toBe('warn');
    expect(backtestExitView('time').tone).toBe('neutral');
    expect(backtestExitView(null).label).toBe('—');
    // 04:45 UTC is 10:15 IST.
    expect(istClock('2026-10-05T04:45:00.000Z')).toBe('10:15');
    expect(istClock(null)).toBe('—');
    expect(backtestContract('NIFTY', { strike: 25000, kind: 'CE' })).toBe('NIFTY 25000 CE');
    expect(backtestContract('BANKNIFTY', { strike: null, kind: 'PE' })).toBe('BANKNIFTY PE');
    expect(periodLabel({ from: null, to: '2026-10-07' })).toBe('—');
    expect(periodLabel({ from: '2026-09-08', to: '2026-10-07' })).toMatch(/–/);
  });
});
