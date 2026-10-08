import type { PaperOrderPreview } from '@/features/paper/types';
import {
  detailsSummary,
  liveAmountCard,
  liveBalanceCard,
  liveChargeLines,
  missingWord,
  openOrderMessage,
  ordersSummary,
  orderTypeHelp,
  paperAmountCard,
  paperBalanceCard,
  paperChargeLines,
  paperDetailRows,
  todaysLiveOrders,
  todaysPaperOrders,
  usablePaperPreview,
} from '@/features/trading/lib/ticketView';
import type { LiveOrder, PaperOrder } from '@/features/trading/types';
import { ApiError } from '@/types/api';

const breakdown = {
  brokerage: 0,
  stt: 29.5,
  exchangeTxn: 0.87,
  sebiFee: 0.03,
  gst: 0.16,
  stampDuty: 4.43,
  dpCharges: 0,
  total: 34.99,
};

function preview(overrides: Partial<PaperOrderPreview> = {}): PaperOrderPreview {
  return {
    segment: 'equity',
    product: 'CNC',
    referencePrice: 2950,
    wouldRest: false,
    triggered: false,
    grossValue: 29500,
    charges: 34.99,
    chargesBreakdown: breakdown,
    borrowed: 0,
    marginRequired: 29534.99,
    cashDelta: 29534.99,
    cashBefore: 100000,
    cashAfter: 70465.01,
    availableCash: 100000,
    blockedCash: 0,
    leverage: 1,
    buyingPower: 100000,
    heldQuantity: 0,
    sellableQuantity: 0,
    maxQuantity: 33,
    grossPnl: null,
    realisedPnl: null,
    exitCharges: { ...breakdown, stampDuty: 0, dpCharges: 15.93, total: 46.49 },
    roundTripCharges: 81.48,
    breakEvenPrice: 2958.15,
    blockedReason: null,
    notices: [],
    ...overrides,
  };
}

describe('usablePaperPreview', () => {
  it('keeps a preview whose money is numeric', () => {
    const p = preview();
    expect(usablePaperPreview(p)).toBe(p);
    // An older server without cashDelta still counts.
    expect(usablePaperPreview(preview({ cashDelta: undefined }))).not.toBeNull();
  });

  it('treats non-numeric money as no preview at all', () => {
    expect(usablePaperPreview(null)).toBeNull();
    expect(usablePaperPreview(preview({ grossValue: Number.NaN }))).toBeNull();
    expect(usablePaperPreview(preview({ charges: 'x' as unknown as number }))).toBeNull();
    expect(usablePaperPreview(preview({ cashDelta: Number.POSITIVE_INFINITY }))).toBeNull();
  });
});

describe('missingWord', () => {
  it('names what the form still needs, quantity first', () => {
    expect(missingWord({})).toBeNull();
    expect(missingWord({ quantity: 'Enter at least 1 share', limitPrice: 'Enter a price' })).toBe(
      'Enter a quantity',
    );
    expect(missingWord({ limitPrice: 'Enter a price' })).toBe('Enter a price');
    expect(missingWord({ limitPrice: 'For a buy stop-loss, price must be…' })).toBe(
      'Check the price',
    );
    expect(missingWord({ triggerPrice: 'Enter a trigger price' })).toBe('Enter a trigger');
  });
});

describe('paperAmountCard', () => {
  const base = { side: 'BUY' as const, quantity: 10, missing: null, pending: false, failed: false };

  it('shows the server’s cash out, labelled by what it is', () => {
    expect(paperAmountCard({ ...base, preview: preview() })).toEqual({
      label: 'Amount required',
      value: '₹29,534.99',
      meta: '10 × ₹2,950.00',
    });
    const mis = paperAmountCard({
      ...base,
      preview: preview({ borrowed: 23600, cashDelta: 5934.99 }),
    });
    expect(mis.label).toBe('Margin required');
    expect(mis.value).toBe('₹5,934.99');
    const sell = paperAmountCard({ ...base, side: 'SELL', preview: preview({ cashDelta: 29465 }) });
    expect(sell.label).toBe('Amount receivable');
    expect(sell.value).toBe('₹29,465.00');
  });

  it('never prices an incomplete or refused order', () => {
    expect(
      paperAmountCard({ ...base, missing: 'Enter a price', preview: preview() }),
    ).toMatchObject({ value: '—', meta: 'Enter a price' });
    // A refused order comes back with zeros — not its price.
    expect(
      paperAmountCard({
        ...base,
        preview: preview({ referencePrice: 0, blockedReason: 'Closed' }),
      }),
    ).toMatchObject({ value: '—', meta: '10 shares' });
  });

  it('says pricing while waiting and unavailable when it failed', () => {
    expect(paperAmountCard({ ...base, pending: true, preview: null }).value).toBe('Pricing…');
    expect(paperAmountCard({ ...base, failed: true, preview: null })).toMatchObject({
      value: '—',
      meta: 'Price unavailable',
    });
    expect(paperAmountCard({ ...base, quantity: 1, preview: null }).meta).toBe('1 share');
  });
});

