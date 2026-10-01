import { useMemo } from 'react';

import { splitLiveKey } from '@/features/market/lib/liveQuote';
import { useLiveQuotes } from '@/features/market/live';

import type { PaperPosition, QuoteRow } from './types';

/**
 * The paper book's quote map with the live feed laid over it — every row mark, the KPIs and the
 * account summary read this one map, so they all move together. Keys are the same
 * `EXCHANGE:SYMBOL` as the live store's. The polled previous close is kept (it is the baseline
 * the move is measured against); the price is the tick's.
 */
export function useLiveBookQuotes(
  positions: readonly Pick<PaperPosition, 'exchange' | 'symbol'>[],
  rest: Record<string, QuoteRow> | undefined,
): Record<string, QuoteRow> | undefined {
  const live = useLiveQuotes(positions);
  return useMemo(() => {
    if (live.size === 0) return rest;
    const merged: Record<string, QuoteRow> = { ...rest };
    for (const [key, quote] of live) {
      const base = merged[key];
      const { exchange, symbol } = splitLiveKey(key);
      merged[key] = {
        exchange: base?.exchange ?? exchange,
        symbol: base?.symbol ?? symbol,
        ltp: quote.ltp,
        prevClose: base?.prevClose ?? quote.prevClose,
      };
    }
    return merged;
  }, [live, rest]);
}
