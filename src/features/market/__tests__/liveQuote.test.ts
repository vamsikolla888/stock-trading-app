import {
  changePctFrom,
  impliedPrevClose,
  liveKey,
  overlayQuote,
  splitLiveKey,
  toLiveQuote,
  type LiveQuote,
  type LiveTick,
} from '../lib/liveQuote';

function tick(overrides: Partial<LiveTick> = {}): LiveTick {
  return {
    exchange: 'NSE',
    symbol: 'RELIANCE',
    ltp: 1300,
    change: null,
    changePct: null,
    prevClose: 1280,
    direction: null,
    volume: 1000,
    ohlc: null,
    ...overrides,
  };
}

describe('live keys', () => {
  it('are exchange-qualified and upper-cased, NSE by default', () => {
    expect(liveKey('nse', 'reliance')).toBe('NSE:RELIANCE');
    expect(liveKey(null, 'TCS')).toBe('NSE:TCS');
    expect(liveKey('BSE', 'TCS')).not.toBe(liveKey('NSE', 'TCS'));
  });

  it('split on the first colon only', () => {
    expect(splitLiveKey('NFO:NIFTY25OCT25100CE')).toEqual({
      exchange: 'NFO',
      symbol: 'NIFTY25OCT25100CE',
    });
    expect(splitLiveKey('NSE:A:B')).toEqual({ exchange: 'NSE', symbol: 'A:B' });
    expect(splitLiveKey('RELIANCE')).toEqual({ exchange: 'NSE', symbol: 'RELIANCE' });
  });
});

describe('toLiveQuote', () => {
  it('starts a quote from the first tick', () => {
    const q = toLiveQuote(undefined, tick(), 1)!;
    expect(q).toMatchObject({ ltp: 1300, prevClose: 1280, volume: 1000, dir: null, seq: 1, at: 1 });
  });

  it('records the direction of each move and counts it', () => {
    const a = toLiveQuote(undefined, tick({ ltp: 1300 }), 1)!;
    const b = toLiveQuote(a, tick({ ltp: 1301 }), 2)!;
    const c = toLiveQuote(b, tick({ ltp: 1299.5 }), 3)!;
    expect([b.dir, b.seq]).toEqual(['up', 2]);
    expect([c.dir, c.seq]).toEqual(['down', 3]);
  });

  it('returns the same quote for a duplicate tick, so nothing re-renders', () => {
    const a = toLiveQuote(undefined, tick(), 1)!;
    expect(toLiveQuote(a, tick(), 2)).toBe(a);
  });

  it('keeps the last known fields a tick omits, without counting a volume-only change as a move', () => {
    const a = toLiveQuote(undefined, tick({ volume: 1000 }), 1)!;
    const b = toLiveQuote(a, tick({ volume: 1500, prevClose: null }), 2)!;
    expect(b).toMatchObject({ prevClose: 1280, volume: 1500, seq: 1 });
  });

  it('rejects a tick with no usable price', () => {
    expect(toLiveQuote(undefined, tick({ ltp: 0 }), 1)).toBeNull();
    expect(toLiveQuote(undefined, tick({ ltp: Number.NaN }), 1)).toBeNull();
  });
});

describe('measuring the move', () => {
  it('changePctFrom needs a positive price and previous close', () => {
    expect(changePctFrom(110, 100)).toBeCloseTo(10);
    expect(changePctFrom(110, 0)).toBeNull();
    expect(changePctFrom(null, 100)).toBeNull();
  });

  it('impliedPrevClose prefers the rupee move, then the percentage', () => {
    expect(impliedPrevClose(110, 10, 999)).toBe(100);
    expect(impliedPrevClose(110, null, 10)).toBeCloseTo(100);
    expect(impliedPrevClose(110, null, null)).toBeNull();
    expect(impliedPrevClose(null, 10, 10)).toBeNull();
  });
});

describe('overlayQuote', () => {
  const live = (ltp: number, extra: Partial<LiveQuote> = {}): LiveQuote => ({
    ltp,
    prevClose: 90,
    changePct: 0,
    volume: null,
    ohlc: null,
    dir: null,
    seq: 1,
    at: 1,
    ...extra,
  });

  it('shows the REST row untouched until the first tick', () => {
    expect(overlayQuote({ price: 105, changePct: 5 }, undefined)).toEqual({
      price: 105,
      change: expect.closeTo(5, 6),
      changePct: expect.closeTo(5, 6),
      live: false,
    });
  });

  it("measures the live price against the row's own previous close", () => {
    const view = overlayQuote({ price: 105, prevClose: 100 }, live(110));
    expect(view).toEqual({ price: 110, change: 10, changePct: 10, live: true });
  });

  it("prefers the row's implied previous close over the tick's", () => {
    // The row says +5 % at 105 → previous close 100; the tick's 90 is not used.
    const view = overlayQuote({ price: 105, changePct: 5 }, live(110));
    expect(view.changePct).toBeCloseTo(10);
  });

  it("never trusts the tick's own (often stuck-at-zero) percentage over a measurement", () => {
    const view = overlayQuote({ price: null }, live(99, { changePct: 0, prevClose: 90 }));
    expect(view.changePct).toBeCloseTo(10);
  });

  it("falls back to the tick's percentage only when nothing can be measured", () => {
    const view = overlayQuote({ price: null }, live(99, { prevClose: null, changePct: 1.5 }));
    expect(view).toEqual({ price: 99, change: null, changePct: 1.5, live: true });
  });

  it('reports unknown as null, never as 0 %', () => {
    expect(overlayQuote({ price: null }, undefined)).toEqual({
      price: null,
      change: null,
      changePct: null,
      live: false,
    });
  });
});
