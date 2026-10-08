import {
  cleanCompanyName,
  normalizeSearchResults,
  oneRowPerCompany,
  searchPhase,
  searchResultMeta,
} from '@/features/market/lib/search';

const base = {
  typed: 'reli',
  debounced: 'reli',
  pending: false,
  placeholder: false,
  error: false,
  count: 3,
};

describe('searchPhase', () => {
  it('is idle with nothing (or only spaces) typed', () => {
    expect(searchPhase({ ...base, typed: '   ', count: 0 })).toEqual({
      phase: 'idle',
      stale: false,
    });
  });

  it('shows settled results for the text in the box', () => {
    expect(searchPhase(base)).toEqual({ phase: 'results', stale: false });
    // Trailing spaces don't unsettle a query made for the trimmed text.
    expect(searchPhase({ ...base, typed: 'reli ' })).toEqual({ phase: 'results', stale: false });
  });

  it('keeps the previous answer up, marked stale, while the next is on its way', () => {
    // Still debouncing.
    expect(searchPhase({ ...base, typed: 'relia' })).toEqual({ phase: 'results', stale: true });
    // Asked, answer not back: the previous query's rows are the placeholder.
    expect(searchPhase({ ...base, placeholder: true })).toEqual({ phase: 'results', stale: true });
  });

  it('never says “no match” about a query that has not been answered', () => {
    expect(searchPhase({ ...base, typed: 'relia', count: 0 })).toEqual({
      phase: 'loading',
      stale: false,
    });
    expect(searchPhase({ ...base, pending: true, count: 0 })).toEqual({
      phase: 'loading',
      stale: false,
    });
    expect(searchPhase({ ...base, placeholder: true, count: 0 }).phase).toBe('loading');
  });

  it('is empty or failed only once the query for this text has settled', () => {
    expect(searchPhase({ ...base, count: 0 })).toEqual({ phase: 'empty', stale: false });
    expect(searchPhase({ ...base, count: 0, error: true })).toEqual({
      phase: 'error',
      stale: false,
    });
  });
});

describe('searchResultMeta', () => {
  it('reads ticker · broad index, with no exchange tag (one row per company)', () => {
    const tag = { key: 'nifty50', label: 'NIFTY 50', shortLabel: 'NIFTY 50', category: 'broad' };
    expect(
      searchResultMeta({
        symbol: 'RELIANCE',
        indices: { primary: tag, sectors: [], all: [tag] },
      }),
    ).toBe('RELIANCE · NIFTY 50');
    expect(searchResultMeta({ symbol: '500325' })).toBe('500325');
  });
});

describe('normalizeSearchResults', () => {
  it('reads the rows, upper-casing the exchange and nulling what is not a number', () => {
    expect(
      normalizeSearchResults({
        results: [
          {
            symbol: 'TCS',
            exchange: 'nse',
            companyName: 'Tata Consultancy',
            ltp: 3100,
            changePct: '1',
          },
        ],
      }),
    ).toEqual([
      {
        symbol: 'TCS',
        exchange: 'NSE',
        companyName: 'Tata Consultancy',
        ltp: 3100,
        changePct: null,
      },
    ]);
  });

  it('drops rows that cannot open a stock, and repeated listings', () => {
    expect(
      normalizeSearchResults({
        results: [
          { symbol: '', exchange: 'NSE' },
          { symbol: 'TCS' },
          null,
          { symbol: 'TCS', exchange: 'NSE', ltp: 1 },
          { symbol: 'TCS', exchange: 'NSE', ltp: 2 },
        ],
      }).map((r) => [r.exchange, r.symbol, r.ltp]),
    ).toEqual([['NSE', 'TCS', 1]]);
  });

  it('is empty for a body without results', () => {
    expect(normalizeSearchResults(undefined)).toEqual([]);
    expect(normalizeSearchResults({ results: 'x' })).toEqual([]);
  });
});

describe('oneRowPerCompany (older-server fallback for group=company)', () => {
  const row = (exchange: string, symbol: string, companyName: string | null) => ({
    exchange,
    symbol,
    companyName,
  });

  it('cleans legal forms and punctuation out of a company name', () => {
    expect(cleanCompanyName('Tube Investments of India Ltd.')).toBe('tube investments of india');
    expect(cleanCompanyName('TUBE INVESTMENTS OF INDIA LIMITED')).toBe('tube investments of india');
  });

  it('keeps one row per company, the NSE listing, where the company first ranked', () => {
    const rows = [
      row('BSE', '532540', 'Tata Consultancy Services Ltd'),
      row('NSE', 'TATAMOTORS', 'Tata Motors Limited'),
      row('NSE', 'TCS', 'TATA CONSULTANCY SERVICES LIMITED'),
    ];
    expect(oneRowPerCompany(rows).map((r) => `${r.exchange}:${r.symbol}`)).toEqual([
      'NSE:TCS',
      'NSE:TATAMOTORS',
    ]);
  });

  it('never merges two rows of one exchange, nor rows without a usable name', () => {
    const rows = [
      row('NSE', 'TATAMOTORS', 'Tata Motors'),
      row('NSE', 'TATAMTRDVR', 'Tata Motors'),
      row('NSE', 'AB', null),
      row('BSE', '500001', null),
    ];
    expect(oneRowPerCompany(rows)).toHaveLength(4);
  });

  it('keeps a BSE-only company', () => {
    expect(oneRowPerCompany([row('BSE', '543210', 'Only On Bse Ltd')])).toHaveLength(1);
  });
});
