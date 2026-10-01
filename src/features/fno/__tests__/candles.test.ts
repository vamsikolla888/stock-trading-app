import type { Candle } from '@/features/market/types';

import {
  barTimeLabel,
  candleWindow,
  CHART_INTERVALS,
  chartAnchor,
  contractChipLabel,
  DEFAULT_CHART_INTERVAL,
  foldLivePrice,
  MAX_CHART_BARS,
  toChartCandles,
} from '../lib/candles';
import type { FnoCandle, FnoChainLeg, FnoChainRow, FnoContract, FnoFutureRow } from '../types';

function contract(overrides: Partial<FnoContract> = {}): FnoContract {
  return {
    exchange: 'NFO',
    tradingSymbol: 'NIFTY25100CE',
    growwSymbol: null,
    underlying: 'NIFTY',
    kind: 'CE',
    expiry: '2026-10-06',
    strike: 25100,
    lotSize: 75,
    tickSize: 0.05,
    freezeQuantity: null,
    exchangeToken: '1',
    buyAllowed: true,
    sellAllowed: true,
    ...overrides,
  };
}

function leg(c: FnoContract | null): FnoChainLeg {
  return { contract: c } as FnoChainLeg;
}

function row(strike: number, call: FnoContract | null, put: FnoContract | null): FnoChainRow {
  return { strike, call: leg(call), put: leg(put) };
}

function future(c: FnoContract): FnoFutureRow {
  return { contract: c } as FnoFutureRow;
}

function bar(time: number, close: number, overrides: Partial<FnoCandle> = {}): FnoCandle {
  return {
    time,
    open: close,
    high: close + 2,
    low: close - 2,
    close,
    volume: 10,
    openInterest: null,
    ...overrides,
  };
}

function candle(time: number, close: number): Candle {
  return { time, open: close, high: close + 2, low: close - 2, close, volume: 10 };
}

describe('chart intervals', () => {
  // fno.dto.ts CANDLE_MAX_DAYS — a longer window is a 422.
  const SERVER_CAP_DAYS: Record<string, number> = {
    '1minute': 30,
    '5minute': 30,
    '15minute': 90,
    '1hour': 180,
    '1day': 180,
  };

  it('keeps every look-back inside the server cap for its interval', () => {
    for (const interval of CHART_INTERVALS) {
      expect(interval.days).toBeLessThanOrEqual(SERVER_CAP_DAYS[interval.key]!);
    }
  });

  it('defaults to 5-minute bars, like the web chart', () => {
    expect(DEFAULT_CHART_INTERVAL).toBe('5minute');
  });

  it('builds a window that ends now, in epoch seconds', () => {
    const now = Date.UTC(2026, 9, 1, 5, 0, 0) + 999;
    const to = Math.floor(now / 1000);
    expect(candleWindow('5minute', now)).toEqual({ from: to - 5 * 86_400, to });
    expect(candleWindow('1day', now)).toEqual({ from: to - 180 * 86_400, to });
  });
});

describe('toChartCandles', () => {
  it('keeps only the latest bars', () => {
    const bars = Array.from({ length: MAX_CHART_BARS + 30 }, (_, i) =>
      bar(1_000 + i * 60, 100 + i),
    );
    const out = toChartCandles(bars);
    expect(out).toHaveLength(MAX_CHART_BARS);
    expect(out[0]!.time).toBe(bars[30]!.time);
    expect(out[out.length - 1]!.time).toBe(bars[bars.length - 1]!.time);
  });

  it('drops malformed bars and reads unknown volume as zero', () => {
    const out = toChartCandles([
      bar(60, 100, { volume: null }),
      bar(120, 0),
      bar(180, Number.NaN),
      bar(240, 101, { low: -1 }),
      bar(300, 102),
    ]);
    expect(out.map((c) => c.time)).toEqual([60, 300]);
    expect(out[0]!.volume).toBe(0);
    expect(out[1]!.volume).toBe(10);
  });
});

