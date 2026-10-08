import { useMemo } from 'react';

import { liveKey } from '@/features/market/lib/liveQuote';
import { useLiveQuotes } from '@/features/market/live';

import { repriceHolding, type HoldingView } from './lib/portfolio';

/**
 * Holdings re-priced at the live feed's prices (each row's value, returns and day move). Rows
 * without a tick yet keep their REST figures; unchanged rows keep their identity, so memoised
 * rows and the totals delta (liveTotals) skip them. A row the broker gave no day move (a
 * hand-added holding) is measured against the tick's previous close when it carries one.
 */
export function useLiveHoldings(holdings: readonly HoldingView[]): HoldingView[] {
  const quotes = useLiveQuotes(holdings);
  return useMemo(
    () =>
      holdings.map((holding) => {
        const quote = quotes.get(liveKey(holding.exchange, holding.symbol));
        return quote ? repriceHolding(holding, quote.ltp, quote.prevClose) : holding;
      }),
    [holdings, quotes],
  );
}
