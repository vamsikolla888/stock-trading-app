import {
  basketName,
  basketOutcome,
  bookReturns,
  boundLabel,
  chainQuote,
  chargeLines,
  clampPaperLots,
  countPaperOrders,
  defaultUnderlying,
  expiredCount,
  fillSummary,
  filterPaperOrders,
  parseLimitPrice,
  isExpired,
  legOrderValue,
  matchUnderlyings,
  outlookTone,
  paperIndexTiles,
  payoffGeometry,
  payoffGroups,
  payoffLegs,
  positionDteLabel,
  premiumFlow,
  settlementOutcome,
  spotSourceLabel,
} from '@/features/derivatives/lib/book';
import type {
  FnoCharges,
  FnoPositionView,
  OptionChain,
  OptionChainLeg,
  UnderlyingSummary,
} from '@/features/derivatives/types';

const money = (n: number) => `₹${n.toFixed(2)}`;
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}₹${Math.abs(n).toFixed(2)}`;

function position(overrides: Partial<FnoPositionView> = {}): FnoPositionView {
  return {
    id: 'p1',
    exchange: 'NFO',
    tradingsymbol: 'NIFTY26OCT25000CE',
    underlying: 'NIFTY',
    kind: 'CE',
    strike: 25000,
    expiry: '2026-10-27',
    daysToExpiry: 29,
    lotSize: 75,
    lots: 2,
    side: 'LONG',
    quantity: 150,
    avgPrice: 120,
    ltp: 130,
    marginBlocked: 0,
    realisedPnl: 0,
    totalCharges: 20,
    unrealisedPnl: 1500,
    currentValue: 19500,
    greeks: null,
    impliedVolatility: null,
    underlyingSpot: null,
    ...overrides,
  };
}

function leg(tradingsymbol: string, overrides: Partial<OptionChainLeg> = {}): OptionChainLeg {
  return {
    tradingsymbol,
    lotSize: 75,
    lastPrice: 100,
    impliedVolatility: 0.14,
    greeks: { price: 100, delta: 0.52, gamma: 0.001, theta: -12, vega: 8, rho: 1 },
    contractValue: 7500,
    inTheMoney: false,
    ...overrides,
  };
}

describe('payoffLegs', () => {
  it('turns the signed lot count into a side and prices at the entry', () => {
    expect(payoffLegs([position({ lots: -3, avgPrice: 55.5 })])).toEqual([
      { tradingsymbol: 'NIFTY26OCT25000CE', exchange: 'NFO', side: 'SELL', lots: 3, price: 55.5 },
    ]);
  });

  it('splits a line above the 100-lot wire cap into legs that sum to it', () => {
    const legs = payoffLegs([position({ lots: 250 })]);
    expect(legs.map((l) => l.lots)).toEqual([100, 100, 50]);
    expect(legs.every((l) => l.side === 'BUY' && l.price === 120)).toBe(true);
  });

  it('leaves the price out when the schema would refuse it, and skips a zero line', () => {
    const [free] = payoffLegs([position({ avgPrice: 0 })]);
    expect(free).not.toHaveProperty('price');
    const [huge] = payoffLegs([position({ avgPrice: 2_000_000 })]);
    expect(huge).not.toHaveProperty('price');
    expect(payoffLegs([position({ lots: 0 })])).toEqual([]);
  });

  it('only sends an exchange the schema accepts', () => {
    const [leg1] = payoffLegs([position({ exchange: 'NSE' })]);
    expect(leg1).not.toHaveProperty('exchange');
  });
});

describe('payoffGroups', () => {
  it('groups by underlying in first-seen order and flags more than eight wire legs', () => {
    const groups = payoffGroups([
      position({ id: 'a', underlying: 'NIFTY', lots: 900 }),
      position({ id: 'b', underlying: 'RELIANCE', tradingsymbol: 'RELIANCE26OCT1400CE' }),
    ]);
    expect(groups.map((g) => g.underlying)).toEqual(['NIFTY', 'RELIANCE']);
    expect(groups[0]).toMatchObject({ legCount: 9, tooMany: true });
    expect(groups[1]).toMatchObject({ legCount: 1, tooMany: false });
  });
});

describe('expiry', () => {
  it('is decided by the date, because the server clamps daysToExpiry at zero', () => {
    const expired = position({ expiry: '2026-09-25', daysToExpiry: 0 });
    expect(isExpired(expired.expiry, '2026-09-28')).toBe(true);
    expect(isExpired('2026-09-28', '2026-09-28')).toBe(false);
    expect(isExpired('not-a-date', '2026-09-28')).toBe(false);
    expect(expiredCount([expired, position()], '2026-09-28')).toBe(1);
    expect(positionDteLabel(expired, '2026-09-28')).toBe('expired');
    expect(
      positionDteLabel(position({ expiry: '2026-09-28', daysToExpiry: 0 }), '2026-09-28'),
    ).toBe('today');
    expect(positionDteLabel(position(), '2026-09-28')).toBe('29d');
  });
});

describe('settlementOutcome', () => {
  it('says "not yet" rather than "nothing expired" when an expired leg was skipped', () => {
    const outcome = settlementOutcome({ settled: 0, totalPnl: 0, details: [] }, 2, money, signed);
    expect(outcome.tone).toBe('warning');
    expect(outcome.message).toContain('2 positions passed expiry');
  });

  it('reports nothing to settle when nothing had expired', () => {
    expect(settlementOutcome({ settled: 0, totalPnl: 0, details: [] }, 0, money, signed).tone).toBe(
      'info',
    );
  });

  it('lists what settled, and what is still waiting', () => {
    const outcome = settlementOutcome(
      {
        settled: 1,
        totalPnl: -250,
        details: [{ tradingsymbol: 'X', lots: 1, settlementPrice: 12.5, pnl: -250 }],
      },
      2,
      money,
      signed,
    );
    expect(outcome.title).toBe('Settled 1 position for −₹250.00');
    expect(outcome.message).toContain('X at ₹12.50');
    expect(outcome.message).toContain('1 position still wait');
    expect(outcome.tone).toBe('warning');
  });
});

describe('payoffGeometry', () => {
  const box = { width: 300, height: 200, padLeft: 6, padRight: 6, padTop: 18, padBottom: 22 };
  const longCall = {
    points: [
      { underlyingPrice: 100, profit: -10 },
      { underlyingPrice: 110, profit: -10 },
      { underlyingPrice: 120, profit: 10 },
    ],
    breakEvens: [115, 500],
    unlimitedProfit: true,
    unlimitedLoss: false,
  };

  it('keeps zero inside the y-range and marks only in-window break-evens', () => {
    const geo = payoffGeometry(longCall, 105, box);
    expect(geo).not.toBeNull();
    expect(geo!.zeroY).toBeGreaterThan(geo!.plotTop);
    expect(geo!.zeroY).toBeLessThan(geo!.plotBottom);
    expect(geo!.breakEvens.map((b) => b.value)).toEqual([115]);
    expect(geo!.spotX).not.toBeNull();
    expect(geo!.line.startsWith('M')).toBe(true);
    expect(geo!.line).not.toContain('NaN');
  });

  it('points the unlimited edge the way the curve runs away', () => {
    const geo = payoffGeometry(longCall, null, box)!;
    expect(geo.edge).toMatchObject({ rightward: true, loss: false, x: 294 });
    expect(geo.spotX).toBeNull();
  });

  it('draws nothing for fewer than two finite points or an unmeasured box', () => {
    expect(
      payoffGeometry({ ...longCall, points: [{ underlyingPrice: 1, profit: 1 }] }, null, box),
    ).toBeNull();
    expect(payoffGeometry(longCall, null, { ...box, width: 0 })).toBeNull();
    const withNaN = {
      ...longCall,
      points: [...longCall.points, { underlyingPrice: Number.NaN, profit: 1 }],
    };
    expect(payoffGeometry(withNaN, null, box)!.line).not.toContain('NaN');
  });

  it('never divides by zero on a flat curve', () => {
    const flat = {
      points: [
        { underlyingPrice: 100, profit: 0 },
        { underlyingPrice: 100, profit: 0 },
      ],
      breakEvens: [],
      unlimitedProfit: false,
      unlimitedLoss: false,
    };
    const geo = payoffGeometry(flat, 100, box)!;
    expect(geo.area).not.toContain('NaN');
    expect(Number.isFinite(geo.zeroY)).toBe(true);
  });
});

describe('orders', () => {
  const orders = [
    { status: 'FILLED' as const },
    { status: 'REJECTED' as const },
    { status: 'FILLED' as const },
  ];

  it('filters and counts by status — a resting order is open, a cancel is closed', () => {
    const book = [...orders, { status: 'PENDING' as const }, { status: 'CANCELLED' as const }];
    expect(countPaperOrders(book)).toEqual({ all: 5, open: 1, filled: 2, closed: 2 });
    expect(filterPaperOrders(book, 'closed').map((o) => o.status)).toEqual([
      'REJECTED',
      'CANCELLED',
    ]);
    expect(filterPaperOrders(book, 'open')).toHaveLength(1);
    expect(filterPaperOrders(book, 'all')).toHaveLength(5);
  });

  it('parses a limit price, refusing anything that is not one', () => {
    expect(parseLimitPrice(' 12.35 ')).toBe(12.35);
    expect(parseLimitPrice('0')).toBeNull();
    expect(parseLimitPrice('-5')).toBeNull();
    expect(parseLimitPrice('abc')).toBeNull();
    expect(parseLimitPrice('')).toBeNull();
  });

  it('prints a premium flow in words — negative is received', () => {
    expect(premiumFlow(-1200)).toEqual({ amount: 1200, word: 'received' });
    expect(premiumFlow(300)).toEqual({ amount: 300, word: 'paid' });
  });

  it('summarises a fill, with margin only when it moved', () => {
    const charges: FnoCharges = {
      brokerage: 20,
      stt: 1,
      exchangeTxn: 2,
      sebiFee: 0.01,
      gst: 4,
      stampDuty: 0.3,
      total: 27.31,
    };
    expect(fillSummary({ premiumFlow: 900, charges, marginDelta: 0 }, money)).toBe(
      'Premium paid ₹900.00 · charges ₹27.31',
    );
    expect(fillSummary({ premiumFlow: -900, charges, marginDelta: -5000 }, money)).toBe(
      'Premium received ₹900.00 · charges ₹27.31 · margin released ₹5000.00',
    );
    expect(chargeLines(charges).map((l) => l.value)).toEqual([20, 1, 2, 0.01, 4, 0.3]);
  });

  it('counts a basket outcome and bounds its name to 60 characters', () => {
    expect(basketOutcome(orders)).toEqual({ filled: 2, total: 3 });
    expect(
      basketName('Long iron condor with a long name', 'MIDCPNIFTY', '28 Oct 2026'),
    ).toHaveLength(
      Math.min(60, 'Long iron condor with a long name · MIDCPNIFTY 28 Oct 2026'.length),
    );
    expect(basketName('x'.repeat(80), 'NIFTY', '06 Oct').length).toBe(60);
  });
});

describe('chainQuote', () => {
  const chain: Pick<OptionChain, 'rows' | 'future'> = {
    rows: [
      { strike: 25000, moneyness: 0, call: leg('CALL'), put: leg('PUT', { greeks: null }) },
      { strike: 25100, moneyness: 100, call: null, put: null },
    ],
    future: { tradingsymbol: 'FUT', lastPrice: 25010, lotSize: 75 },
  };

  it('finds a leg or the future by symbol', () => {
    expect(chainQuote(chain, 'CALL')).toEqual({
      lastPrice: 100,
      impliedVolatility: 0.14,
      delta: 0.52,
    });
    expect(chainQuote(chain, 'PUT')?.delta).toBeNull();
    expect(chainQuote(chain, 'FUT')).toEqual({
      lastPrice: 25010,
      impliedVolatility: null,
      delta: null,
    });
    expect(chainQuote(chain, 'GONE')).toBeNull();
    expect(chainQuote(null, 'CALL')).toBeNull();
  });
});

describe('explore', () => {
  it('links an index only when the catalogue lists its options, and drops unpriced ones', () => {
    const tiles = paperIndexTiles(
      [
        {
          exchange: 'NSE',
          symbol: 'NIFTY',
          label: 'NIFTY 50',
          ltp: 24800,
          changePct: 0.4,
          isExpiryToday: true,
        },
        { exchange: 'NSE', symbol: 'NIFTYIT', label: 'NIFTY IT', ltp: 38000 },
        { exchange: 'BSE', symbol: 'SENSEX', label: 'SENSEX', ltp: null },
      ],
      new Set(['NIFTY', 'BANKNIFTY']),
    );
    expect(tiles).toHaveLength(2);
    expect(tiles[0]).toMatchObject({ underlying: 'NIFTY', expiryToday: true, change: null });
    expect(tiles[1]).toMatchObject({ underlying: null, expiryToday: false });
  });

  it('opens on a listed deep link, else NIFTY, else the first listed', () => {
    const list: UnderlyingSummary[] = [
      { underlying: 'BANKNIFTY', isIndex: true, expiryCount: 3 },
      { underlying: 'NIFTY', isIndex: true, expiryCount: 8 },
      { underlying: 'RELIANCE', isIndex: false, expiryCount: 3 },
    ];
    expect(defaultUnderlying(list, ' reliance ')).toBe('RELIANCE');
    expect(defaultUnderlying(list, 'DELISTED')).toBe('NIFTY');
    expect(defaultUnderlying([list[2]!], null)).toBe('RELIANCE');
    expect(defaultUnderlying(undefined, 'NIFTY')).toBeNull();
    expect(defaultUnderlying([], 'NIFTY')).toBeNull();
  });

  it('matches prefixes before substrings, indices first', () => {
    const list: UnderlyingSummary[] = [
      { underlying: 'IRE', isIndex: false, expiryCount: 1 },
      { underlying: 'RELIANCE', isIndex: false, expiryCount: 1 },
      { underlying: 'RECLTD', isIndex: false, expiryCount: 1 },
      { underlying: 'NIFTY', isIndex: true, expiryCount: 1 },
    ];
    expect(matchUnderlyings(list, 're').map((u) => u.underlying)).toEqual([
      'RELIANCE',
      'RECLTD',
      'IRE',
    ]);
    expect(matchUnderlyings(list, '')[0]?.underlying).toBe('NIFTY');
    expect(matchUnderlyings(list, '', 2)).toHaveLength(2);
  });
});

describe('small rules', () => {
  it('clamps lots to the paper book’s 1–100', () => {
    expect(clampPaperLots(0)).toBe(1);
    expect(clampPaperLots(250)).toBe(100);
    expect(clampPaperLots(3.7)).toBe(3);
    expect(clampPaperLots(Number.NaN)).toBe(1);
  });

  it('treats a never-traded premium as unknown, not zero', () => {
    expect(legOrderValue({ lastPrice: null, lotSize: 75 }, 2)).toEqual({
      quantity: 150,
      total: null,
    });
    expect(legOrderValue({ lastPrice: 10.25, lotSize: 75 }, 2)).toEqual({
      quantity: 150,
      total: 1537.5,
    });
  });

  it('says Unlimited in words and sums returns', () => {
    expect(boundLabel(null, money)).toBe('Unlimited');
    expect(boundLabel(-500, money)).toBe('₹-500.00');
    expect(bookReturns({ unrealisedPnl: 100.1, realisedPnl: -0.05 })).toBe(100.05);
  });

  it('labels the spot source and the outlook tone', () => {
    expect(spotSourceLabel('cash-snapshot')).toBe('cash market price');
    expect(spotSourceLabel('unavailable')).toBe('no price available');
    expect(outlookTone('volatile')).toBe('warning');
    expect(outlookTone('neutral')).toBe('neutral');
  });
});
