import {
  brokerStateOf,
  combineBrokerStates,
  resolveOverview,
  type OverviewInputs,
} from '@/features/portfolio/lib/overview';
import { fromLinkedHolding, fromLinkedPosition } from '@/features/portfolio/lib/portfolio';
import type {
  LinkedHoldingRow,
  LinkedPortfolioSnapshot,
  ManualPortfolioSnapshot,
  PortfolioSnapshot,
} from '@/features/portfolio/types';
import { ApiError } from '@/types/api';

const flag = {
  action: 'HOLD' as const,
  rationale: '',
  conviction: null,
  hitRatePct: null,
  evidence: [],
  asOf: '',
};

function mstockBook(overrides: Partial<PortfolioSnapshot> = {}): PortfolioSnapshot {
  return {
    broker: 'mstock',
    holdings: [
      {
        sym: 'RELIANCE',
        exch: 'NSE',
        qty: 10,
        avg: 1200,
        ltp: 1285.6,
        invested: 12000,
        value: 12856,
        pnl: 856,
        pnlPct: 7.13,
        dayChange: 15.75,
        dayChangePct: 1.24,
        flag,
        sector: 'Energy',
      },
    ],
    totals: { invested: 12000, value: 12856, pnl: 856, pnlPct: 7.13 },
    availableCash: 0,
    asOf: '2026-09-25T10:00:00Z',
    stale: false,
    positionRows: [],
    funds: null,
    ...overrides,
  };
}

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

function linkedBook(overrides: Partial<LinkedPortfolioSnapshot> = {}): LinkedPortfolioSnapshot {
  return {
    broker: 'groww',
    label: 'Groww',
    accountLabel: null,
    asOf: '2026-09-25T10:00:00Z',
    stale: false,
    holdings: [linkedRow()],
    positions: [],
    funds: { available: 5000, used: 0, cash: 5000, collateral: 0, chargesToday: null },
    totals: {
      invested: 15200,
      value: 15648.4,
      unrealised: 448.4,
      unrealisedPct: 2.95,
      dayChange: -64.4,
    },
    warnings: [],
    caveats: [],
    ...overrides,
  };
}

const notFound = new ApiError({ status: 404, code: 'NOT_FOUND', message: 'No connected broker' });

function inputs(overrides: {
  mstock?: Partial<OverviewInputs['mstock']>;
  linked?: Partial<OverviewInputs['linked']>;
  manual?: Partial<OverviewInputs['manual']>;
}): OverviewInputs {
  return {
    mstock: { data: undefined, state: 'not-connected', error: notFound, ...overrides.mstock },
    linked: {
      id: null,
      data: undefined,
      state: 'not-connected',
      error: null,
      resolving: false,
      ...overrides.linked,
    },
    manual: { needed: false, data: undefined, error: null, isPending: false, ...overrides.manual },
  };
}

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

describe('combineBrokerStates', () => {
  it('prefers a live book, then a lapsed session', () => {
    expect(combineBrokerStates('not-connected', 'connected')).toBe('connected');
    expect(combineBrokerStates('session-expired', 'not-connected')).toBe('session-expired');
    expect(combineBrokerStates('not-connected', 'not-connected')).toBe('not-connected');
  });
});

describe('resolveOverview', () => {
  it('shows the mStock book first and hides cash when the funds call failed', () => {
    const overview = resolveOverview(
      inputs({ mstock: { data: mstockBook(), state: 'connected', error: null } }),
    );
    expect(overview.source).toBe('broker');
    expect(overview.brokerId).toBe('mstock');
    expect(overview.brokerName).toBe('mStock');
    expect(overview.day?.abs).toBeCloseTo(157.5); // 15.75 per share × 10
    // `availableCash` is 0 when mStock's funds call failed — not a real balance.
    expect(overview.availableCash).toBeNull();
  });

  it('uses the funds block when the broker returned it', () => {
    const book = mstockBook({
      availableCash: 2500,
      funds: { available: 2500, used: 0, openingBalance: 2500, total: 2500, collateral: 0 },
    });
    const overview = resolveOverview(
      inputs({ mstock: { data: book, state: 'connected', error: null } }),
    );
    expect(overview.availableCash).toBe(2500);
  });

  it('falls back to the Groww book for a Groww-only user', () => {
    const overview = resolveOverview(
      inputs({ linked: { id: 'groww', data: linkedBook(), state: 'connected' } }),
    );
    expect(overview.source).toBe('broker');
    expect(overview.brokerState).toBe('connected');
    expect(overview.brokerId).toBe('groww');
    expect(overview.brokerName).toBe('Groww');
    expect(overview.totals).toEqual({ invested: 15200, value: 15648.4, pnl: 448.4, pnlPct: 2.95 });
    // Linked rows already carry the row total — not multiplied by quantity again.
    expect(overview.day?.abs).toBeCloseTo(-64.4);
    expect(overview.availableCash).toBe(5000);
  });

  it('says "connected" with no holdings rather than inviting a connection', () => {
    const overview = resolveOverview(
      inputs({
        mstock: { data: mstockBook({ holdings: [] }), state: 'connected', error: null },
        manual: {
          needed: true,
          data: {
            holdings: [],
            totals: { invested: 0, value: 0, pnl: 0, pnlPct: 0 },
            priceUnavailable: false,
          },
        },
      }),
    );
    expect(overview.source).toBe('none');
    expect(overview.brokerState).toBe('connected');
    expect(overview.isLoading).toBe(false);
  });

  it('reports a lapsed Groww session', () => {
    const expired = new ApiError({ status: 409, code: 'BROKER_SESSION_EXPIRED', message: 'x' });
    const overview = resolveOverview(
      inputs({
        linked: { id: 'groww', state: 'session-expired', error: expired },
        manual: { needed: true },
      }),
    );
    expect(overview.source).toBe('none');
    expect(overview.brokerState).toBe('session-expired');
    expect(overview.error).toBeNull();
  });

  it('shows cost, not a fake value, for unpriced manual holdings', () => {
    const manual: ManualPortfolioSnapshot = {
      holdings: [
        {
          id: 'm1',
          sym: 'INFY',
          exch: 'NSE',
          qty: 5,
          avg: 1500,
          brokerName: null,
          ltp: null,
          invested: 7500,
          value: null,
          pnl: null,
          pnlPct: null,
          flag,
          sector: 'IT',
        },
      ],
      totals: { invested: 7500, value: 7500, pnl: 0, pnlPct: 0 },
      priceUnavailable: true,
    };
    const overview = resolveOverview(inputs({ manual: { needed: true, data: manual } }));
    expect(overview.source).toBe('manual');
    expect(overview.totals).toEqual({ invested: 7500, value: null, pnl: null, pnlPct: null });
    expect(overview.day).toBeNull();
  });

  it('stays loading while the linked book is still being resolved', () => {
    const overview = resolveOverview(
      inputs({ linked: { id: 'groww', state: 'loading', resolving: true } }),
    );
    expect(overview.isLoading).toBe(true);
    expect(overview.error).toBeNull();
  });

  it('surfaces a real broker failure when there is nothing else to show', () => {
    const down = new ApiError({
      status: 503,
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Broker down',
    });
    const overview = resolveOverview(
      inputs({ mstock: { state: 'error', error: down }, manual: { needed: true } }),
    );
    expect(overview.error).toBe(down);
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
