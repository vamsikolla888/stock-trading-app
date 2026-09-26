/** Typed link to a stock's detail screen — the one place stock URLs are built. */
export function stockHref(symbol: string, exchange: string | null | undefined) {
  return {
    pathname: '/stock/[symbol]' as const,
    params: { symbol, exchange: (exchange ?? 'NSE').toUpperCase() },
  };
}

export function orderHref(symbol: string, exchange: string, side: 'BUY' | 'SELL') {
  return { pathname: '/order' as const, params: { symbol, exchange, side } };
}