describe('paperBalanceCard', () => {
  const base = { available: 50000, leverage: 1, held: null, price: 2950 };

  it('buys: the server’s exact maximum once priced, an estimate before', () => {
    expect(paperBalanceCard({ ...base, side: 'BUY', preview: preview() })).toMatchObject({
      value: '₹1,00,000.00',
      meta: 'Up to 33 shares',
      max: 33,
    });
    expect(paperBalanceCard({ ...base, side: 'BUY', preview: null })).toMatchObject({
      value: '₹50,000.00',
      meta: 'About 16 shares',
      max: null,
    });
    // Intraday buying power is the wallet × the MIS leverage.
    expect(paperBalanceCard({ ...base, leverage: 5, side: 'BUY', preview: null }).meta).toBe(
      'About 84 shares',
    );
    expect(paperBalanceCard({ ...base, price: null, side: 'BUY', preview: null }).meta).toBe(
      'Paper wallet',
    );
    expect(
      paperBalanceCard({ ...base, side: 'BUY', preview: preview({ maxQuantity: 0 }) }).max,
    ).toBeNull();
  });

  it('sells: the holding, and a Max no larger than what is sellable', () => {
    expect(
      paperBalanceCard({
        ...base,
        side: 'SELL',
        preview: preview({ heldQuantity: 12, maxQuantity: 8 }),
      }),
    ).toMatchObject({ meta: '12 shares held', max: 8 });
    expect(paperBalanceCard({ ...base, held: 5, side: 'SELL', preview: null })).toMatchObject({
      meta: '5 shares held',
      max: 5,
    });
    expect(paperBalanceCard({ ...base, side: 'SELL', preview: null })).toMatchObject({
      meta: '0 shares held',
      max: null,
    });
  });

  it('shows a dash, never zero, when the wallet is unknown', () => {
    expect(paperBalanceCard({ ...base, available: null, side: 'BUY', preview: null }).value).toBe(
      '—',
    );
  });
});

describe('liveAmountCard', () => {
  it('is quantity × the reference price, labelled an estimate', () => {
    expect(liveAmountCard({ side: 'BUY', quantity: 4, price: 1500, missing: null })).toEqual({
      label: 'Estimated amount',
      value: '₹6,000.00',
      meta: '4 × ₹1,500.00',
    });
    expect(liveAmountCard({ side: 'SELL', quantity: 4, price: null, missing: null })).toEqual({
      label: 'Estimated proceeds',
      value: '—',
      meta: '4 × market price',
    });
    expect(
      liveAmountCard({ side: 'BUY', quantity: 4, price: 1500, missing: 'Enter a price' }),
    ).toMatchObject({ value: '—', meta: 'Enter a price' });
  });
});

