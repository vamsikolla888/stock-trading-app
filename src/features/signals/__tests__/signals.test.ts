import {
  normalizeReliability,
  normalizeSignal,
  normalizeSignals,
  normalizeSignalStatus,
} from '@/features/signals/lib/normalize';
import {
  ACTION_LABEL,
  actionChips,
  alertState,
  convictionLabel,
  featuredSignal,
  featuredWords,
  filterSignals,
  pushPreview,
  rankSignals,
  sortReliability,
  summarizeSignals,
} from '@/features/signals/lib/signals';
import type { ScreenerReliability, Signal } from '@/features/signals/types';

const raw = {
  date: '2026-10-08',
  screenerKey: 'breakout',
  screenerName: 'Breakout',
  exchange: 'NSE',
  symbol: 'acme',
  companyName: 'Acme Ltd',
  ltp: 512.5,
  changePct: 1.2,
  hitRatePct: 61.5,
  sampleTrades: 140,
  avgReturnPct: 1.8,
  holdDays: 10,
  action: 'BUY',
  conviction: 4,
  rationale: 'Closed above the 20-day high on volume.',
  invalidation: 'A close back below 495.',
  metrics: { rsi14: 64.2, volRatio: 'x' },
  meetsNotifyBar: true,
  notified: false,
  notifiedAt: null,
};

function signal(overrides: Partial<Signal> = {}): Signal {
  return { ...normalizeSignal(raw)!, ...overrides };
}

describe('normalizeSignal', () => {
  it('reads the server row, upper-casing the symbol and keeping only numeric evidence', () => {
    const s = normalizeSignal(raw)!;
    expect(s).toMatchObject({ symbol: 'ACME', action: 'BUY', hitRatePct: 61.5, conviction: 4 });
    expect(s.metrics).toEqual({ rsi14: 64.2 });
  });

  it('a missing measurement stays null — never zero', () => {
    const s = normalizeSignal({
      ...raw,
      hitRatePct: null,
      sampleTrades: undefined,
      avgReturnPct: 'NaN',
    })!;
    expect(s.hitRatePct).toBeNull();
    expect(s.sampleTrades).toBeNull();
    expect(s.avgReturnPct).toBeNull();
  });

  it('drops a row without a symbol and reads an unknown action as Watch', () => {
    expect(normalizeSignal({ ...raw, symbol: '' })).toBeNull();
    expect(normalizeSignal(null)).toBeNull();
    expect(normalizeSignal({ ...raw, action: 'HOLD' })!.action).toBe('WATCH');
    expect(normalizeSignal({ ...raw, conviction: 9 })!.conviction).toBe(5);
    expect(normalizeSignal({ ...raw, meetsNotifyBar: 'yes' })!.meetsNotifyBar).toBe(false);
  });

  it('a list keeps the good rows and the gate', () => {
    const day = normalizeSignals({
      date: '2026-10-08',
      signals: [raw, { nope: 1 }, 'x'],
      gate: { minHitRate: 70, maxHitRate: 90, minSample: 30, holdDays: 10 },
    });
    expect(day.signals).toHaveLength(1);
    expect(day.gate).toEqual({ minHitRate: 70, maxHitRate: 90, minSample: 30, holdDays: 10 });
    expect(normalizeSignals(undefined)).toEqual({ date: '', signals: [], gate: undefined });
  });
});

describe('normalizeSignalStatus', () => {
  const gate = {
    minHitRate: 70,
    maxHitRate: 90,
    minSample: 30,
    holdDays: 10,
    measured: 16,
    clearing: 0,
    bestHitRatePct: 55.2,
    bestScreener: 'Breakout',
    medianHitRatePct: 48.1,
    verdict: 'No alerts will be sent.',
  };

  it('reads job health and the gate', () => {
    const status = normalizeSignalStatus({
      generation: { running: true, waiting: 1, active: 0, lastError: null },
      reliability: { running: false, waiting: 0, active: 0, lastError: 'Job failed' },
      gate,
    });
    expect(status.generation).toEqual({ running: true, waiting: 1, active: 0, lastError: null });
    expect(status.reliability.lastError).toBe('Job failed');
    expect(status.gate).toEqual(gate);
  });

  it('an older server without job health reads as idle', () => {
    const status = normalizeSignalStatus({ gate });
    expect(status.generation).toEqual({ running: false, waiting: 0, active: 0, lastError: null });
    expect(status.gate?.verdict).toBe('No alerts will be sent.');
    expect(normalizeSignalStatus({}).gate).toBeNull();
  });
});

describe('normalizeReliability', () => {
  it('keeps measured rows and the reasons a rule cannot be measured', () => {
    const parsed = normalizeReliability({
      reliability: [
        { screenerKey: 'a', screenerName: 'A', hitRatePct: 52, sampleTrades: 90, holdDays: 10 },
        { screenerKey: 'b', hitRatePct: null },
      ],
      unmeasurable: [{ key: 'gap-up', reason: 'Needs intraday bars.' }, { reason: 'no key' }],
    });
    expect(parsed.reliability).toHaveLength(1);
    expect(parsed.reliability[0]).toMatchObject({ screenerKey: 'a', hitRatePct: 52, avgWinPct: 0 });
    expect(parsed.unmeasurable).toEqual([{ key: 'gap-up', reason: 'Needs intraday bars.' }]);
  });
});

