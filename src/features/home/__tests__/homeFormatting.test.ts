import { formatPriceMove } from '@/components/market/priceMove';
import { indexChange } from '@/features/home/lib/indexChange';

describe('indexChange', () => {
  it('derives points and percent from the level and previous close', () => {
    const change = indexChange({
      exchange: 'NSE',
      symbol: 'NIFTY 50',
      ltp: 24815.4,
      prevClose: 24610.3,
      change: 999, // ignored: the derived move always agrees with the level shown
      changePct: 9.99,
    });
    expect(change.points).toBeCloseTo(205.1);
    expect(change.pct).toBeCloseTo(0.8334, 3);
  });

  it('falls back to the feed’s own fields without a usable previous close', () => {
    expect(
      indexChange({
        exchange: 'NSE',
        symbol: 'X',
        ltp: 100,
        prevClose: 0,
        change: 2,
        changePct: 1,
      }),
    ).toEqual({ points: 2, pct: 1 });
    expect(indexChange({ exchange: 'NSE', symbol: 'X', ltp: null, prevClose: null })).toEqual({
      points: null,
      pct: null,
    });
  });
});

describe('formatPriceMove', () => {
  it('prints the rupee move with the percent in brackets', () => {
    expect(formatPriceMove(15.75, 1.24)).toBe('+15.75 (1.24%)');
    expect(formatPriceMove(-16.1, -0.41)).toBe('−16.10 (0.41%)');
  });

  it('falls back to the signed percent when the rupee move is unknown', () => {
    // /stocks/top-volume sends no changeAbs.
    expect(formatPriceMove(undefined, 2.5)).toBe('+2.50%');
    expect(formatPriceMove(null, null)).toBe('—');
  });
});
