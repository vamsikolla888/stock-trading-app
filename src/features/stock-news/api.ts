import { apiClient } from '@/services/api/client';

import { normalizeStockNews } from './lib/normalize';
import type { NewsSentimentFilter, StockNewsPage } from './types';

/**
 * GET /stocks/:symbol/news (server: modules/stock-news/stock-news.routes.ts). Read-only — a page
 * view never starts a search; the NSE and BSE listings of a company answer with the same news.
 */
export const stockNewsApi = {
  async page(
    exchange: 'NSE' | 'BSE',
    symbol: string,
    query: { days: number; sentiment: NewsSentimentFilter; page: number; limit: number },
    signal?: AbortSignal,
  ): Promise<StockNewsPage> {
    const { data } = await apiClient.get<unknown>(`/stocks/${encodeURIComponent(symbol)}/news`, {
      params: { exchange, ...query },
      signal,
    });
    return normalizeStockNews(data);
  },
};
