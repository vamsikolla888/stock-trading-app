import { parseStockParams } from '@/features/stock/lib/routeParams';

describe('parseStockParams', () => {
  it('reads the symbol and exchange of a normal stock link', () => {
    expect(parseStockParams({ symbol: 'reliance', exchange: 'nse' })).toEqual({
      symbol: 'RELIANCE',
      exchange: 'NSE',
    });
    expect(parseStockParams({ symbol: '500325', exchange: 'BSE' })).toEqual({
      symbol: '500325',
      exchange: 'BSE',
    });
  });

  it('treats any exchange other than BSE as the NSE listing', () => {
    expect(parseStockParams({ symbol: 'TCS' }).exchange).toBe('NSE');
    expect(parseStockParams({ symbol: 'TCS', exchange: 'MCX' }).exchange).toBe('NSE');
  });

  it('keeps symbols with URL-significant characters, and never throws on a stray %', () => {
    expect(parseStockParams({ symbol: 'M&M' }).symbol).toBe('M&M');
    expect(parseStockParams({ symbol: 'M%26M' }).symbol).toBe('M&M');
    expect(parseStockParams({ symbol: '100%' }).symbol).toBe('100%');
  });

  it('takes the first of a repeated param', () => {
    expect(parseStockParams({ symbol: ['INFY', 'TCS'], exchange: ['BSE'] })).toEqual({
      symbol: 'INFY',
      exchange: 'BSE',
    });
  });

  it('gives an empty symbol for a missing, blank or over-long one — "not found", not a hang', () => {
    expect(parseStockParams({}).symbol).toBe('');
    expect(parseStockParams({ symbol: '   ' }).symbol).toBe('');
    expect(parseStockParams({ symbol: 'X'.repeat(21) }).symbol).toBe('');
    expect(parseStockParams({ symbol: 'X'.repeat(20) }).symbol).toBe('X'.repeat(20));
  });
});
