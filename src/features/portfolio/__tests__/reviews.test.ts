import type { HoldingSummary } from '@/features/agents/types';
import { reviewIndex, reviewKey, reviewMark, reviewTally } from '@/features/portfolio/lib/reviews';

function summary(overrides: Partial<HoldingSummary> = {}): HoldingSummary {
  return {
    key: 'NSE:INFY',
    exchange: 'NSE',
    symbol: 'INFY',
    companyName: 'Infosys',
    current: null,
    inFlight: null,
    lastFailure: null,
    lastChange: null,
    changed: false,
    history: [],
    brokers: [],
    ...overrides,
  };
}

const verdict = (
  action: 'HOLD' | 'CONSIDER_ADD' | 'CONSIDER_SELL',
  at = '2026-10-07T09:00:00Z',
) => ({
  id: 'r1',
  at,
  asOf: null,
  action,
  result: null,
  evidence: null,
});

describe('reviewKey / reviewIndex', () => {
  it('keys a holding EXCHANGE:SYMBOL in upper case, as the review list does', () => {
    expect(reviewKey('nse', 'infy ')).toBe('NSE:INFY');
    const index = reviewIndex([summary({ key: 'nse:infy' })]);
    expect(index.get('NSE:INFY')?.symbol).toBe('INFY');
    expect(reviewIndex(null).size).toBe(0);
  });
});

describe('reviewMark', () => {
  it('shows the verdict in force, even while a newer review runs', () => {
    expect(
      reviewMark(
        summary({ current: verdict('HOLD'), inFlight: { status: 'COLLECTING', at: 'x' } }),
      ),
    ).toEqual({
      kind: 'verdict',
      action: 'HOLD',
      at: '2026-10-07T09:00:00Z',
      updating: true,
      changedFrom: null,
    });
  });

  it('says what a verdict was when it flipped in the last day', () => {
    const mark = reviewMark(
      summary({
        current: verdict('CONSIDER_SELL'),
        changed: true,
        lastChange: { from: 'HOLD', to: 'CONSIDER_SELL', at: 'x' },
      }),
    );
    expect(mark).toMatchObject({ kind: 'verdict', changedFrom: 'HOLD' });
  });

  it('never makes up a verdict for a holding without one', () => {
    expect(reviewMark(summary({ inFlight: { status: 'QUEUED', at: 'x' } })).kind).toBe('reviewing');
    expect(reviewMark(summary({ lastFailure: { at: 'x', error: 'AI down' } }))).toEqual({
      kind: 'failed',
      error: 'AI down',
    });
    expect(reviewMark(summary()).kind).toBe('none');
    expect(reviewMark(undefined).kind).toBe('none');
  });
});

describe('reviewTally', () => {
  it('puts every holding in exactly one bucket, once, and finds the newest verdict', () => {
    const index = reviewIndex([
      summary({ key: 'NSE:INFY', current: verdict('HOLD', '2026-10-07T08:00:00Z') }),
      summary({ key: 'NSE:TCS', current: verdict('CONSIDER_ADD', '2026-10-07T09:30:00Z') }),
      summary({ key: 'NSE:SBIN', inFlight: { status: 'QUEUED', at: 'x' } }),
      summary({ key: 'NSE:ITC', lastFailure: { at: 'x', error: null } }),
    ]);
    const tally = reviewTally(
      [
        { exchange: 'NSE', symbol: 'INFY' },
        { exchange: 'NSE', symbol: 'INFY' },
        { exchange: 'NSE', symbol: 'TCS' },
        { exchange: 'NSE', symbol: 'SBIN' },
        { exchange: 'NSE', symbol: 'ITC' },
        { exchange: 'BSE', symbol: 'NEW' },
      ],
      index,
    );
    expect(tally).toEqual({
      CONSIDER_ADD: 1,
      HOLD: 1,
      CONSIDER_SELL: 0,
      NEEDS_REVIEW: 0,
      reviewing: 1,
      none: 2,
      total: 5,
      latestAt: '2026-10-07T09:30:00Z',
    });
  });
});
