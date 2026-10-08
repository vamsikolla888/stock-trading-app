import {
  fnoSearchHref,
  paperBookHref,
  paperChainHref,
  paperSearchHref,
  paperWalletHref,
  parseExpiry,
  parsePaperChainParams,
  parsePaperView,
  parseSearchScope,
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
        ticket: null,
      },
    );
    expect(parsePaperChainParams({})).toEqual({
      underlying: null,
      expiry: null,
      builder: false,
      ticket: null,
    });
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

describe('the ticket deep link', () => {
  const contract = {
    exchange: 'NFO' as const,
    tradingsymbol: 'NIFTY26O2725000CE',
    underlying: 'NIFTY',
    kind: 'CE' as const,
    strike: 25000,
    expiry: '2026-10-27',
    lotSize: 75,
    tickSize: 0.05,
    freezeQuantity: 1801,
  };

  it('round-trips a contract through the chain link', () => {
    const href = paperChainHref({
      expiry: '2026-10-27',
      ticket: { contract, side: 'SELL', lots: 3 },
    });
    expect(href.params).toEqual({
      underlying: 'NIFTY',
      expiry: '2026-10-27',
      contract: 'NIFTY26O2725000CE',
      ex: 'NFO',
      kind: 'CE',
      cexpiry: '2026-10-27',
      lot: '75',
      strike: '25000',
      tick: '0.05',
      freeze: '1801',
      side: 'SELL',
      lots: '3',
    });
    expect(parsePaperChainParams(href.params).ticket).toEqual({ contract, side: 'SELL', lots: 3 });
  });

  it('carries a future without a strike, and defaults to a buy', () => {
    const future = {
      ...contract,
      kind: 'FUT' as const,
      strike: null,
      tickSize: null,
      freezeQuantity: null,
    };
    const parsed = parsePaperChainParams(paperChainHref({ ticket: { contract: future } }).params);
    expect(parsed.expiry).toBeNull();
    expect(parsed.ticket).toEqual({ contract: future, side: 'BUY', lots: null });
  });

  it('drops a link missing anything the ticket needs', () => {
    const good = paperChainHref({ ticket: { contract } }).params;
    expect(parsePaperChainParams({ ...good, kind: 'XX' }).ticket).toBeNull();
    expect(parsePaperChainParams({ ...good, strike: undefined }).ticket).toBeNull();
    expect(parsePaperChainParams({ ...good, lot: '7.5' }).ticket).toBeNull();
    expect(parsePaperChainParams({ ...good, cexpiry: '2026-02-30' }).ticket).toBeNull();
    expect(parsePaperChainParams({ ...good, contract: 'NIFTY 25000 CE' }).ticket).toBeNull();
    expect(parsePaperChainParams({ ...good, lots: '500' }).ticket?.lots).toBeNull();
    expect(parsePaperChainParams({ underlying: 'NIFTY' }).ticket).toBeNull();
  });

  it('links the wallet sheet', () => {
    expect(paperWalletHref()).toEqual({ pathname: '/fno/paper', params: { wallet: '1' } });
  });
});

describe('search routing', () => {
  const contract = {
    exchange: 'NFO' as const,
    tradingSymbol: 'NIFTY26O2725000CE',
    growwSymbol: null,
    underlying: 'NIFTY',
    kind: 'CE' as const,
    expiry: '2026-10-27',
    strike: 25000,
    lotSize: 75,
    tickSize: 0.05,
    freezeQuantity: 1801,
    exchangeToken: '1',
    buyAllowed: true,
    sellAllowed: true,
  };

  it('reads the scope', () => {
    expect(parseSearchScope('paper')).toBe('paper');
    expect(parseSearchScope(['paper'])).toBe('paper');
    expect(parseSearchScope('live')).toBe('app');
    expect(parseSearchScope(undefined)).toBe('app');
    expect(paperSearchHref()).toEqual({ pathname: '/search', params: { scope: 'paper' } });
  });

  it('never opens the live chain from a paper screen', () => {
    const underlying = {
      type: 'underlying' as const,
      underlying: { exchange: 'NFO' as const, underlying: 'BANKNIFTY' },
    };
    expect(fnoSearchHref(underlying, 'paper')).toEqual({
      pathname: '/paper-option-chain',
      params: { underlying: 'BANKNIFTY' },
    });
    const pick = fnoSearchHref({ type: 'contract', contract }, 'paper');
    expect(pick.pathname).toBe('/paper-option-chain');
    expect(pick.params).toMatchObject({
      contract: 'NIFTY26O2725000CE',
      expiry: '2026-10-27',
      lot: '75',
    });
    const future = fnoSearchHref(
      { type: 'contract', contract: { ...contract, kind: 'FUT', strike: null } },
      'paper',
    );
    expect(future.params).not.toHaveProperty('expiry');
    expect(future.params).not.toHaveProperty('strike');
  });

  it('opens the live screens anywhere else', () => {
    expect(
      fnoSearchHref(
        { type: 'underlying', underlying: { exchange: 'BFO', underlying: 'SENSEX' } },
        'app',
      ),
    ).toEqual({ pathname: '/fno-underlying', params: { exchange: 'BFO', underlying: 'SENSEX' } });
    expect(fnoSearchHref({ type: 'contract', contract }, 'app')).toEqual({
      pathname: '/option-chain',
      params: { exchange: 'NFO', underlying: 'NIFTY', expiry: '2026-10-27' },
    });
    expect(
      fnoSearchHref(
        { type: 'contract', contract: { ...contract, kind: 'FUT', strike: null } },
        'app',
      ),
    ).toEqual({
      pathname: '/option-chain',
      params: { exchange: 'NFO', underlying: 'NIFTY', tab: 'futures' },
    });
  });
});
