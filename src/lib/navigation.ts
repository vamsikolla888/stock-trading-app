/** Typed link to a stock's detail screen — the one place stock URLs are built. */
export function stockHref(symbol: string, exchange: string | null | undefined) {
  return {
    pathname: '/stock/[symbol]' as const,
    params: { symbol, exchange: (exchange ?? 'NSE').toUpperCase() },
  };
}

/** The advanced chart for one listing; `fullscreen` opens it straight into landscape full screen. */
export function chartHref(
  symbol: string,
  exchange: string | null | undefined,
  options: { fullscreen?: boolean } = {},
) {
  return {
    pathname: '/chart/[symbol]' as const,
    params: {
      symbol,
      exchange: (exchange ?? 'NSE').toUpperCase(),
      ...(options.fullscreen ? { full: '1' } : {}),
    },
  };
}

export function orderHref(symbol: string, exchange: string, side: 'BUY' | 'SELL') {
  return { pathname: '/order' as const, params: { symbol, exchange, side } };
}
