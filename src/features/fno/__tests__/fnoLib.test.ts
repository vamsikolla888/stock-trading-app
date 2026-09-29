import { ApiError } from '@/types/api';

import { accessProblemFromError, isUnlistedExpiryError } from '../lib/access';
import { receiptNotes } from '../lib/chain';
import {
  calendarEntryHref,
  chainHref,
  isExploreSection,
  paramString,
  parseChainParams,
} from '../lib/explore';
import { lotsLabel } from '../lib/format';
import {
  checkContractOrder,
  isOnTick,
  maxLotsPerOrder,
  requestLimitIssues,
} from '../lib/orderRules';
import type { LiveOrder } from '../types';

describe('lotsLabel', () => {
  it('reads whole lots as the web does', () => {
    expect(lotsLabel(1)).toBe('1 lot');
    expect(lotsLabel(3)).toBe('3 lots');
    expect(lotsLabel(-1)).toBe('-1 lot');
  });

  it('rounds a lot count Groww reports as a fraction (revised lot size)', () => {
    expect(lotsLabel(50 / 75)).toBe('0.67 lots');
    expect(lotsLabel(1.5)).toBe('1.5 lots');
  });

  it('never prints NaN', () => {
    expect(lotsLabel(Number.NaN)).toBe('—');
  });
});

describe('route params', () => {
  it('takes the first value of a repeated key and trims it', () => {
    expect(paramString(['NIFTY', 'BANKNIFTY'])).toBe('NIFTY');
    expect(paramString('  RELIANCE ')).toBe('RELIANCE');
    expect(paramString('')).toBeNull();
    expect(paramString(undefined)).toBeNull();
  });

  it('normalises the option chain params the way the server reads them', () => {
    expect(parseChainParams({})).toEqual({
      exchange: 'NFO',
      underlying: 'NIFTY',
      expiry: null,
      tab: 'options',
    });
    expect(
      parseChainParams({
        exchange: 'bfo',
        underlying: ['sensex'],
        expiry: '2026-10-06',
        tab: 'futures',
      }),
    ).toEqual({ exchange: 'BFO', underlying: 'SENSEX', expiry: '2026-10-06', tab: 'futures' });
  });

  it('drops an expiry the server would refuse as malformed', () => {
    expect(parseChainParams({ expiry: '06-10-2026' }).expiry).toBeNull();
    expect(parseChainParams({ expiry: 'undefined' }).expiry).toBeNull();
  });

  it('accepts only real explore sections, not prototype keys', () => {
    expect(isExploreSection('commodity-futures')).toBe(true);
    expect(isExploreSection('toString')).toBe(false);
    expect(isExploreSection('constructor')).toBe(false);
    expect(isExploreSection(undefined)).toBe(false);
  });
});

describe('calendarEntryHref', () => {
  it('opens the chain at the date when options expire then', () => {
    expect(calendarEntryHref('NFO', 'NIFTY', '2026-10-06', true)).toEqual(
      chainHref('NFO', 'NIFTY', { expiry: '2026-10-06' }),
    );
  });

  it('opens the futures tab for a futures-only date (the chain would 422 on it)', () => {
    const href = calendarEntryHref('BFO', 'SENSEX', '2026-10-27', false);
    expect(href.params).toEqual({ exchange: 'BFO', underlying: 'SENSEX', tab: 'futures' });
  });
});

describe('error classification', () => {
  const unlisted = new ApiError({
    status: 422,
    code: 'VALIDATION',
    message: '2026-09-22 is not a listed option expiry for NIFTY (NFO)',
    fieldErrors: { expiry: '2026-09-22 is not a listed option expiry for NIFTY (NFO)' },
  });

  it('recognises the chain refusing its expiry', () => {
    expect(isUnlistedExpiryError(unlisted)).toBe(true);
    expect(
      isUnlistedExpiryError(
        new ApiError({ status: 422, code: 'VALIDATION', message: 'x', fieldErrors: { lots: 'x' } }),
      ),
    ).toBe(false);
    expect(isUnlistedExpiryError(new Error('boom'))).toBe(false);
  });

  it('maps account-route errors to the Groww connection state', () => {
    expect(
      accessProblemFromError(
        new ApiError({ status: 409, code: 'BROKER_SESSION_EXPIRED', message: 'expired' }),
      ),
    ).toBe('session-expired');
    expect(
      accessProblemFromError(new ApiError({ status: 404, code: 'NOT_FOUND', message: 'none' })),
    ).toBe('not-connected');
    expect(accessProblemFromError(unlisted)).toBeNull();
  });
});

