import {
  dayMove,
  fromBrokerHolding,
  sectorAllocation,
  type HoldingView,
} from '@/features/portfolio/lib/portfolio';
import type { PortfolioHolding } from '@/features/portfolio/types';

function holding(overrides: Partial<HoldingView>): HoldingView {
  return {
    key: 'k',
    symbol: 'X',
    exchange: 'NSE',
    qty: 10,
    avg: 100,
    ltp: 110,
    invested: 1000,
    value: 1100,
    pnl: 100,
    pnlPct: 10,
    dayChange: 50,
    dayChangePct: 4.76,
    sector: 'Energy',
    ...overrides,
  };
}

describe('fromBrokerHolding', () => {
  it('multiplies mStock’s per-share day change by quantity', () => {
    const raw = {
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
      flag: {
        action: 'HOLD',
        rationale: '',
        conviction: null,
        hitRatePct: null,
        evidence: [],
        asOf: '',
      },
      sector: 'Energy',
    } satisfies PortfolioHolding;
    expect(fromBrokerHolding(raw).dayChange).toBeCloseTo(157.5);
  });
});

describe('dayMove', () => {
  it('sums row moves and measures against yesterday’s value', () => {
    const move = dayMove([
      holding({ value: 1100, dayChange: 100 }),
      holding({ value: 900, dayChange: -100 }),
    ]);
    expect(move?.abs).toBe(0);
    expect(move?.pct).toBe(0);

    const up = dayMove([holding({ value: 1100, dayChange: 100 })]);
    expect(up?.pct).toBeCloseTo(10); // 100 on a 1,000 base
  });

  it('refuses a partial sum when any row lacks a move', () => {
    expect(dayMove([holding({}), holding({ dayChange: null })])).toBeNull();
    expect(dayMove([])).toBeNull();
  });
});

describe('sectorAllocation', () => {
  it('groups by sector, weights by value, sorts descending and folds the tail into Other', () => {
    const holdings = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((sector, index) =>
      holding({ key: sector, sector, value: (index + 1) * 100 }),
    );
    holdings.push(holding({ key: 'none', sector: null, value: null, invested: 50 }));

    const segments = sectorAllocation(holdings);
    expect(segments.map((segment) => segment.label)).toEqual(['G', 'F', 'E', 'D', 'C', 'Other']);
    // B (200) + A (100) + Unclassified (invested 50, unpriced)
    expect(segments[5]?.value).toBe(350);
  });
});
