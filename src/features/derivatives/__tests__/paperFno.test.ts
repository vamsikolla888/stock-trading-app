import {
  ageWords,
  commitLabel,
  estimateValue,
  exitOrderFor,
  expiryWords,
  fnoAccountView,
  fnoHitView,
  fnoSearchHits,
  inputSignature,
  liveBook,
  livePnlPct,
  livePositionPnl,
  ltpProvenance,
  marketStateWords,
  maxLossLabel,
  maxLotsFor,
  nextOpenWords,
  onTick,
  orderStatusView,
  outcomeWords,
  isPaperExchange,
  paperContractOfFno,
  paperContractOfRow,
  parseLots,
  previewSignature,
  priceSourceWord,
  receiptWords,
  sessionOpenAt,
  snapToTick,
  stepPrice,
} from '@/features/derivatives/lib/paperFno';
import type { FnoOrderPreview } from '@/features/derivatives/types';
import type { FnoContract, FnoUnderlying } from '@/features/fno/types';

/** IST wall-clock → epoch ms (IST is UTC+5:30, no DST). */
const ist = (iso: string) => Date.parse(`${iso}+05:30`);

function contract(overrides: Partial<FnoContract> = {}): FnoContract {
  return {
    exchange: 'NFO',
    tradingSymbol: 'NIFTY26O2725000CE',
    growwSymbol: null,
    underlying: 'NIFTY',
    kind: 'CE',
    expiry: '2026-10-27',
    strike: 25000,
    lotSize: 75,
    tickSize: 0.05,
    freezeQuantity: 1801,
    exchangeToken: '1',
    buyAllowed: true,
    sellAllowed: true,
    ...overrides,
  };
}

function underlying(name: string, overrides: Partial<FnoUnderlying> = {}): FnoUnderlying {
  return {
    underlying: name,
    exchange: 'NFO',
    isIndex: false,
    spotSymbol: name,
    name: null,
    nearestExpiry: '2026-10-27',
    expiryCount: 3,
    hasOptions: true,
    hasFutures: true,
    lotSize: 50,
    contractCount: 100,
    ...overrides,
  };
}

function preview(overrides: Partial<FnoOrderPreview> = {}): FnoOrderPreview {
  return {
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
    outcome: 'fill',
    price: { ltp: 120, source: 'groww', label: 'Groww', asOf: '2026-10-05T05:00:00.000Z' },
    priceNote: null,
    basisPrice: 120,
    orderValue: 18000,
    marginRequired: 0,
    marginReleased: 0,
    premiumFlow: 18000,
    charges: null,
    cashDelta: -18045.2,
    reservedAmount: 0,
    realisedPnl: null,
    closingLots: 0,
    openingLots: 2,
    availableCash: 500000,
    cashAfter: 481954.8,
    marginBasis: null,
    spot: 24900,
    spotSource: 'Groww',
    breakEven: 25120,
    maxLoss: 18045.2,
    position: null,
    blockedReason: null,
    note: null,
    ...overrides,
  };
}

describe('contracts', () => {
  it('takes a Groww contract as is, and nulls a future’s strike', () => {
    expect(paperContractOfFno(contract())).toEqual({
      exchange: 'NFO',
      tradingsymbol: 'NIFTY26O2725000CE',
      underlying: 'NIFTY',
      kind: 'CE',
      strike: 25000,
      expiry: '2026-10-27',
      lotSize: 75,
      tickSize: 0.05,
      freezeQuantity: 1801,
    });
    expect(paperContractOfFno(contract({ kind: 'FUT', strike: 0 }))?.strike).toBeNull();
    expect(paperContractOfFno(contract({ exchange: 'BFO' }))?.exchange).toBe('BFO');
  });

  it('refuses a commodity contract rather than re-labelling it as NSE', () => {
    expect(paperContractOfFno(contract({ exchange: 'MCX' }))).toBeNull();
    expect(paperContractOfFno(contract({ exchange: 'NCO' }))).toBeNull();
    expect(isPaperExchange('NFO')).toBe(true);
    expect(isPaperExchange('BFO')).toBe(true);
    expect(isPaperExchange('MCX')).toBe(false);
    expect(isPaperExchange(null)).toBe(false);
  });

  it('reads a book row: a future’s stored 0 strike is no strike; limits unknown', () => {
    const row = {
      exchange: 'BFO',
      tradingsymbol: 'SENSEX26OCTFUT',
      underlying: 'SENSEX',
      kind: 'FUT' as const,
      strike: 0,
      expiry: '2026-10-29',
      lotSize: 20,
    };
    expect(paperContractOfRow(row)).toMatchObject({
      exchange: 'BFO',
      strike: null,
      tickSize: null,
      freezeQuantity: null,
    });
    expect(
      paperContractOfRow({ ...row, exchange: 'XYZ', kind: 'PE', strike: 81000 }),
    ).toMatchObject({ exchange: 'NFO', strike: 81000 });
  });
});

