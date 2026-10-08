import { repricePosition } from '../lib/book';
import { liveTotals, repriceHolding, type HoldingView } from '../lib/portfolio';
import type { PositionRow } from '../types';

const holding = (overrides: Partial<HoldingView> = {}): HoldingView => ({
  key: 'NSE:TCS',
  symbol: 'TCS',
  exchange: 'NSE',
  qty: 10,
  avg: 3500,
  ltp: 3900,
  invested: 35_000,
  value: 39_000,
  pnl: 4_000,
  pnlPct: (4_000 / 35_000) * 100,
  dayChange: 500, // the row moved ₹500 today → ₹50 a share → previous close 3850
  dayChangePct: (50 / 3850) * 100,
  sector: 'IT',
  ...overrides,
});

describe('repriceHolding', () => {
  it('moves value, returns and today’s move with the live price', () => {
    const live = repriceHolding(holding(), 4000);
    expect(live).toMatchObject({ ltp: 4000, value: 40_000, pnl: 5_000 });
    expect(live.pnlPct).toBeCloseTo((5_000 / 35_000) * 100);
    expect(live.dayChange).toBeCloseTo(1_500); // (4000 − 3850) × 10
    expect(live.dayChangePct).toBeCloseTo((150 / 3850) * 100);
  });

  it('returns the same row for an unchanged or unusable price', () => {
    const row = holding();
    expect(repriceHolding(row, 3900)).toBe(row);
    expect(repriceHolding(row, 0)).toBe(row);
  });

  it('leaves the day move unknown when the row never had one', () => {
    expect(repriceHolding(holding({ dayChange: null }), 4000).dayChange).toBeNull();
  });

  it('measures a row with no reported move against the tick’s previous close', () => {
    const handAdded = holding({ dayChange: null, dayChangePct: null });
    const live = repriceHolding(handAdded, 3900, 3800);
    expect(live).not.toBe(handAdded);
    expect(live.dayChange).toBeCloseTo(1_000); // (3900 − 3800) × 10
    expect(live.dayChangePct).toBeCloseTo((100 / 3800) * 100);
  });

  it('keeps the broker’s own move over the tick’s previous close', () => {
    const live = repriceHolding(holding(), 4000, 3000);
    expect(live.dayChange).toBeCloseTo(1_500);
    const row = holding();
    expect(repriceHolding(row, 3900, 3000)).toBe(row);
  });
});

describe('liveTotals', () => {
  const totals = { value: 39_000, invested: 35_000, pnl: 4_000, pnlPct: 11.43 };

  it('moves the server totals by exactly the live delta', () => {
    const base = [holding()];
    const live = [repriceHolding(base[0]!, 4000)];
    expect(liveTotals(totals, base, live)).toMatchObject({
      value: 40_000,
      invested: 35_000,
      pnl: 5_000,
    });
  });

  it('returns the totals untouched when nothing ticked, and skips rows it could not value', () => {
    const base = [holding()];
    expect(liveTotals(totals, base, base)).toBe(totals);
    const unvalued = [holding({ value: null })];
    expect(liveTotals(totals, unvalued, [holding()])).toBe(totals);
  });
});

describe('repricePosition', () => {
  const row = (overrides: Partial<PositionRow> = {}): PositionRow => ({
    sym: 'TCS',
    exch: 'NSE',
    product: 'MIS',
    kind: 'intraday',
    qty: 10,
    avg: 3900,
    ltp: 3910,
    buyQty: 10,
    buyAvg: 3900,
    sellQty: 0,
    sellAvg: 0,
    realised: 0,
    unrealised: 100,
    pnl: 100,
    value: 39_100,
    ...overrides,
  });

  it('moves a long position’s P&L and value by the price change', () => {
    expect(repricePosition(row(), 3920)).toMatchObject({
      ltp: 3920,
      unrealised: 200,
      pnl: 200,
      value: 39_200,
    });
  });

  it('a short position gains as the price falls', () => {
    const short = row({ qty: -10, avg: 3920, unrealised: 100, pnl: 100 });
    expect(repricePosition(short, 3900)).toMatchObject({ unrealised: 200, pnl: 200 });
  });

  it('leaves closed rows and rows with no REST price alone', () => {
    const closed = row({ qty: 0 });
    expect(repricePosition(closed, 4000)).toBe(closed);
    const unpriced = row({ ltp: null });
    expect(repricePosition(unpriced, 4000)).toBe(unpriced);
  });
});
