import {
  normalizeBook,
  normalizeOrder,
  normalizeOrders,
  normalizePosition,
  normalizePreview,
  num,
} from '@/features/derivatives/lib/normalize';

/** A copy without `keys` — the same payload as an older server sends it. */
function omit<T extends object>(value: T, keys: readonly (keyof T)[]): Partial<T> {
  const copy: Partial<T> = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

const position = {
  id: 'p1',
  exchange: 'NFO',
  tradingsymbol: 'NIFTY26O2725000CE',
  underlying: 'NIFTY',
  kind: 'CE',
  strike: 25000,
  expiry: '2026-10-27',
  daysToExpiry: 22,
  lotSize: 75,
  lots: -2,
  side: 'SHORT',
  quantity: 150,
  avgPrice: 120,
  ltp: 110,
  ltpSource: 'stream',
  ltpAsOf: '2026-10-05T05:00:00.000Z',
  streamable: true,
  marginBlocked: 98000,
  realisedPnl: 0,
  totalCharges: 21.3,
  unrealisedPnl: 1500,
  currentValue: 16500,
  greeks: { price: 110, delta: -40, gamma: 0.1, theta: 900, vega: -300, rho: -5 },
  impliedVolatility: 0.14,
  underlyingSpot: 24900,
};

const order = {
  id: '665f1c2a9b1e8a0012345678',
  exchange: 'NFO',
  tradingsymbol: 'NIFTY26O2725000CE',
  underlying: 'NIFTY',
  kind: 'CE',
  strike: 25000,
  expiry: '2026-10-27',
  lotSize: 75,
  side: 'BUY',
  lots: 2,
  quantity: 150,
  type: 'MARKET',
  limitPrice: null,
  price: 0,
  status: 'PENDING',
  charges: { brokerage: 0, stt: 0, exchangeTxn: 0, sebiFee: 0, gst: 0, stampDuty: 0, total: 0 },
  marginDelta: 0,
  premiumFlow: 0,
  realisedPnl: null,
  reservedAmount: 19800,
  note: 'After-market order — fills at the first price after the market opens at 09:15 IST.',
  basketId: null,
  basketName: null,
  priceSource: null,
  afterHours: true,
  cashDelta: null,
  settlement: false,
  createdAt: '2026-10-04T14:00:00.000Z',
};

describe('num', () => {
  it('accepts finite numbers and numeric strings only', () => {
    expect(num(1.5)).toBe(1.5);
    expect(num('2.5')).toBe(2.5);
    expect(num(Number.NaN)).toBeNull();
    expect(num('')).toBeNull();
    expect(num(null)).toBeNull();
    expect(num('abc')).toBeNull();
  });
});

describe('normalizePosition', () => {
  it('keeps a current server’s fields', () => {
    expect(normalizePosition(position)).toMatchObject({
      ltp: 110,
      ltpSource: 'stream',
      ltpAsOf: '2026-10-05T05:00:00.000Z',
      streamable: true,
      side: 'SHORT',
      greeks: { delta: -40 },
    });
  });

  it('reads an older server’s position as unstreamable with no source', () => {
    const old = omit(position, ['ltpSource', 'ltpAsOf', 'streamable']);
    expect(normalizePosition(old)).toMatchObject({
      ltpSource: null,
      ltpAsOf: null,
      streamable: false,
    });
  });

  it('never keeps a source or a P&L for a missing price', () => {
    expect(normalizePosition({ ...position, ltp: null })).toMatchObject({
      ltp: null,
      ltpSource: null,
      unrealisedPnl: null,
    });
  });

  it('drops a row it cannot identify, and fixes an unknown side from the lots', () => {
    expect(normalizePosition({ ...position, tradingsymbol: '' })).toBeNull();
    expect(normalizePosition({ ...position, lots: 'two' })).toBeNull();
    expect(normalizePosition({ ...position, side: undefined })?.side).toBe('SHORT');
    expect(normalizePosition({ ...position, lots: 1, side: undefined })?.side).toBe('LONG');
    expect(normalizePosition({ ...position, greeks: { delta: null } })?.greeks).toBeNull();
    expect(normalizePosition({ ...position, ltpSource: 'carrier-pigeon' })?.ltpSource).toBeNull();
  });
});

describe('normalizeBook', () => {
  it('reads the funds, session and as-of of a current server', () => {
    const book = normalizeBook({
      positions: [position, { junk: true }],
      totals: {
        marginBlocked: 98000,
        unrealisedPnl: 1500,
        realisedPnl: 0,
        totalCharges: 21.3,
        netDelta: -40,
      },
      funds: {
        startingCapital: 500000,
        cash: 402000,
        reserved: 19800,
        available: 382200,
        pendingOrders: 1,
      },
      ungreekedCount: 0,
      sessionOpen: false,
      caveats: ['Margin is approximate.', ''],
      asOf: '2026-10-05T05:00:00.000Z',
    });
    expect(book.positions).toHaveLength(1);
    expect(book.funds).toEqual({
      startingCapital: 500000,
      cash: 402000,
      reserved: 19800,
      available: 382200,
      pendingOrders: 1,
    });
    expect(book.sessionOpen).toBe(false);
    expect(book.caveats).toEqual(['Margin is approximate.']);
    expect(book.totals.netDelta).toBe(-40);
    expect(book.totals.netGamma).toBeNull();
  });

  it('reads an older server’s book as unknown funds and session, never zero', () => {
    const book = normalizeBook({ positions: [], totals: {}, ungreekedCount: 0, caveats: [] });
    expect(book.funds).toBeNull();
    expect(book.sessionOpen).toBeNull();
    expect(book.asOf).toBeNull();
    expect(normalizeBook({ funds: { cash: 1 } }).funds).toBeNull();
    expect(normalizeBook(null).positions).toEqual([]);
  });
});

describe('normalizeOrder', () => {
  it('keeps an after-market order’s flags', () => {
    expect(normalizeOrder(order)).toMatchObject({
      status: 'PENDING',
      afterHours: true,
      reservedAmount: 19800,
      cashDelta: null,
      settlement: false,
      priceSource: null,
    });
  });

  it('reads an older server’s order: market, no flags, a settlement known by its note', () => {
    const old = omit(order, [
      'priceSource',
      'afterHours',
      'cashDelta',
      'settlement',
      'type',
      'reservedAmount',
    ]);
    expect(normalizeOrder(old)).toMatchObject({
      type: 'MARKET',
      afterHours: false,
      cashDelta: null,
      settlement: false,
      reservedAmount: 0,
    });
    expect(
      normalizeOrder({ ...old, status: 'FILLED', note: 'Settled at expiry against NIFTY’s close' })
        ?.settlement,
    ).toBe(true);
  });

  it('drops what is not an order', () => {
    expect(normalizeOrder({ ...order, status: 'LOST' })).toBeNull();
    expect(normalizeOrder({ ...order, id: '' })).toBeNull();
    expect(normalizeOrders([order, null, 'x'])).toHaveLength(1);
    expect(normalizeOrders(undefined)).toEqual([]);
  });
});

describe('normalizePreview', () => {
  const pv = {
    contract: {
      exchange: 'NFO',
      tradingsymbol: 'NIFTY26O2725000CE',
      underlying: 'NIFTY',
      kind: 'CE',
      strike: 25000,
      expiry: '2026-10-27',
      daysToExpiry: 22,
      lotSize: 75,
      tickSize: 0.05,
      freezeQuantity: 1801,
      maxLots: 24,
      isIndex: true,
    },
    side: 'BUY',
    lots: 2,
    quantity: 150,
    type: 'MARKET',
    limitPrice: null,
    sessionOpen: true,
    outcome: 'rejected',
    price: { ltp: 120, source: 'groww', label: 'Groww', asOf: '2026-10-05T05:00:00.000Z' },
    priceNote: null,
    basisPrice: 120,
    orderValue: 18000,
    marginRequired: 0,
    marginReleased: 0,
    premiumFlow: 18000,
    charges: {
      brokerage: 20,
      stt: 0,
      exchangeTxn: 9.5,
      sebiFee: 0.02,
      gst: 5.3,
      stampDuty: 0.54,
      total: 35.36,
    },
    cashDelta: null,
    reservedAmount: 0,
    realisedPnl: null,
    closingLots: 0,
    openingLots: 2,
    availableCash: 1000,
    cashAfter: null,
    marginBasis: null,
    spot: 24900,
    spotSource: 'Groww',
    breakEven: 25120,
    maxLoss: 18035.36,
    position: null,
    blockedReason: 'Not enough F&O cash: this order needs ₹18,035.36, and ₹1,000.00 is available.',
    note: null,
  };

  it('keeps a refusal as a normal answer', () => {
    expect(normalizePreview(pv)).toMatchObject({
      outcome: 'rejected',
      blockedReason: pv.blockedReason,
      charges: { total: 35.36 },
      contract: { maxLots: 24, tickSize: 0.05, strike: 25000 },
      price: { ltp: 120, source: 'groww' },
    });
  });

  it('reads a future’s strike as none, and an unusable price as no price', () => {
    const fut = normalizePreview({
      ...pv,
      contract: { ...pv.contract, kind: 'FUT', strike: 0 },
      price: { ltp: 0, source: 'groww' },
      position: { lots: -1, avgPrice: 24950 },
    });
    expect(fut?.contract.strike).toBeNull();
    expect(fut?.price).toBeNull();
    expect(fut?.position).toEqual({ lots: -1, avgPrice: 24950 });
  });

  it('refuses something that is not a preview', () => {
    expect(normalizePreview({ ...pv, outcome: 'maybe' })).toBeNull();
    expect(normalizePreview(null)).toBeNull();
  });
});