describe('live marks', () => {
  const long = { lots: 2, lotSize: 75, avgPrice: 100, kind: 'CE' as const, marginBlocked: 0 };
  const short = { lots: -1, lotSize: 75, avgPrice: 100, kind: 'CE' as const, marginBlocked: 50000 };

  it('signs P&L by direction and never invents one without a price', () => {
    expect(livePositionPnl(long, 110)).toBe(1500);
    expect(livePositionPnl(short, 110)).toBe(-750);
    expect(livePositionPnl(long, null)).toBeNull();
    expect(livePositionPnl(long, Number.NaN)).toBeNull();
  });

  it('measures a long option on its premium and a short on its margin', () => {
    expect(livePnlPct(1500, long)).toBe(10);
    expect(livePnlPct(-750, short)).toBe(-1.5);
    expect(livePnlPct(null, long)).toBeNull();
    expect(livePnlPct(100, { ...short, marginBlocked: 0 })).toBeNull();
  });

  it('totals only the priced positions and counts the rest', () => {
    const book = liveBook([long, short, { ...long, avgPrice: 50 }], (p) =>
      p.avgPrice === 50 ? null : 110,
    );
    expect(book).toEqual({ unrealised: 750, unpriced: 1, priced: 2 });
  });

  it('exits the opposite way with every lot', () => {
    expect(exitOrderFor({ lots: 3 })).toEqual({ side: 'SELL', lots: 3 });
    expect(exitOrderFor({ lots: -2 })).toEqual({ side: 'BUY', lots: 2 });
  });
});

describe('ticket inputs', () => {
  it('keeps an empty lots box empty', () => {
    expect(parseLots('')).toBeNull();
    expect(parseLots('3')).toBe(3);
    expect(parseLots('1,0')).toBe(10);
  });

  it('caps lots at the freeze limit and the sandbox cap', () => {
    expect(maxLotsFor(75, 1801)).toBe(24);
    expect(maxLotsFor(75, null)).toBe(100);
    expect(maxLotsFor(1, 100000)).toBe(100);
    expect(maxLotsFor(0, 1801)).toBe(0);
  });

  it('snaps and steps on the tick grid in whole paise', () => {
    expect(snapToTick(120.12, 0.05)).toBe(120.1);
    expect(snapToTick(0.01, 0.05)).toBe(0.05);
    expect(stepPrice(120.1, 0.05, 1)).toBe(120.15);
    expect(stepPrice(120.12, 0.05, 1)).toBe(120.15);
    expect(stepPrice(120.12, 0.05, -1)).toBe(120.1);
    expect(stepPrice(0.05, 0.05, -1)).toBe(0.05);
    expect(stepPrice(10, null, 1)).toBe(10.05);
  });

  it('accepts a limit on the grid, or any limit when the tick is unknown', () => {
    expect(onTick(120.15, 0.05)).toBe(true);
    expect(onTick(120.12, 0.05)).toBe(false);
    expect(onTick(120.12, null)).toBe(true);
  });

  it('compares an estimate with the inputs it answers', () => {
    const typed = { side: 'BUY' as const, lots: 2, type: 'MARKET' as const };
    expect(inputSignature(typed)).toBe(previewSignature(preview()));
    expect(inputSignature({ ...typed, lots: 3 })).not.toBe(previewSignature(preview()));
    // A MARKET estimate ignores a stale limit; a LIMIT one does not.
    expect(previewSignature(preview({ limitPrice: 99 }))).toBe(inputSignature(typed));
    expect(inputSignature({ ...typed, type: 'LIMIT', limitPrice: 99 })).toBe(
      previewSignature(preview({ type: 'LIMIT', limitPrice: 99 })),
    );
    expect(inputSignature(null)).toBe('');
  });
});

