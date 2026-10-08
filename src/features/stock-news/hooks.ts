import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';

import { stockNewsApi } from './api';
import type { NewsSentimentFilter, NewsWindow } from './types';

/** The ten newest stories first; older ones a page at a time on "Show more". */
export const STOCK_NEWS_PAGE_SIZE = 10;

export const stockNewsKeys = {
  all: ['stocks', 'news'] as const,
  list: (exchange: string, symbol: string, days: number, sentiment: NewsSentimentFilter) =>
    ['stocks', 'news', exchange, symbol, days, sentiment] as const,
};

/**
 * The company's news with sentiment. Collected once a day, so five minutes of staleness costs
 * nothing; the previous filter's list stays on screen while the next loads. The Overview's signal
 * strip asks for the same key (30 days, every sentiment), so it costs no request of its own.
 */
export function useStockNews(
  exchange: 'NSE' | 'BSE',
  symbol: string,
  days: NewsWindow = 30,
  sentiment: NewsSentimentFilter = 'all',
  enabled = true,
) {
  return useInfiniteQuery({
    queryKey: stockNewsKeys.list(exchange, symbol, days, sentiment),
    queryFn: ({ pageParam, signal }) =>
      stockNewsApi.page(
        exchange,
        symbol,
        { days, sentiment, page: pageParam, limit: STOCK_NEWS_PAGE_SIZE },
        signal,
      ),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: enabled && symbol.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}
