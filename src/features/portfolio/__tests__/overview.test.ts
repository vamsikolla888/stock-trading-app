import { brokerStateOf } from '@/features/portfolio/lib/overview';
import { fromLinkedHolding, fromLinkedPosition } from '@/features/portfolio/lib/portfolio';
import type { LinkedHoldingRow } from '@/features/portfolio/types';
import { ApiError } from '@/types/api';

function linkedRow(overrides: Partial<LinkedHoldingRow> = {}): LinkedHoldingRow {
  return {
    sym: 'TCS',
    exch: 'NSE',
    isin: 'INE467B01029',
    qty: 4,
    t1Qty: 0,
    avg: 3800,
    ltp: 3912.1,
    prevClose: 3928.2,
    invested: 15200,
    value: 15648.4,
    pnl: 448.4,
    pnlPct: 2.95,
    dayChange: -64.4,
    dayChangePct: -0.41,
    sector: 'IT',
    ...overrides,
  };
}

const notFound = new ApiError({ status: 404, code: 'NOT_FOUND', message: 'No connected broker' });

describe('brokerStateOf', () => {
  it('maps the server’s answers onto UI states', () => {
    expect(brokerStateOf(null, true, false)).toBe('connected');
    expect(brokerStateOf(null, false, true)).toBe('loading');
    expect(brokerStateOf(notFound, false, false)).toBe('not-connected');
    expect(
      brokerStateOf(
        new ApiError({ status: 409, code: 'BROKER_SESSION_EXPIRED', message: 'expired' }),
        false,
        false,
      ),
    ).toBe('session-expired');
    expect(
      brokerStateOf(
        new ApiError({ status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'down' }),
        false,
        false,
      ),
    ).toBe('error');
  });
});

describe('linked mappers', () => {
  it('keeps the row’s day change as-is', () => {
    expect(fromLinkedHolding(linkedRow({ dayChange: 120, qty: 3 })).dayChange).toBe(120);
  });

  it('maps products to kinds and values open positions at the last price', () => {
    const base = {
      sym: 'SBIN',
      exch: 'NSE',
      qty: 10,
      buyQty: 10,
      buyAvg: 800,
      sellQty: 0,
      sellAvg: 0,
      netAvg: 800,
      realised: 0,
      ltp: 810,
      unrealised: 100,
      pnl: 100,
    };
    expect(fromLinkedPosition({ ...base, product: 'mis' })).toMatchObject({
      kind: 'intraday',
      product: 'MIS',
      avg: 800,
      value: 8100,
    });
    expect(fromLinkedPosition({ ...base, product: 'CNC' }).kind).toBe('delivery');
    expect(fromLinkedPosition({ ...base, product: 'NRML', ltp: null }).value).toBe(8000);
  });
});
