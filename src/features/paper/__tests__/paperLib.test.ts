import { dayMove, markRows, paiseSumOrNull, paperKpis, rowMark } from '@/features/paper/lib/book';
import { walletDraft } from '@/features/paper/lib/wallet';
import type {
  PaperPortfolio,
  PaperPosition,
  ProductSummary,
  WalletSummary,
} from '@/features/paper/types';

// 2026-10-01 11:00 IST.
const NOW = Date.parse('2026-10-01T05:30:00.000Z');
const TODAY = '2026-10-01';

function position(overrides: Partial<PaperPosition>): PaperPosition {
  return {
    segment: 'equity',
    product: 'CNC',
    exchange: 'NSE',
    symbol: 'TCS',
    companyName: null,
    quantity: 10,
    avgPrice: 100,
    ltp: 110,
    prevClose: 105,
    unrealisedPnl: 100,
    unrealisedPct: 10,
    currentValue: 1100,
    investedValue: 1000,
    openedAt: '2026-09-20T05:00:00.000Z',
    ...overrides,
  };
}

function book(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    segment: 'equity',
    label: 'Delivery',
    product: 'CNC',
    leverage: 1,
    positionCount: 1,
    openOrderCount: 0,
    investedValue: 1000,
    ownFunds: 1000,
    borrowed: 0,
    currentValue: 1100,
    unrealisedPnl: 100,
    realisedPnl: 50,
    realisedNetPnl: 40,
    todayRealisedPnl: 0,
    charges: 20,
    openBuyCharges: 5,
    netPnl: 130,
    blockedCash: 0,
    tradeCount: 3,
    closedTradeCount: 1,
    ...overrides,
  };
}

const wallet: WalletSummary = {
  capital: 100_000,
  cash: 98_000,
  blockedCash: 0,
  availableCash: 98_000,
  holdingsValue: 1100,
  borrowed: 0,
  value: 99_100,
  realisedPnl: 50,
  unrealisedPnl: 100,
  charges: 20,
  netPnl: 130,
  netPnlPct: 0.13,
  intradayBuyingPower: 490_000,
  marginShortfall: 0,
  resetAt: null,
  mergedAt: null,
};

function portfolio(
  positions: PaperPosition[],
  bookOverrides: Partial<ProductSummary> = {},
): PaperPortfolio {
  const b = book(bookOverrides);
  return {
    segment: b.segment,
    product: b.product,
    segmentLabel: b.label,
    leverage: b.leverage,
    wallet,
    book: b,
    positions,
    openOrders: [],
    startingCapital: wallet.capital,
    cash: wallet.cash,
    availableCash: wallet.availableCash,
    equity: wallet.value,
    totalPnl: wallet.netPnl,
    totalPnlPct: 0.13,
    investedValue: b.investedValue,
    currentValue: b.currentValue,
    borrowed: b.borrowed,
    realisedPnl: b.realisedPnl,
    unrealisedPnl: b.unrealisedPnl,
    totalCharges: b.charges,
    tradeCount: b.tradeCount,
    closedTradeCount: b.closedTradeCount,
    marketOpen: true,
    intradayEntryBlockedReason: null,
    minutesToSquareOff: null,
    marginShortfall: 0,
    pricesAsOf: null,
    resetAt: null,
  };
}

describe('rowMark', () => {
  it('marks at the trade price, so an unmoved buy is exactly zero', () => {
    expect(rowMark(position({ ltp: 100 })).pnl).toBe(0);
  });

  it('prefers a fresher quote and falls back to the row’s own previous close', () => {
    const mark = rowMark(position({}), {
      exchange: 'NSE',
      symbol: 'TCS',
      ltp: 120,
      prevClose: null,
    });
    expect(mark.ltp).toBe(120);
    expect(mark.prevClose).toBe(105);
    expect(mark.pnl).toBe(200);
  });
});