describe('liveBalanceCard', () => {
  const base = {
    side: 'BUY' as const,
    product: 'delivery' as const,
    brokerLabel: 'mStock',
    available: 10000,
    loading: false,
    error: null,
    held: null,
    price: 1500,
  };

  it('buys: an about-figure before charges, with Max', () => {
    expect(liveBalanceCard(base)).toEqual({
      label: 'Available balance',
      value: '₹10,000.00',
      meta: 'About 6 shares',
      max: 6,
      problem: null,
    });
    expect(liveBalanceCard({ ...base, price: null })).toMatchObject({
      meta: 'mStock · CNC',
      max: null,
    });
    expect(liveBalanceCard({ ...base, product: 'intraday', price: null }).meta).toBe(
      'mStock · MIS',
    );
  });

  it('sells: the demat holding for delivery, nothing to check for intraday', () => {
    expect(liveBalanceCard({ ...base, side: 'SELL', held: 7 })).toMatchObject({
      meta: '7 shares held',
      max: 7,
    });
    expect(liveBalanceCard({ ...base, side: 'SELL', held: 0 })).toMatchObject({
      meta: 'No shares held',
      max: null,
    });
    expect(liveBalanceCard({ ...base, side: 'SELL', held: null }).meta).toBe(
      'Holdings unavailable',
    );
    expect(liveBalanceCard({ ...base, side: 'SELL', product: 'intraday' })).toMatchObject({
      meta: 'mStock · MIS',
      max: null,
    });
  });

  it('names a session or connection problem, with the way to fix it — never ₹0', () => {
    const expired = new ApiError({
      status: 401,
      code: 'BROKER_SESSION_EXPIRED',
      message: 'Session expired',
    });
    expect(liveBalanceCard({ ...base, available: null, error: expired })).toMatchObject({
      value: '—',
      meta: 'Session expired',
      problem: { fix: 'Reconnect' },
    });
    const missing = new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Not connected' });
    expect(liveBalanceCard({ ...base, available: null, error: missing })).toMatchObject({
      meta: 'Not connected',
      problem: { fix: 'Connect' },
    });
    expect(liveBalanceCard({ ...base, available: null, error: new Error('boom') }).meta).toBe(
      'Balance unavailable',
    );
    expect(liveBalanceCard({ ...base, loading: true }).value).toBe('Loading…');
    expect(liveBalanceCard({ ...base, brokerLabel: null })).toMatchObject({
      meta: 'No live broker',
      problem: { fix: 'Connect' },
    });
  });
});

describe('details', () => {
  it('lists a buy’s figures in the web’s order', () => {
    expect(paperDetailRows(preview(), 'BUY').map((row) => [row.label, row.value])).toEqual([
      ['Order value', '₹29,500.00'],
      ['Buy charges', '₹34.99'],
      ['Balance after order', '₹70,465.01'],
      ['Estimated exit charges', '₹46.49'],
      ['Break-even price', '₹2,958.15'],
    ]);
  });

  it('adds borrowing on a leveraged order and the realised P&L on a sell', () => {
    const rows = paperDetailRows(
      preview({
        borrowed: 23600,
        leverage: 5,
        realisedPnl: -120.5,
        exitCharges: null,
        breakEvenPrice: null,
      }),
      'SELL',
    );
    expect(rows.map((row) => row.label)).toEqual([
      'Order value',
      'Sell charges',
      'Borrowed at 5×',
      'Balance after order',
      'Realised P&L',
    ]);
    expect(rows.find((row) => row.key === 'borrowed')?.value).toBe('−₹23,600.00');
    expect(rows.find((row) => row.key === 'realised')).toMatchObject({ trend: -120.5 });
  });

  it('explains a zero charge where the rule explains it', () => {
    const lines = paperChargeLines(breakdown, 'BUY', 'equity');
    expect(lines.find((line) => line.key === 'brokerage')?.note).toBe('₹0 on delivery');
    expect(lines.find((line) => line.key === 'stt')?.note).toBeNull();
    expect(paperChargeLines(null, 'BUY', 'equity')).toEqual([]);
  });

  it('itemises the live charges preview, skipping missing figures', () => {
    const lines = liveChargeLines({ ...breakdown, gst: Number.NaN });
    expect(lines.map((line) => line.key)).toEqual([
      'brokerage',
      'stt',
      'exchangeTxn',
      'sebiFee',
      'stampDuty',
    ]);
    expect(liveChargeLines(null)).toEqual([]);
  });

  it('summarises the disclosures', () => {
    expect(detailsSummary(34.99, false)).toBe('₹34.99');
    expect(detailsSummary(34.99, true)).toBe('Hide');
    expect(detailsSummary(null, false)).toBe('View');
    expect(ordersSummary(0, false)).toBe('None');
    expect(ordersSummary(2, false)).toBe('2 · View');
    expect(ordersSummary(2, true)).toBe('2 · Hide');
  });

  it('says what each order type does, honestly per mode', () => {
    expect(orderTypeHelp('MARKET', 'paper')).toBe('Fills now at the last price.');
    expect(orderTypeHelp('MARKET', 'live')).toBe('Fills now at the market price.');
    expect(orderTypeHelp('SL', 'live')).toBe('At the trigger, becomes a limit order.');
  });
});