describe('commitLabel', () => {
  const base = {
    side: 'BUY' as const,
    lots: 2,
    pending: false,
    outcome: null,
    cashDelta: null,
    reservedAmount: 0,
  };

  it('states the whole action', () => {
    expect(commitLabel({ ...base, outcome: 'fill', cashDelta: -18045.2 })).toBe(
      'Buy 2 lots · ₹18,045.20',
    );
    expect(
      commitLabel({ ...base, side: 'SELL', lots: 1, outcome: 'fill', cashDelta: 9112.4 }),
    ).toBe('Sell 1 lot · receive ₹9,112.40');
    expect(commitLabel({ ...base, outcome: 'rest', reservedAmount: 7600 })).toBe(
      'Place limit buy · 2 lots · holds ₹7,600.00',
    );
    expect(commitLabel({ ...base, outcome: 'after-hours' })).toBe(
      'Place after-market buy · 2 lots',
    );
  });

  it('falls back to the ticket’s own figure only without a preview', () => {
    expect(commitLabel({ ...base, estimate: 18000 })).toBe('Buy 2 lots · ₹18,000.00');
    expect(commitLabel({ ...base, outcome: 'rejected', estimate: 18000 })).toBe('Buy 2 lots');
    expect(commitLabel({ ...base, pending: true })).toBe('Placing…');
    expect(commitLabel({ ...base, lots: null })).toBe('Enter lots');
  });
});

describe('the estimate', () => {
  it('says what placing would do', () => {
    expect(outcomeWords(preview()).tone).toBe('success');
    expect(outcomeWords(preview({ outcome: 'rest', limitPrice: 99 })).text).toContain('₹99.00');
    expect(outcomeWords(preview({ outcome: 'after-hours' })).text).toContain('09:15');
    expect(
      outcomeWords(preview({ outcome: 'rejected', blockedReason: 'Not enough F&O cash' })),
    ).toEqual({ text: 'Not enough F&O cash', tone: 'danger' });
    expect(outcomeWords(preview({ outcome: 'invalid', blockedReason: null })).tone).toBe('warning');
  });

  it('values an after-market market order at the last price, approximately', () => {
    expect(estimateValue(preview())).toEqual({ atPrice: 120, value: 18000, approximate: false });
    expect(
      estimateValue(
        preview({ outcome: 'after-hours', basisPrice: 132, orderValue: 19800, quantity: 150 }),
      ),
    ).toEqual({ atPrice: 120, value: 18000, approximate: true });
    expect(
      estimateValue(preview({ outcome: 'after-hours', type: 'MARKET', price: null })).value,
    ).toBeNull();
  });

  it('never prints an unlimited loss as a number', () => {
    expect(maxLossLabel(preview(), 'BUY')).toBe('₹18,045.20');
    const written = preview({ maxLoss: null, side: 'SELL' });
    expect(maxLossLabel(written, 'SELL')).toBe('Unlimited');
    expect(
      maxLossLabel(
        {
          ...written,
          contract: { ...written.contract, kind: 'PE', strike: 25000 },
          basisPrice: 100,
        },
        'SELL',
      ),
    ).toBe('₹37,35,000.00 if it goes to zero');
    expect(maxLossLabel({ ...written, openingLots: 0 }, 'SELL')).toBeNull();
    expect(
      maxLossLabel(
        { ...written, contract: { ...written.contract, kind: 'FUT', strike: null } },
        'BUY',
      ),
    ).toBe('Unlimited');
  });
});

