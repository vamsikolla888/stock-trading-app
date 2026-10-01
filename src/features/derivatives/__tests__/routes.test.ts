import {
  paperBookHref,
  paperChainHref,
  parseExpiry,
  parsePaperChainParams,
  parsePaperView,
  parseUnderlying,
} from '@/features/derivatives/lib/routes';

describe('parseUnderlying', () => {
  it('upper-cases, trims and keeps the server’s character set', () => {
    expect(parseUnderlying(' nifty ')).toBe('NIFTY');
    expect(parseUnderlying('M&M')).toBe('M&M');
    expect(parseUnderlying('M%26M')).toBe('M&M');
    expect(parseUnderlying(['BANKNIFTY', 'NIFTY'])).toBe('BANKNIFTY');
  });

  it('drops anything the server would refuse', () => {
    expect(parseUnderlying(undefined)).toBeNull();
    expect(parseUnderlying('')).toBeNull();
    expect(parseUnderlying('NIFTY 50')).toBeNull();
    expect(parseUnderlying('%E0%A4%A')).toBeNull();
    expect(parseUnderlying('A'.repeat(31))).toBeNull();
    expect(parseUnderlying('../book')).toBeNull();
  });
});

describe('parseExpiry', () => {
  it('accepts only real YYYY-MM-DD dates', () => {
    expect(parseExpiry('2026-10-27')).toBe('2026-10-27');
    expect(parseExpiry(['2026-10-27'])).toBe('2026-10-27');
    expect(parseExpiry('2026-02-30')).toBeNull();
    expect(parseExpiry('2026-13-01')).toBeNull();
    expect(parseExpiry('27-10-2026')).toBeNull();
    expect(parseExpiry('2026-10-27T00:00:00Z')).toBeNull();
    expect(parseExpiry(undefined)).toBeNull();
  });
});

describe('parsePaperView', () => {
  it('falls back to the book (Positions) for anything unknown', () => {
    expect(parsePaperView('explore')).toBe('explore');
    expect(parsePaperView(['orders'])).toBe('orders');
    expect(parsePaperView('analytics')).toBe('analytics');
    expect(parsePaperView('chain')).toBe('positions');
    expect(parsePaperView(undefined)).toBe('positions');
  });
});

describe('parsePaperChainParams', () => {
  it('decodes every param independently', () => {
    expect(parsePaperChainParams({ underlying: 'reliance', expiry: 'soon', builder: '1' })).toEqual(
      {
        underlying: 'RELIANCE',
        expiry: null,
        builder: true,
      },
    );
    expect(parsePaperChainParams({})).toEqual({ underlying: null, expiry: null, builder: false });
  });
});

describe('hrefs', () => {
  it('omits unset params rather than sending "undefined"', () => {
    expect(paperChainHref()).toEqual({ pathname: '/paper-option-chain', params: {} });
    expect(paperChainHref({ underlying: 'NIFTY', expiry: null, builder: true })).toEqual({
      pathname: '/paper-option-chain',
      params: { underlying: 'NIFTY', builder: '1' },
    });
    expect(paperBookHref('orders')).toEqual({ pathname: '/fno/paper', params: { view: 'orders' } });
  });
});
