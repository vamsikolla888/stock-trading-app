import { searchPhase, searchResultMeta } from '@/features/market/lib/search';

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
  it('reads ticker · exchange · broad index', () => {
    const tag = { key: 'nifty50', label: 'NIFTY 50', shortLabel: 'NIFTY 50', category: 'broad' };
    expect(
      searchResultMeta({
        symbol: 'RELIANCE',
        exchange: 'NSE',
        indices: { primary: tag, sectors: [], all: [tag] },
      }),
    ).toBe('RELIANCE · NSE · NIFTY 50');
    expect(searchResultMeta({ symbol: '500325', exchange: 'BSE' })).toBe('500325 · BSE');
  });
});