describe('prices and orders', () => {
  const now = Date.parse('2026-10-05T05:00:30.000Z');

  it('names a price source in words', () => {
    expect(priceSourceWord('stream')).toBe('live stream');
    expect(priceSourceWord('settlement')).toBe('expiry close');
    expect(priceSourceWord('mystery')).toBe('mystery');
    expect(priceSourceWord(null)).toBe('—');
  });

  it('ages a timestamp', () => {
    expect(ageWords('2026-10-05T05:00:29.500Z', now)).toBe('just now');
    expect(ageWords('2026-10-05T05:00:18.000Z', now)).toBe('12s ago');
    expect(ageWords('2026-10-05T04:57:30.000Z', now)).toBe('3 min ago');
    expect(ageWords('2026-10-05T01:00:00.000Z', now)).toBe('earlier');
    expect(ageWords(null, now)).toBe('');
    expect(ageWords('not a date', now)).toBe('');
  });

  it('says where a position’s price came from', () => {
    const p = { ltp: 120, ltpSource: 'groww' as const, ltpAsOf: '2026-10-05T05:00:18.000Z' };
    expect(ltpProvenance(p, true, now)).toBe('live');
    expect(ltpProvenance(p, false, now)).toBe('Groww · 12s ago');
    expect(ltpProvenance({ ...p, ltp: null }, false, now)).toBe('no price');
    expect(ltpProvenance({ ...p, ltpSource: null }, false, now)).toBe('last price');
  });

  it('reads a resting after-market order and a settlement row as such', () => {
    expect(orderStatusView({ status: 'PENDING', afterHours: true, settlement: false })).toEqual({
      label: 'After-market',
      tone: 'primary',
    });
    expect(orderStatusView({ status: 'PENDING', afterHours: false, settlement: false }).label).toBe(
      'Open',
    );
    expect(orderStatusView({ status: 'FILLED', afterHours: false, settlement: true }).label).toBe(
      'Settled',
    );
    expect(orderStatusView({ status: 'REJECTED', afterHours: false, settlement: false }).tone).toBe(
      'danger',
    );
  });

  it('writes the receipt from the order itself', () => {
    const base = {
      status: 'FILLED' as const,
      afterHours: false,
      settlement: false,
      quantity: 150,
      price: 120,
      priceSource: 'stream',
      cashDelta: -18045.2,
      realisedPnl: null,
      limitPrice: null,
      reservedAmount: 0,
      note: null,
    };
    expect(receiptWords(base).detail).toBe('150 qty at ₹120.00 · live stream · cash −₹18,045.20');
    expect(
      receiptWords({ ...base, status: 'PENDING', afterHours: true, reservedAmount: 19800 }),
    ).toEqual({
      title: 'After-market order placed — fills when the market opens',
      detail: '₹19,800.00 held until it fills.',
    });
    expect(receiptWords({ ...base, status: 'REJECTED', note: null }).detail).toBe(
      'The server gave no reason.',
    );
  });
});

describe('the session', () => {
  it('follows the server’s rule, 09:15–15:30 IST inclusive on weekdays', () => {
    expect(sessionOpenAt(ist('2026-10-05T09:15:00'))).toBe(true);
    expect(sessionOpenAt(ist('2026-10-05T15:30:00'))).toBe(true);
    expect(sessionOpenAt(ist('2026-10-05T15:31:00'))).toBe(false);
    expect(sessionOpenAt(ist('2026-10-04T11:00:00'))).toBe(false);
  });

  it('says when it next opens', () => {
    expect(nextOpenWords(ist('2026-10-05T08:00:00'))).toBe('today 09:15');
    expect(nextOpenWords(ist('2026-10-05T16:00:00'))).toBe('tomorrow 09:15');
    expect(nextOpenWords(ist('2026-10-09T16:00:00'))).toBe('Mon 09:15');
    expect(nextOpenWords(ist('2026-10-10T10:00:00'))).toBe('Mon 09:15');
  });

  it('prefers the server’s word over the clock', () => {
    const sunday = ist('2026-10-04T11:00:00');
    expect(marketStateWords(true, sunday)).toEqual({
      open: true,
      text: 'Market open · till 15:30 IST',
    });
    expect(marketStateWords(null, sunday)).toEqual({
      open: false,
      text: 'Market closed · opens tomorrow 09:15 IST',
    });
  });
});

