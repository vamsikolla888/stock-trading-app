import {
  bookFigures,
  bookIndex,
  homeBooks,
  readBook,
  SESSION_EXPIRED_MESSAGE,
  type BookSources,
} from '@/features/portfolio/lib/books';
import type { HoldingView } from '@/features/portfolio/lib/portfolio';
import type {
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
    asOf: '2026-10-07T10:00:00Z',
    stale: false,
    positionRows: [],
    funds: null,
    ...overrides,
  };
}

function growwBook(overrides: Partial<LinkedPortfolioSnapshot> = {}): LinkedPortfolioSnapshot {
  return {
    broker: 'groww',
    label: 'Groww',
    accountLabel: null,
    asOf: '2026-10-07T10:00:00Z',
    stale: false,
    holdings: [
      {
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
      },
    ],
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

const manualBook: ManualPortfolioSnapshot = {
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

const notFound = new ApiError({ status: 404, code: 'NOT_FOUND', message: 'No connected broker' });
const expired = new ApiError({ status: 409, code: 'BROKER_SESSION_EXPIRED', message: 'expired' });
const down = new ApiError({ status: 503, code: 'DEPENDENCY_UNAVAILABLE', message: 'Broker down' });

function sources(overrides: Partial<BookSources> = {}): BookSources {
  return {
    groww: { data: undefined, error: notFound },
    mstock: { data: undefined, error: notFound },
    manual: { data: undefined },
    ...overrides,
  };
}

describe('readBook', () => {
  it('treats a missing connection as no book, anything else as a book with a reason', () => {
    expect(readBook(null)).toEqual({ connected: true, sessionExpired: false, message: null });
    expect(readBook(notFound).connected).toBe(false);
    expect(readBook(expired)).toEqual({
      connected: true,
      sessionExpired: true,
      message: SESSION_EXPIRED_MESSAGE,
    });
    expect(readBook(down)).toMatchObject({ connected: true, message: 'Broker down' });
    expect(readBook(new Error('boom')).message).toBe('Could not read this account just now.');
  });
});

describe('homeBooks', () => {
  it('has no book when nothing is connected or added by hand', () => {
    expect(homeBooks(sources())).toEqual([]);
  });

  it('orders the books Groww, mStock, then added by hand — never blended', () => {
    const books = homeBooks(
      sources({
        mstock: { data: mstockBook(), error: null },
        groww: { data: growwBook(), error: null },
        manual: { data: manualBook },
      }),
    );
    expect(books.map((b) => b.id)).toEqual(['groww', 'mstock', 'manual']);
    expect(books.map((b) => b.label)).toEqual(['Groww', 'mStock', 'Added by hand']);
    expect(books[0]!.holdings.map((h) => h.symbol)).toEqual(['TCS']);
    expect(books[1]!.holdings.map((h) => h.symbol)).toEqual(['RELIANCE']);
  });

  it('keeps a lapsed session as a book, with its last known rows and the reason', () => {
    const [book] = homeBooks(sources({ groww: { data: growwBook(), error: expired } }));
    expect(book).toMatchObject({ id: 'groww', state: 'error', sessionExpired: true });
    expect(book!.message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(book!.holdings).toHaveLength(1);
  });

  it('shows a connected book that could not be read at all', () => {
    const [book] = homeBooks(sources({ mstock: { data: undefined, error: down } }));
    expect(book).toMatchObject({ id: 'mstock', state: 'error', message: 'Broker down' });
    expect(book!.holdings).toEqual([]);
  });

  it('only counts the /portfolio snapshot as mStock when mStock is its broker', () => {
    const books = homeBooks(
      sources({ mstock: { data: mstockBook({ broker: 'zerodha' }), error: null } }),
    );
    expect(books).toEqual([]);
  });

  it('leaves out empty rows and reads cash only from a real funds block', () => {
    const snapshot = mstockBook();
    const [book] = homeBooks(
      sources({
        mstock: {
          data: {
            ...snapshot,
            holdings: [...snapshot.holdings, { ...snapshot.holdings[0]!, sym: 'SOLD', qty: 0 }],
          },
          error: null,
        },
      }),
    );
    expect(book!.holdings.map((h) => h.symbol)).toEqual(['RELIANCE']);
    // `availableCash` is 0 when mStock's funds call failed — not a real balance.
    expect(book!.availableCash).toBeNull();
  });

  it('adds hand-entered holdings only when there are some', () => {
    const empty = { ...manualBook, holdings: [] };
    expect(homeBooks(sources({ manual: { data: empty } }))).toEqual([]);
    expect(homeBooks(sources({ manual: { data: manualBook } }))[0]!.id).toBe('manual');
  });
});

const row = (overrides: Partial<HoldingView> = {}): HoldingView => ({
  key: 'NSE:TCS',
  symbol: 'TCS',
  exchange: 'NSE',
  qty: 10,
  avg: 100,
  ltp: 110,
  invested: 1000,
  value: 1100,
  pnl: 100,
  pnlPct: 10,
  dayChange: 50,
  dayChangePct: (5 / 105) * 100,
  sector: null,
  ...overrides,
});

describe('bookFigures', () => {
  it('sums a fully priced book', () => {
    const figures = bookFigures([row(), row({ key: 'NSE:INFY', invested: 500, value: 450 })]);
    expect(figures).toMatchObject({ value: 1550, invested: 1500, pnl: 50, priced: 2, count: 2 });
    expect(figures.pnlPct).toBeCloseTo((50 / 1500) * 100);
  });

  it('leaves totals unknown rather than understate a partly priced book', () => {
    const figures = bookFigures([row(), row({ key: 'NSE:INFY', value: null })]);
    expect(figures).toMatchObject({ value: null, pnl: null, pnlPct: null, priced: 1, count: 2 });
    expect(figures.invested).toBe(2000);
  });

  it('measures the day only when every row has a move', () => {
    expect(bookFigures([row()]).day?.abs).toBe(50);
    expect(bookFigures([row(), row({ key: 'NSE:X', dayChange: null })]).day).toBeNull();
    expect(bookFigures([]).day).toBeNull();
  });
});

describe('bookIndex', () => {
  it('opens the requested book when it is there, the first one otherwise', () => {
    expect(bookIndex(['groww', 'mstock'], 'mstock')).toBe(1);
    expect(bookIndex(['groww', 'mstock'], 'manual')).toBe(0);
    expect(bookIndex(['groww'], null)).toBe(0);
    expect(bookIndex([], 'groww')).toBe(0);
  });
});
