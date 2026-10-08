import {
  circuitLimitsOf,
  normalizeCircuitResponse,
  sameCircuit,
} from '@/features/market/lib/circuit';
import { toLiveQuote, type LiveTick } from '@/features/market/lib/liveQuote';

describe('circuitLimitsOf', () => {
  it('reads a usable pair', () => {
    expect(circuitLimitsOf({ lower: 2626.9, upper: 3210.6 })).toEqual({
      lower: 2626.9,
      upper: 3210.6,
    });
  });

  it('refuses half a pair, a zero, a crossed pair or junk', () => {
    expect(circuitLimitsOf({ lower: 0, upper: 3210.6 })).toBeNull();
    expect(circuitLimitsOf({ upper: 3210.6 })).toBeNull();
    expect(circuitLimitsOf({ lower: 110, upper: 100 })).toBeNull();
    expect(circuitLimitsOf({ lower: 100, upper: 100 })).toBeNull();
    expect(circuitLimitsOf({ lower: '95', upper: '105' })).toBeNull();
    expect(circuitLimitsOf({ lower: Number.NaN, upper: 105 })).toBeNull();
    expect(circuitLimitsOf(null)).toBeNull();
    expect(circuitLimitsOf('95-105')).toBeNull();
  });

  it('compares pairs by value', () => {
    expect(sameCircuit({ lower: 1, upper: 2 }, { lower: 1, upper: 2 })).toBe(true);
    expect(sameCircuit({ lower: 1, upper: 2 }, { lower: 1, upper: 3 })).toBe(false);
    expect(sameCircuit(null, undefined)).toBe(true);
    expect(sameCircuit(null, { lower: 1, upper: 2 })).toBe(false);
  });
});

describe('normalizeCircuitResponse', () => {
  const asked = { exchange: 'NSE', symbol: 'RELIANCE' };

  it('keeps a full answer', () => {
    expect(
      normalizeCircuitResponse(
        {
          exchange: 'NSE',
          symbol: 'RELIANCE',
          limits: { lower: 95, upper: 105 },
          source: 'groww',
          asOf: '2026-10-08T03:30:00.000Z',
          reason: null,
        },
        asked,
      ),
    ).toEqual({
      exchange: 'NSE',
      symbol: 'RELIANCE',
      limits: { lower: 95, upper: 105 },
      source: 'groww',
      asOf: '2026-10-08T03:30:00.000Z',
      reason: null,
    });
  });

  it('carries the reason when there are no limits', () => {
    const out = normalizeCircuitResponse(
      { limits: null, source: null, asOf: null, reason: 'Groww did not quote this stock.' },
      asked,
    );
    expect(out).toMatchObject({
      exchange: 'NSE',
      symbol: 'RELIANCE',
      limits: null,
      source: null,
      reason: 'Groww did not quote this stock.',
    });
  });

  it('treats an unusable pair as no limits, and survives a body that is not an object', () => {
    expect(normalizeCircuitResponse({ limits: { lower: 0, upper: 5 } }, asked).limits).toBeNull();
    expect(normalizeCircuitResponse(undefined, asked)).toEqual({
      ...asked,
      limits: null,
      source: null,
      asOf: null,
      reason: null,
    });
  });
});

describe('toLiveQuote and circuit limits', () => {
  const tick = (overrides: Partial<LiveTick> = {}): LiveTick => ({
    exchange: 'NSE',
    symbol: 'RELIANCE',
    ltp: 100,
    change: null,
    changePct: null,
    prevClose: 99,
    direction: null,
    volume: 10,
    ohlc: null,
    ...overrides,
  });

  it('takes the limits a full-mode tick carries, and keeps them through ticks without', () => {
    const a = toLiveQuote(undefined, tick({ circuit: { lower: 90, upper: 110 } }), 1)!;
    expect(a.circuit).toEqual({ lower: 90, upper: 110 });
    const b = toLiveQuote(a, tick({ ltp: 101 }), 2)!;
    expect(b.circuit).toEqual({ lower: 90, upper: 110 });
    const c = toLiveQuote(b, tick({ ltp: 102, circuit: { lower: 0, upper: 0 } }), 3)!;
    expect(c.circuit).toEqual({ lower: 90, upper: 110 });
  });

  it('wakes readers when only the limits changed, without counting a price move', () => {
    const a = toLiveQuote(undefined, tick(), 1)!;
    expect(a.circuit).toBeNull();
    const b = toLiveQuote(a, tick({ circuit: { lower: 90, upper: 110 } }), 2)!;
    expect(b).not.toBe(a);
    expect(b.circuit).toEqual({ lower: 90, upper: 110 });
    expect(b.seq).toBe(a.seq);
    expect(toLiveQuote(b, tick({ circuit: { lower: 90, upper: 110 } }), 3)).toBe(b);
  });
});