describe('dayMove', () => {
  it('measures carried shares from the previous close', () => {
    const rows = markRows([position({})], undefined);
    expect(dayMove(rows, TODAY)).toEqual({ move: 50, base: 1050 });
  });

  it('measures shares bought today from the price paid, not yesterday’s close', () => {
    const rows = markRows(
      [position({ quantity: 10, todayBoughtQty: 4, todayBuyValue: 432 })],
      undefined,
    );
    // 6 carried: (110 − 105) × 6 = 30; 4 bought today at 108: 110 × 4 − 432 = 8.
    expect(dayMove(rows, TODAY)).toEqual({ move: 38, base: 6 * 105 + 432 });
  });

  it('treats a row opened today as all today’s on an older server', () => {
    const rows = markRows(
      [position({ openedAt: '2026-10-01T04:00:00.000Z', ltp: 100 })],
      undefined,
    );
    expect(dayMove(rows, TODAY)).toEqual({ move: 0, base: 1000 });
  });

  it('refuses a partial answer', () => {
    const rows = markRows([position({}), position({ symbol: 'INFY', prevClose: null })], undefined);
    expect(dayMove(rows, TODAY)).toBeNull();
  });
});

describe('paiseSumOrNull', () => {
  it('sums in paise and refuses a missing value', () => {
    expect(paiseSumOrNull([0.1, 0.2])).toBe(0.3);
    expect(paiseSumOrNull([1, null])).toBeNull();
    expect(paiseSumOrNull([])).toBe(0);
  });
});

describe('paperKpis', () => {
  const delivery = portfolio([position({})]);
  const intraday = portfolio([], {
    segment: 'intraday',
    label: 'Intraday',
    product: 'MIS',
    leverage: 5,
    positionCount: 0,
    investedValue: 0,
    ownFunds: 0,
    currentValue: 0,
    unrealisedPnl: 0,
    realisedPnl: -30,
    todayRealisedPnl: -30,
    charges: 10,
    openBuyCharges: 0,
  });

  it('reads delivery only on Holdings', () => {
    const k = paperKpis('equity', { delivery, intraday, wallet, quotes: undefined, now: NOW });
    expect(k.headline).toBe(1100);
    expect(k.today).toBe(50);
    expect(k.total).toBe(100);
    expect(k.totalPct).toBe(10);
    // realised 50 + unrealised 100 − charges 20.
    expect(k.net).toBe(130);
    expect(k.available).toBe(98_000);
  });

  it('reads intraday only on Positions', () => {
    const k = paperKpis('intraday', { delivery, intraday, wallet, quotes: undefined, now: NOW });
    expect(k.headline).toBe(0);
    expect(k.today).toBe(-30);
    expect(k.total).toBe(-30);
    expect(k.net).toBe(-40);
  });

  it('reads the whole wallet everywhere else', () => {
    const k = paperKpis('account', { delivery, intraday, wallet, quotes: undefined, now: NOW });
    // cash 98,000 + holdings 1,100 − borrowed 0.
    expect(k.headline).toBe(99_100);
    expect(k.today).toBe(20);
    // delivery 50 + 100, intraday −30 + 0.
    expect(k.total).toBe(120);
    expect(k.net).toBe(90);
    expect(k.charges).toBe(20);
  });

  it('falls back to the wallet’s own figures until both books have loaded', () => {
    const k = paperKpis('account', { wallet, quotes: undefined, now: NOW });
    expect(k.headline).toBe(99_100);
    expect(k.total).toBe(150);
    expect(k.net).toBe(130);
    expect(k.today).toBeNull();
  });
});

describe('walletDraft', () => {
  const limits = {
    capital: 1_000_000,
    cash: 400_000,
    minCapital: 600_000,
    maxCapital: 100_000_000,
  };

  it('describes a deposit and a withdrawal in words', () => {
    expect(walletDraft(limits, '12,00,000')).toMatchObject({ delta: 200_000, canSave: true });
    expect(walletDraft(limits, '800000').message).toMatch(/Withdraws/);
  });

  it('refuses a withdrawal of money that is invested', () => {
    const draft = walletDraft(limits, '500000');
    expect(draft.tooLow).toBe(true);
    expect(draft.canSave).toBe(false);
  });

  it('does nothing for an unchanged or empty amount', () => {
    expect(walletDraft(limits, '1000000').canSave).toBe(false);
    expect(walletDraft(limits, '').amount).toBeNull();
  });
});