describe('fnoAccountView', () => {
  const totals = {
    marginBlocked: 40000,
    unrealisedPnl: 900,
    realisedPnl: 2000,
    totalCharges: 150,
    netDelta: null,
    netGamma: null,
    netTheta: null,
    netVega: null,
  };
  const funds = {
    startingCapital: 500000,
    cash: 450000,
    reserved: 7600,
    available: 442400,
    pendingOrders: 1,
  };

  it('reads the book’s funds and marks the open P&L live', () => {
    const view = fnoAccountView({ positions: [{} as never], totals, funds }, undefined, {
      unrealised: 1200,
      unpriced: 1,
    });
    expect(view).toMatchObject({
      available: 442400,
      cash: 450000,
      reserved: 7600,
      pendingOrders: 1,
      startingCapital: 500000,
      unrealised: 1200,
      unpriced: 1,
      totalPnl: 3050,
    });
  });

  it('falls back to the wallet on an older server, and says nothing it does not know', () => {
    const view = fnoAccountView(
      { positions: [], totals, funds: null },
      { capital: 300000, cash: 290000, availableCash: 280000, blockedCash: 10000 },
      null,
    );
    expect(view).toMatchObject({
      available: 280000,
      cash: 290000,
      reserved: 10000,
      pendingOrders: null,
      startingCapital: 300000,
      unrealised: 0,
      totalPnl: 1850,
    });
    expect(fnoAccountView(undefined, undefined, null)).toMatchObject({
      available: null,
      unrealised: null,
      totalPnl: null,
    });
  });
});

describe('F&O search', () => {
  const universe = [
    underlying('BANKNIFTY', { isIndex: true }),
    underlying('NIFTY', { isIndex: true }),
    underlying('NIFTYIT'),
    underlying('RELIANCE', { name: 'Reliance Industries' }),
  ];

  it('puts prefix matches first, indices first, then the server’s contracts', () => {
    const hits = fnoSearchHits(universe, [contract()], 'nifty');
    expect(
      hits.map((h) => (h.type === 'underlying' ? h.underlying.underlying : 'contract')),
    ).toEqual(['NIFTY', 'NIFTYIT', 'BANKNIFTY', 'contract']);
    expect(fnoSearchHits(universe, undefined, 'industries')).toHaveLength(1);
    expect(fnoSearchHits(universe, [contract()], '  ')).toEqual([]);
    expect(
      fnoSearchHits(universe, [contract(), contract()], 'nifty', { underlyings: 1, contracts: 1 }),
    ).toHaveLength(2);
  });

  it('ranks like the server: spoken index names and "index" find what a person means', () => {
    const names = (q: string) =>
      fnoSearchHits(universe, undefined, q).map((h) =>
        h.type === 'underlying' ? h.underlying.underlying : 'contract',
      );
    expect(names('bank nifty')).toEqual(['BANKNIFTY']);
    expect(names('banknifty')).toEqual(['BANKNIFTY']);
    expect(names('index')).toEqual(['BANKNIFTY', 'NIFTY']);
  });

  it('describes a row', () => {
    expect(fnoHitView({ type: 'contract', contract: contract() })).toEqual({
      key: 'c:NFO:NIFTY26O2725000CE',
      title: 'NIFTY 25,000 CE',
      sub: '27 Oct expiry · NIFTY26O2725000CE',
      tag: 'CE',
      lot: 75,
    });
    expect(
      fnoHitView({
        type: 'underlying',
        underlying: underlying('SENSEX', { exchange: 'BFO', isIndex: true }),
      }),
    ).toMatchObject({ title: 'SENSEX', sub: 'Index · BSE · option chain', tag: 'F&O' });
    expect(expiryWords('2026-10-27')).toBe('27 Oct');
    expect(expiryWords('soon')).toBe('soon');
  });
});