describe('foldLivePrice', () => {
  const series = [candle(0, 100), candle(300, 110)];

  it('moves the forming bar to the live price and widens its range', () => {
    const out = foldLivePrice(series, 120, 400, 300);
    expect(out).not.toBe(series);
    expect(out[1]).toEqual({ ...series[1], close: 120, high: 120, low: 108 });
    expect(out[0]).toBe(series[0]);

    const down = foldLivePrice(series, 100, 400, 300);
    expect(down[1]).toMatchObject({ close: 100, high: 112, low: 100 });
  });

  it('returns the same array when the price changes nothing', () => {
    const inside = [candle(300, 110)];
    expect(foldLivePrice(inside, 110, 400, 300)).toBe(inside);
    expect(foldLivePrice(inside, 111, 400, 300)[0]).toMatchObject({ high: 112, low: 108 });
    const flat = [{ time: 300, open: 110, high: 110, low: 110, close: 110, volume: 0 }];
    expect(foldLivePrice(flat, 110, 400, 300)).toBe(flat);
  });

  it('never invents a bar past the last one — the next refetch brings it', () => {
    expect(foldLivePrice(series, 120, 600, 300)).toBe(series);
    expect(foldLivePrice(series, 120, 9_999, 300)).toBe(series);
  });

  it('ignores a clock behind the last bar and an unusable price', () => {
    expect(foldLivePrice(series, 120, 299, 300)).toBe(series);
    expect(foldLivePrice(series, null, 400, 300)).toBe(series);
    expect(foldLivePrice(series, 0, 400, 300)).toBe(series);
    expect(foldLivePrice(series, Number.NaN, 400, 300)).toBe(series);
    expect(foldLivePrice([], 120, 400, 300)).toEqual([]);
  });
});

describe('chartAnchor', () => {
  const atmCall = contract({ tradingSymbol: 'NIFTY25100CE' });
  const atmPut = contract({ tradingSymbol: 'NIFTY25100PE', kind: 'PE' });
  const otherCall = contract({ tradingSymbol: 'NIFTY25200CE', strike: 25200 });
  const nearFut = contract({ tradingSymbol: 'NIFTYFUT', kind: 'FUT', strike: null });
  const futures = { futures: [future(nearFut)] };

  it('prefers the ATM call, then the ATM put', () => {
    const chain = { atmStrike: 25100, rows: [row(25000, null, null), row(25100, atmCall, atmPut)] };
    expect(chartAnchor('options', chain, futures)).toBe(atmCall);
    const noCall = { atmStrike: 25100, rows: [row(25100, null, atmPut)] };
    expect(chartAnchor('options', noCall, futures)).toBe(atmPut);
  });

  it('falls back to any listed leg, then the nearest future', () => {
    const offAtm = {
      atmStrike: 25100,
      rows: [row(25100, null, null), row(25200, otherCall, null)],
    };
    expect(chartAnchor('options', offAtm, futures)).toBe(otherCall);
    expect(chartAnchor('options', { atmStrike: null, rows: [] }, futures)).toBe(nearFut);
    expect(chartAnchor('options', undefined, undefined)).toBeNull();
  });

  it('charts the futures tab through the nearest future only', () => {
    const chain = { atmStrike: 25100, rows: [row(25100, atmCall, atmPut)] };
    expect(chartAnchor('futures', chain, futures)).toBe(nearFut);
    expect(chartAnchor('futures', chain, { futures: [] })).toBeNull();
  });
});

describe('chart labels', () => {
  it('names a picked contract briefly', () => {
    expect(contractChipLabel(contract())).toBe('25,100 CE');
    expect(contractChipLabel(contract({ kind: 'PE', strike: 24950 }))).toBe('24,950 PE');
    expect(contractChipLabel(contract({ kind: 'FUT', strike: null, expiry: '2026-10-27' }))).toBe(
      '27 Oct Fut',
    );
  });

  it('labels a scrubbed bar in IST', () => {
    const t = Date.UTC(2026, 9, 1, 5, 5) / 1000; // 10:35 IST
    expect(barTimeLabel(t, true)).toBe('01 Oct, 10:35');
    expect(barTimeLabel(t, false)).toBe('Thu, 01 Oct 2026');
  });
});
