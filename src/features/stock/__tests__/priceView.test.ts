import type { Candle, StockDetail, StockListing } from '@/features/market/types';
import {
  formatNet,
  newsSymbolFor,
  rangePosition,
  rsiPath,
  sentimentMood,
  sentimentSymbols,
  stockPriceView,
  usable,
} from '@/features/stock/lib/priceView';

const TODAY = '2026-09-25';

function detail(overrides: Partial<StockDetail> = {}): StockDetail {
  return {
    symbol: 'RELIANCE',
    exchange: 'NSE',
    companyName: 'Reliance Industries',
    isin: 'INE002A01018',
    segment: 'EQ',
    lotSize: 1,
    tickSize: 0.05,
    isActive: true,
    ltp: 912,
    open: 895,
    high: 910,
    low: 890,
    prevClose: 900,
    volume: 1_000,
    changeAbs: 5,
    changePct: 0.5,
    lastUpdatedAt: null,
    volumeAsOf: '2026-09-25T06:00:00Z', // 11:30 IST today
    marketCap: null,
    yearlyHigh: 905,
    yearlyLow: 700,
    ...overrides,
  };
}

/** A daily bar stamped at 09:15 IST on `day`. */
function dailyBar(day: string, volume: number): Candle {
  const time = Date.parse(`${day}T03:45:00Z`) / 1000;
  return { time, open: 1, high: 1, low: 1, close: 1, volume };
}

const listings: StockListing[] = [
  { exchange: 'NSE', symbol: 'RELIANCE', displaySymbol: 'RELIANCE', ltp: 912, changePct: 1.3 },
  { exchange: 'BSE', symbol: '500325', displaySymbol: 'RELIANCE', ltp: 911.5, changePct: 1.2 },
];

describe('usable', () => {
  it('treats zero, negatives and non-numbers as “no price yet”', () => {
    expect(usable(12.5)).toBe(12.5);
    expect(usable(0)).toBeNull();
    expect(usable(-3)).toBeNull();
    expect(usable(Number.NaN)).toBeNull();
    expect(usable(null)).toBeNull();
    expect(usable(undefined)).toBeNull();
  });
});

describe('stockPriceView', () => {
  it('measures the move from the price and its own previous close', () => {
    const view = stockPriceView(detail(), null, TODAY);
    expect(view.ltp).toBe(912);
    expect(view.prevClose).toBe(900);
    expect(view.change).toBe(12);
    // Not the server's 0.5: the two numbers on screen must agree with each other.
    expect(view.changePct).toBeCloseTo(1.3333, 4);
  });

  it('stretches the day’s and the year’s range to contain the live price', () => {
    const view = stockPriceView(detail(), null, TODAY);
    expect(view.open).toBe(895);
    expect(view.high).toBe(912);
    expect(view.low).toBe(890);
    expect(view.yearHigh).toBe(912);
    expect(view.yearLow).toBe(700);

    const lowDay = stockPriceView(detail({ ltp: 650, low: 660 }), null, TODAY);
    expect(lowDay.low).toBe(650);
    expect(lowDay.yearLow).toBe(650);
  });

  it('falls back to the server’s change only without a usable previous close', () => {
    const view = stockPriceView(detail({ prevClose: 0 }), null, TODAY);
    expect(view.prevClose).toBeNull();
    expect(view.change).toBe(5);
    expect(view.changePct).toBe(0.5);
  });

  it('shows no move at all without a price', () => {
    const view = stockPriceView(detail({ ltp: null }), null, TODAY);
    expect(view.ltp).toBeNull();
    expect(view.change).toBeNull();
    expect(view.changePct).toBeNull();
    expect(view.high).toBe(910);
  });

  it('uses the snapshot volume only when it was refreshed today', () => {
    expect(stockPriceView(detail(), null, TODAY)).toMatchObject({
      volume: 1_000,
      volumeSession: null,
    });

    const old = detail({ volumeAsOf: '2026-09-20T06:00:00Z' });
    expect(stockPriceView(old, null, TODAY)).toMatchObject({ volume: null, volumeSession: null });
  });

  it('otherwise takes the latest daily bar, labelled with its session when not today', () => {
    const old = detail({ volumeAsOf: '2026-09-20T06:00:00Z' });
    expect(stockPriceView(old, dailyBar('2026-09-24', 42_000), TODAY)).toMatchObject({
      volume: 42_000,
      volumeSession: '2026-09-24',
    });
    expect(stockPriceView(old, dailyBar(TODAY, 7_000), TODAY)).toMatchObject({
      volume: 7_000,
      volumeSession: null,
    });
    expect(stockPriceView(old, dailyBar('2026-09-24', 0), TODAY).volume).toBeNull();
  });

  it('is all blanks before the detail arrives', () => {
    const view = stockPriceView(undefined, null, TODAY);
    expect(Object.values(view).every((value) => value === null)).toBe(true);
  });
});