describe('receiptNotes', () => {
  const base: Pick<
    LiveOrder,
    | 'status'
    | 'riskDecision'
    | 'rejectionReason'
    | 'filledQuantity'
    | 'averageFillPrice'
    | 'brokerOrderId'
  > = {
    status: 'RISK_REJECTED',
    riskDecision: {
      approved: false,
      // The server sets `reason` to the first failed check's detail.
      reason: 'Order value exceeds the per-order cap',
      checks: [
        { name: 'cap', passed: false, detail: 'Order value exceeds the per-order cap' },
        { name: 'hours', passed: true, detail: 'Market is open' },
        { name: 'loss', passed: false, detail: 'Daily loss limit reached' },
      ],
      decidedAt: '2026-09-28T04:00:00.000Z',
    },
    rejectionReason: 'Order value exceeds the per-order cap',
    filledQuantity: 0,
    averageFillPrice: null,
    brokerOrderId: null,
  };
  const fill = (q: number, p: number) => `${q} @ ${p}`;

  it('says each risk refusal once', () => {
    expect(receiptNotes(base, fill)).toEqual([
      'Order value exceeds the per-order cap',
      'Daily loss limit reached',
    ]);
  });

  it('keeps the do-not-resubmit warning for an unconfirmed order', () => {
    const notes = receiptNotes(
      {
        ...base,
        status: 'UNKNOWN',
        riskDecision: null,
        rejectionReason: null,
        brokerOrderId: 'G1',
      },
      fill,
    );
    expect(notes[0]).toMatch(/Do not place this order again/);
    expect(notes).toContain('Groww order G1');
  });

  it('reports a fill', () => {
    expect(
      receiptNotes(
        {
          ...base,
          status: 'FILLED',
          riskDecision: null,
          rejectionReason: null,
          filledQuantity: 75,
          averageFillPrice: 101.5,
        },
        fill,
      ),
    ).toEqual(['75 @ 101.5']);
  });
});

describe('order rules (mirror of server fno-order-rules.ts)', () => {
  const contract = {
    kind: 'CE' as const,
    expiry: '2026-10-06',
    lotSize: 75,
    tickSize: 0.05,
    freezeQuantity: 1801,
    buyAllowed: true,
    sellAllowed: true,
  };
  const order = {
    contract,
    side: 'BUY' as const,
    orderType: 'LIMIT' as const,
    lots: 1,
    price: 101.15,
    triggerPrice: null,
    today: '2026-09-28',
  };

  it('accepts a valid limit order', () => {
    expect(checkContractOrder(order)).toEqual([]);
  });

  it('checks the tick grid in paise', () => {
    expect(isOnTick(101.15, 0.05)).toBe(true);
    expect(isOnTick(101.13, 0.05)).toBe(false);
    expect(checkContractOrder({ ...order, price: 101.13 })[0]?.field).toBe('price');
  });

  it('caps lots below the freeze quantity', () => {
    expect(maxLotsPerOrder(contract)).toBe(24);
    expect(checkContractOrder({ ...order, lots: 25 })[0]?.field).toBe('quantity');
  });

  it('refuses a price on a market order and a missing trigger on a stop', () => {
    expect(checkContractOrder({ ...order, orderType: 'MARKET' })[0]?.field).toBe('price');
    expect(
      checkContractOrder({ ...order, orderType: 'SL-M', price: null }).map((i) => i.field),
    ).toEqual(['triggerPrice']);
  });

  it('stops a lot count the request schema refuses (1–10,000) before review', () => {
    expect(requestLimitIssues(10_000)).toEqual([]);
    expect(requestLimitIssues(10_001)[0]?.field).toBe('quantity');
    // No freeze limit published: the contract rules alone would let this through.
    expect(
      checkContractOrder({
        ...order,
        lots: 20_000,
        contract: { ...contract, freezeQuantity: null },
      }),
    ).toEqual([]);
  });

  it('refuses an expired contract and an unparseable price', () => {
    expect(checkContractOrder({ ...order, today: '2026-10-07' })[0]?.field).toBe('expiry');
    expect(checkContractOrder({ ...order, price: Number.NaN })[0]?.message).toBe(
      'Enter a limit price',
    );
  });
});
