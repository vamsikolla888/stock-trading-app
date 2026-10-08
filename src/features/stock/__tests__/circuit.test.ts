import type { CircuitResponse } from '@/features/market/lib/circuit';
import {
  bandText,
  circuitBadge,
  circuitView,
  NEAR_LIMIT_PCT,
  sessionLimits,
} from '@/features/stock/lib/circuit';

const band = { lower: 95, upper: 105 };

describe('bandText', () => {
  it('names a standard band once when both sides sit on it', () => {
    expect(bandText(band, 100)).toBe('±5%');
    // Tick rounding: 4.98% / 5.02% is still the 5% band.
    expect(bandText({ lower: 95.02, upper: 104.98 }, 100)).toBe('±5%');
    expect(bandText({ lower: 80, upper: 120 }, 100)).toBe('±20%');
  });

  it('spells out an uneven band', () => {
    expect(bandText({ lower: 92, upper: 106 }, 100)).toBe('+6.0% / −8.0%');
  });

  it('says nothing without a previous close, or when the limits do not straddle it', () => {
    expect(bandText(band, null)).toBeNull();
    expect(bandText(band, 0)).toBeNull();
    expect(bandText(band, 110)).toBeNull();
  });
});

describe('circuitView', () => {
  it('is empty with no limits from either source', () => {
    const view = circuitView({ live: null, quote: null, prevClose: 100, ltp: 101 });
    expect(view).toMatchObject({ lower: null, upper: null, at: null, near: null, source: null });
  });

  it('prefers the live tick over the quote', () => {
    const view = circuitView({
      live: { lower: 90, upper: 110 },
      quote: band,
      prevClose: 100,
      ltp: 100,
    });
    expect(view).toMatchObject({ lower: 90, upper: 110, band: '±10%', source: 'live' });
    expect(circuitView({ live: null, quote: band, prevClose: 100, ltp: 100 }).source).toBe('quote');
  });

  it('says how far each limit is from the price', () => {
    const view = circuitView({ live: null, quote: band, prevClose: 100, ltp: 100 });
    expect(view.at).toBeNull();
    expect(view.near).toBeNull();
    expect(view.lowerNote).toBe('5.00% below the price');
    expect(view.upperNote).toBe('5.00% above the price');
  });

  it('marks a price at the upper or lower limit, in words', () => {
    const up = circuitView({ live: null, quote: band, prevClose: 100, ltp: 105 });
    expect(up.at).toBe('upper');
    expect(up.near).toBeNull();
    expect(up.upperNote).toBe('At the limit — only buyers queued');
    expect(up.lowerNote).toBe('9.52% below the price');

    const down = circuitView({ live: null, quote: band, prevClose: 100, ltp: 95 });
    expect(down.at).toBe('lower');
    expect(down.lowerNote).toBe('At the limit — only sellers queued');
  });

  it('marks a price near a limit, but not at it', () => {
    const justUnder = 105 / (1 + NEAR_LIMIT_PCT / 100) + 0.01;
    expect(circuitView({ live: null, quote: band, prevClose: 100, ltp: justUnder })).toMatchObject({
      at: null,
      near: 'upper',
    });
    expect(circuitView({ live: null, quote: band, prevClose: 100, ltp: 95.3 })).toMatchObject({
      at: null,
      near: 'lower',
    });
    expect(circuitView({ live: null, quote: band, prevClose: 100, ltp: 103 }).near).toBeNull();
  });

  it('keeps quiet about a price outside the band (another session’s limits)', () => {
    const view = circuitView({ live: null, quote: band, prevClose: 100, ltp: 120 });
    expect(view).toMatchObject({ lower: 95, upper: 105, at: null, near: null });
    expect(view.lowerNote).toBeNull();
    expect(view.upperNote).toBeNull();
  });

  it('shows the limits without notes before there is a price', () => {
    const view = circuitView({ live: null, quote: band, prevClose: 100, ltp: null });
    expect(view).toMatchObject({ lower: 95, upper: 105, band: '±5%', at: null });
    expect(view.upperNote).toBeNull();
  });
});

describe('sessionLimits', () => {
  const response = (asOf: string | null): CircuitResponse => ({
    exchange: 'NSE',
    symbol: 'RELIANCE',
    limits: band,
    source: 'groww',
    asOf,
    reason: null,
  });

  it('keeps limits read during today’s IST session', () => {
    // 09:00 IST on 8 Oct.
    expect(sessionLimits(response('2026-10-08T03:30:00Z'), '2026-10-08')).toEqual(band);
    expect(sessionLimits(response(null), '2026-10-08')).toEqual(band);
  });

  it('drops limits from another day (a restored cache)', () => {
    expect(sessionLimits(response('2026-10-07T09:00:00Z'), '2026-10-08')).toBeNull();
  });

  it('is null with no limits', () => {
    expect(sessionLimits(undefined, '2026-10-08')).toBeNull();
    expect(sessionLimits({ ...response(null), limits: null }, '2026-10-08')).toBeNull();
  });
});

describe('circuitBadge', () => {
  it('appears only at or near a limit', () => {
    expect(circuitBadge({ at: 'upper', near: null })).toEqual({
      label: 'Upper circuit',
      tone: 'success',
    });
    expect(circuitBadge({ at: 'lower', near: null })).toEqual({
      label: 'Lower circuit',
      tone: 'danger',
    });
    expect(circuitBadge({ at: null, near: 'upper' })?.tone).toBe('neutral');
    expect(circuitBadge({ at: null, near: null })).toBeNull();
  });
});