describe("today's orders", () => {
  const paper = (overrides: Partial<PaperOrder>): PaperOrder => ({
    id: 'p1',
    segment: 'equity',
    exchange: 'NSE',
    symbol: 'TCS',
    companyName: null,
    side: 'BUY',
    type: 'MARKET',
    quantity: 3,
    limitPrice: null,
    triggerPrice: null,
    status: 'FILLED',
    filledPrice: 3100,
    filledAt: '2026-10-08T04:00:00.000Z',
    charges: 4,
    realisedPnl: null,
    note: null,
    createdAt: '2026-10-08T04:00:00.000Z',
    ...overrides,
  });

  it('keeps this stock’s orders placed today (IST), newest first', () => {
    const rows = todaysPaperOrders(
      [
        paper({ id: 'old', createdAt: '2026-10-07T09:00:00.000Z' }),
        paper({ id: 'other', symbol: 'INFY' }),
        paper({
          id: 'late',
          status: 'PENDING',
          type: 'LIMIT',
          limitPrice: 3000,
          filledPrice: null,
          filledAt: null,
          segment: 'intraday',
          createdAt: '2026-10-08T06:00:00.000Z',
        }),
        paper({ id: 'early' }),
        // 19:00 UTC on the 7th is 00:30 IST on the 8th.
        paper({ id: 'midnight', status: 'REJECTED', createdAt: '2026-10-07T19:00:00.000Z' }),
      ],
      { exchange: 'nse', symbol: 'tcs' },
      '2026-10-08',
    );
    expect(rows.map((row) => row.id)).toEqual(['late', 'early', 'midnight']);
    expect(rows[0]).toMatchObject({
      line: '3 qty · limit ₹3,000.00 · MIS',
      status: { label: 'Open', tone: 'warning' },
    });
    expect(rows[1]).toMatchObject({
      line: '3 qty · at ₹3,100.00 · CNC',
      status: { label: 'Executed', tone: 'success' },
    });
    expect(rows[2]?.status.tone).toBe('danger');
  });

  it('reads real orders the same way, every broker', () => {
    const live: LiveOrder = {
      id: 'l1',
      broker: 'groww',
      category: 'equity_delivery',
      product: 'CNC',
      exchange: 'NSE',
      tradingsymbol: 'TCS',
      side: 'SELL',
      orderType: 'LIMIT',
      quantity: 5,
      price: 3200,
      triggerPrice: null,
      status: 'ACKNOWLEDGED',
      riskDecision: null,
      brokerOrderId: '1',
      filledQuantity: 2,
      averageFillPrice: null,
      rejectionReason: null,
      createdAt: '2026-10-08T05:00:00.000Z',
      updatedAt: '2026-10-08T05:00:00.000Z',
    };
    const rows = todaysLiveOrders(
      [live, { ...live, id: 'l2', status: 'RISK_REJECTED', tradingsymbol: 'INFY' }],
      { exchange: 'NSE', symbol: 'TCS' },
      '2026-10-08',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      line: '2/5 · ₹3,200.00 · CNC',
      status: { label: 'Open', tone: 'warning' },
    });
    expect(todaysLiveOrders(undefined, { exchange: 'NSE', symbol: 'TCS' }, '2026-10-08')).toEqual(
      [],
    );
  });
});

describe('openOrderMessage', () => {
  it('points at the open order instead of letting a second one fail', () => {
    expect(openOrderMessage(null, 'TCS', 'mStock')).toBeNull();
    expect(
      openOrderMessage(
        { status: 'ACKNOWLEDGED', side: 'BUY', quantity: 5, price: 3000 },
        'TCS',
        'mStock',
      ),
    ).toBe(
      'TCS already has an open order at mStock (BUY 5 @ ₹3,000.00). Modify it from Your live orders.',
    );
    expect(
      openOrderMessage(
        { status: 'UNKNOWN', side: 'SELL', quantity: 2, price: null },
        'TCS',
        'Groww',
      ),
    ).toMatch(/still being confirmed with Groww/);
  });
});