describe('ranking and the lead setup', () => {
  const ready = signal({ symbol: 'READY', meetsNotifyBar: true, action: 'SELL', hitRatePct: 71 });
  const buy = signal({ symbol: 'BUY1', meetsNotifyBar: false, action: 'BUY', hitRatePct: 80 });
  const watch = signal({
    symbol: 'WATCH1',
    meetsNotifyBar: false,
    action: 'WATCH',
    hitRatePct: 90,
  });
  const unmeasured = signal({
    symbol: 'NEW',
    meetsNotifyBar: false,
    action: 'BUY',
    hitRatePct: null,
  });

  it('alert-ready first, then Buy over Sell over Watch, then the measured record', () => {
    const sorted = [watch, unmeasured, buy, ready].sort(rankSignals).map((s) => s.symbol);
    expect(sorted).toEqual(['READY', 'BUY1', 'NEW', 'WATCH1']);
  });

  it('leads with the best qualified setup, else the closest — and says which', () => {
    expect(featuredSignal([buy, ready])?.symbol).toBe('READY');
    expect(featuredSignal([watch, buy])?.symbol).toBe('BUY1');
    expect(featuredSignal([])).toBeNull();
    expect(featuredWords(ready).eyebrow).toBe('Best qualified setup');
    expect(featuredWords(buy).eyebrow).toBe('Closest setup — not alert-ready');
    expect(featuredWords({ meetsNotifyBar: true, notified: true }).state).toMatch(/alert was sent/);
  });

  it('filters and sorts on the phone without losing the day', () => {
    const day = [watch, unmeasured, buy, ready];
    expect(filterSignals(day, { action: 'BUY', alertReady: false }).map((s) => s.symbol)).toEqual([
      'BUY1',
      'NEW',
    ]);
    expect(filterSignals(day, { action: 'ALL', alertReady: true }).map((s) => s.symbol)).toEqual([
      'READY',
    ]);
    expect(
      filterSignals(day, { action: 'ALL', alertReady: false }, 'hitRate').map((s) => s.symbol),
    ).toEqual(['WATCH1', 'BUY1', 'READY', 'NEW']);
    expect(
      filterSignals(day, { action: 'ALL', alertReady: false }, 'symbol').map((s) => s.symbol),
    ).toEqual(['BUY1', 'NEW', 'READY', 'WATCH1']);
    // The input is never reordered.
    expect(day.map((s) => s.symbol)).toEqual(['WATCH1', 'NEW', 'BUY1', 'READY']);
  });

  it('summarises the day and counts each chip', () => {
    const summary = summarizeSignals([watch, buy, ready, signal({ notified: true })]);
    expect(summary).toEqual({
      total: 4,
      alertReady: 2,
      alertsSent: 1,
      byAction: { BUY: 2, SELL: 1, WATCH: 1 },
    });
    expect(actionChips(summary).map((c) => c.label)).toEqual([
      'All · 4',
      'Buy · 2',
      'Sell · 1',
      'Watch · 1',
    ]);
    expect(actionChips(summarizeSignals([]))[0]?.label).toBe('All');
  });
});

describe('words', () => {
  it('alert state', () => {
    expect(alertState({ notified: true, meetsNotifyBar: true }).label).toBe('Alert sent');
    expect(alertState({ notified: false, meetsNotifyBar: true }).label).toBe('Alert-ready');
    expect(alertState({ notified: false, meetsNotifyBar: false }).label).toBe('Rules not met');
  });

  it('conviction is an ordinal, never a percentage', () => {
    expect(convictionLabel(3)).toBe('3/5');
    expect(convictionLabel(7)).toBe('5/5');
    expect(convictionLabel(0)).toBe('—');
    expect(convictionLabel(null)).toBe('—');
    expect(ACTION_LABEL.WATCH).toBe('Watch');
  });

  it('the push preview uses the server’s wording, or says when one would be sent', () => {
    expect(
      pushPreview(signal({ symbol: 'ACME', action: 'BUY', hitRatePct: 71.4, sampleTrades: 140 })),
    ).toEqual({
      title: 'Best market pick — BUY ACME',
      body: '71% historical hit rate from 140 matches.',
    });
    expect(pushPreview(signal({ meetsNotifyBar: false })).title).toMatch(/when one qualifies/);
    expect(pushPreview(null).body).toMatch(/hit rate, sample size and past average/);
  });

  it('reliability: best hit rate first, ties by sample', () => {
    const row = (key: string, hitRatePct: number, sampleTrades: number) =>
      ({ screenerKey: key, hitRatePct, sampleTrades }) as ScreenerReliability;
    expect(
      sortReliability([row('a', 50, 10), row('b', 55, 5), row('c', 50, 40)]).map(
        (r) => r.screenerKey,
      ),
    ).toEqual(['b', 'c', 'a']);
  });
});
