import { matchesUnderlying, rankUnderlyings, searchTokens } from '../lib/underlyingSearch';

/**
 * The same cases the web runs over the server rule and its client copy
 * (server/test/fno-search.rules.test.ts) — the three must agree, or the search sheet and the
 * server's /fno/search would list different indices for the same words.
 */
const U = [
  { underlying: 'NIFTY', name: 'NIFTY 50', isIndex: true },
  { underlying: 'BANKNIFTY', name: 'NIFTY Bank', isIndex: true },
  { underlying: 'FINNIFTY', name: 'Nifty Financial Services', isIndex: true },
  { underlying: 'MIDCPNIFTY', name: 'Nifty Midcap Select', isIndex: true },
  { underlying: 'NIFTYNXT50', name: 'Nifty Next 50', isIndex: true },
  { underlying: 'NIFTYFPI', name: null, isIndex: true },
  { underlying: 'SENSEX', name: 'Bse Sensex', isIndex: true },
  { underlying: 'BANKEX', name: 'Bse Bankex', isIndex: true },
  { underlying: 'HDFCBANK', name: 'HDFC Bank', isIndex: false },
  { underlying: 'BANKBARODA', name: 'Bank of Baroda', isIndex: false },
  { underlying: 'RELIANCE', name: 'Reliance Industries', isIndex: false },
  { underlying: 'INFY', name: 'Infosys', isIndex: false },
];

const syms = (rows: { underlying: string }[]) => rows.map((r) => r.underlying);

describe('rankUnderlyings', () => {
  it.each([
    ['bank nifty', ['BANKNIFTY']],
    ['Bank Nifty', ['BANKNIFTY']],
    ['nifty bank', ['BANKNIFTY']],
    ['banknifty', ['BANKNIFTY']],
    ['fin nifty', ['FINNIFTY']],
    ['midcap nifty', ['MIDCPNIFTY']],
    ['nifty next 50', ['NIFTYNXT50']],
    ['bse sensex', ['SENSEX']],
    ['bankex', ['BANKEX']],
  ])('"%s" finds what a person means', (q, want) => {
    expect(syms(rankUnderlyings(U, q, 12))).toEqual(want);
  });

  it('"index" (or "indices") lists every index and no stock', () => {
    const all = [
      'BANKEX',
      'BANKNIFTY',
      'FINNIFTY',
      'MIDCPNIFTY',
      'NIFTY',
      'NIFTYFPI',
      'NIFTYNXT50',
      'SENSEX',
    ];
    expect(syms(rankUnderlyings(U, 'index', 12)).sort()).toEqual(all);
    expect(syms(rankUnderlyings(U, 'indices', 12)).sort()).toEqual(all);
    expect(syms(rankUnderlyings(U, 'nifty index', 12))).toEqual([
      'NIFTY',
      'NIFTYFPI',
      'NIFTYNXT50',
      'BANKNIFTY',
      'FINNIFTY',
      'MIDCPNIFTY',
    ]);
  });

  it('ranks the exact symbol first, then prefixes, indices before stocks at the same rank', () => {
    expect(syms(rankUnderlyings(U, 'nifty', 3))).toEqual(['NIFTY', 'NIFTYFPI', 'NIFTYNXT50']);
    expect(syms(rankUnderlyings(U, 'bank', 12))).toEqual([
      'BANKEX',
      'BANKNIFTY',
      'BANKBARODA',
      'HDFCBANK',
    ]);
  });

  it('still finds a stock by symbol or name; nonsense and blanks find nothing', () => {
    expect(syms(rankUnderlyings(U, 'reliance', 12))).toEqual(['RELIANCE']);
    expect(syms(rankUnderlyings(U, 'infosys', 12))).toEqual(['INFY']);
    expect(rankUnderlyings(U, 'zzz', 12)).toEqual([]);
    expect(rankUnderlyings(U, '   ', 12)).toEqual([]);
  });

  it('respects the limit', () => {
    expect(rankUnderlyings(U, 'index', 2)).toHaveLength(2);
  });
});

describe('search words', () => {
  it('reads index / indices / indexes as INDEX and splits on punctuation', () => {
    expect(searchTokens('Bank-Nifty indices')).toEqual(['BANK', 'NIFTY', 'INDEX']);
    expect(searchTokens('M&M')).toEqual(['M&M']);
  });

  it('never lets a joined query straddle the symbol and the name', () => {
    // "NIFTY" + "50" squashed is NIFTY50 — found in the name "NIFTY 50", not across names.
    expect(matchesUnderlying(U[0]!, 'nifty50')).toBe(true);
    expect(matchesUnderlying(U[8]!, 'hdfcbankhdfc')).toBe(false);
  });
});
