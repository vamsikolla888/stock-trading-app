import { paperOrderBody } from '@/features/derivatives/lib/orderBody';

describe('paperOrderBody', () => {
  const base = {
    tradingsymbol: 'NIFTY26OCT25000CE',
    exchange: 'NFO' as const,
    side: 'BUY' as const,
  };

  it('sends a market order with no type key at all (an older server rejects unknown keys)', () => {
    const body = paperOrderBody({ ...base, lots: 2, type: 'MARKET', limitPrice: 120 });
    expect(body).toEqual({ ...base, lots: 2 });
    expect('type' in body).toBe(false);
    expect('limitPrice' in body).toBe(false);
  });

  it('treats a missing type as market', () => {
    expect(paperOrderBody({ ...base, lots: 1 })).toEqual({ ...base, lots: 1 });
  });

  it('keeps type and price on a limit order', () => {
    expect(paperOrderBody({ ...base, lots: 1, type: 'LIMIT', limitPrice: 99.5 })).toEqual({
      ...base,
      lots: 1,
      type: 'LIMIT',
      limitPrice: 99.5,
    });
  });

  it('leaves a missing limit price for the server to refuse, rather than inventing one', () => {
    const body = paperOrderBody({ ...base, lots: 1, type: 'LIMIT' });
    expect(body).toEqual({ ...base, lots: 1, type: 'LIMIT' });
  });
});
