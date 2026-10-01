import { useMemo } from 'react';

import { liveKey } from '@/features/market/lib/liveQuote';
import { useLiveQuotes } from '@/features/market/live';

import type { PortfolioOverview } from './lib/overview';
import { dayMove, liveTotals, repriceHolding, type HoldingView } from './lib/portfolio';

/**
 * Holdings re-priced at the live feed's prices (each row's value, returns and day move). Rows
 * without a tick yet keep their REST figures; unchanged rows keep their identity, so memoised
 * rows and the totals delta (liveTotals) skip them.
 */
export function useLiveHoldings(holdings: readonly HoldingView[]): HoldingView[] {
  const quotes = useLiveQuotes(holdings);
  return useMemo(
    () =>
      holdings.map((holding) => {
        const quote = quotes.get(liveKey(holding.exchange, holding.symbol));
        return quote ? repriceHolding(holding, quote.ltp) : holding;
      }),
    [holdings, quotes],
  );
}

/**
 * A portfolio overview (the home screen's holdings card) moving with the live feed: holdings
 * re-priced, the totals moved by exactly that delta, and the day's move re-measured.
 */
export function useLiveOverview(overview: PortfolioOverview): PortfolioOverview {
  const holdings = useLiveHoldings(overview.holdings);
  return useMemo(() => {
    if (holdings.every((holding, index) => holding === overview.holdings[index])) return overview;
    const { totals } = overview;
    const moved =
      totals && totals.value !== null && totals.pnl !== null
        ? liveTotals(
            {
              value: totals.value,
              invested: totals.invested,
              pnl: totals.pnl,
              pnlPct: totals.pnlPct,
            },
            overview.holdings,
            holdings,
          )
        : null;
    return {
      ...overview,
      holdings,
      totals: moved && totals ? { ...totals, ...moved } : totals,
      day: dayMove(holdings) ?? overview.day,
    };
  }, [overview, holdings]);
}