describe('rangePosition', () => {
  it('places the value between the ends, clamped to 0–100', () => {
    expect(rangePosition(90, 110, 100)).toBe(50);
    expect(rangePosition(90, 110, 80)).toBe(0);
    expect(rangePosition(90, 110, 130)).toBe(100);
  });

  it('is null for a missing or empty range', () => {
    expect(rangePosition(100, 100, 100)).toBeNull();
    expect(rangePosition(null, 110, 100)).toBeNull();
    expect(rangePosition(90, 110, null)).toBeNull();
  });
});

describe('listing helpers', () => {
  it('asks for sentiment across every listing, this one first, at most three', () => {
    expect(sentimentSymbols('RELIANCE', listings)).toEqual(['RELIANCE', '500325']);
    expect(sentimentSymbols('500325', listings)).toEqual(['500325', 'RELIANCE']);
    expect(sentimentSymbols('X', undefined)).toEqual(['X']);
    const many = ['A', 'B', 'C', 'D'].map((symbol) => ({ ...listings[0]!, symbol }));
    expect(sentimentSymbols('A', many)).toEqual(['A', 'B', 'C']);
  });

  it('asks a BSE page’s news with its NSE twin', () => {
    expect(newsSymbolFor('RELIANCE', 'NSE', listings)).toBe('RELIANCE');
    expect(newsSymbolFor('500325', 'BSE', listings)).toBe('RELIANCE');
    expect(newsSymbolFor('532000', 'BSE', [listings[1]!])).toBe('532000');
  });
});

describe('sentiment wording', () => {
  it('reads the net score at the ±0.2 thresholds', () => {
    expect(sentimentMood(0.2)).toBe('positive');
    expect(sentimentMood(0.19)).toBe('mixed');
    expect(sentimentMood(-0.2)).toBe('negative');
    expect(sentimentMood(0)).toBe('mixed');
  });

  it('signs the net score with a typographic minus', () => {
    expect(formatNet(0.35)).toBe('+0.35');
    expect(formatNet(-0.2)).toBe('−0.20');
    expect(formatNet(0)).toBe('0.00');
  });
});

describe('rsiPath', () => {
  it('draws RSI on a fixed 0–100 axis', () => {
    expect(rsiPath([0, 100], 100, 50)).toBe('M0.0 48.0 L100.0 2.0');
    expect(rsiPath([50, 50, 50], 10, 20, 0)).toBe('M0.0 10.0 L5.0 10.0 L10.0 10.0');
  });

  it('clamps out-of-range values and drops non-finite ones', () => {
    expect(rsiPath([-10, Number.NaN, 120], 100, 50)).toBe('M0.0 48.0 L100.0 2.0');
  });

  it('draws nothing it cannot draw', () => {
    expect(rsiPath([40], 100, 50)).toBe('');
    expect(rsiPath([40, 60], 0, 50)).toBe('');
  });
});
