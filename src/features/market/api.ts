import { env } from '@/config/env';
import { apiClient } from '@/services/api/client';

import type {
  AnalyzedArticleListResponse,
  CandlesResponse,
  CapBand,
  IndicesResponse,
  MoverKind,
  MoversResponse,
  RecentlyViewedItem,
  ScreenerDetail,
  ScreenerSummary,
  SearchResponse,
  SearchResult,
  SentimentSummary,
  StockDetail,
} from './types';

const MOVER_PATHS: Record<MoverKind, string> = {
  gainers: '/stocks/top-gainers',
  losers: '/stocks/top-losers',
  volume: '/stocks/top-volume',
};

/** Company logos are a public static route on the API host (outside /api/v1, no auth). */
export function stockLogoUrl(symbol: string): string {
  return `${env.serverOrigin}/images/${encodeURIComponent(symbol)}.png`;
}

export const marketApi = {
  /**
   * Needs the user's own broker — 404 without one, 409 BROKER_SESSION_EXPIRED when it has
   * lapsed; the /indices socket covers everyone.
   */
  async indices(): Promise<IndicesResponse> {
    const { data } = await apiClient.get<IndicesResponse>('/market/indices');
    return data;
  },

  /**
   * NSE only: unfiltered rankings span both exchanges, so a company can appear twice and
   * BSE rows carry numeric scrip codes as their symbol.
   */
  async movers(kind: MoverKind, options: { limit: number; cap?: CapBand; signal?: AbortSignal }) {
    const { data } = await apiClient.get<MoversResponse>(MOVER_PATHS[kind], {
      params: {
        exchange: 'NSE',
        limit: options.limit,
        ...(options.cap ? { cap: options.cap } : {}),
      },
      signal: options.signal,
    });
    return data.movers;
  },

  async search(query: string, limit: number, signal?: AbortSignal): Promise<SearchResult[]> {
    const { data } = await apiClient.get<SearchResponse>('/stocks/search', {
      params: { q: query, limit },
      signal,
    });
    return data.results;
  },

  async recentlyViewed(limit = 12): Promise<RecentlyViewedItem[]> {
    const { data } = await apiClient.get<{ items: RecentlyViewedItem[] }>(
      '/stocks/recently-viewed',
      {
        params: { limit },
      },
    );
    return data.items;
  },

  async recordView(exchange: string, symbol: string): Promise<void> {
    await apiClient.post('/stocks/recently-viewed', { exchange, symbol });
  },

  /** Clears the signed-in user's whole recently-viewed strip. */
  async clearRecentlyViewed(): Promise<{ cleared: number }> {
    const { data } = await apiClient.delete<{ cleared: number }>('/stocks/recently-viewed');
    return data;
  },

  async stock(symbol: string, exchange: string, signal?: AbortSignal): Promise<StockDetail> {
    const { data } = await apiClient.get<StockDetail>(`/stocks/${encodeURIComponent(symbol)}`, {
      params: { exchange },
      signal,
    });
    return data;
  },

  /** `to` (unix seconds): bars ending before it — how a chart scrolls back into history. */
  async candles(
    params: { exchange: string; symbol: string; minutesPerBar: number; count: number; to?: number },
    signal?: AbortSignal,
  ) {
    const { data } = await apiClient.get<CandlesResponse>('/market/candles', { params, signal });
    return data.candles;
  },

  async sentiment(symbols: string[], days = 30): Promise<SentimentSummary> {
    const { data } = await apiClient.get<SentimentSummary>('/news/analysis/summary', {
      params: { symbols: symbols.join(','), days },
    });
    return data;
  },

  async screeners(): Promise<ScreenerSummary[]> {
    const { data } = await apiClient.get<{ screeners: ScreenerSummary[] }>('/screeners');
    return data.screeners;
  },

  async screener(id: string, limit = 50): Promise<ScreenerDetail> {
    const { data } = await apiClient.get<ScreenerDetail>(`/screeners/${encodeURIComponent(id)}`, {
      params: { limit },
    });
    return data;
  },

  async news(page = 1, pageSize = 20): Promise<AnalyzedArticleListResponse> {
    const { data } = await apiClient.get<AnalyzedArticleListResponse>('/news/analysis', {
      params: { page, pageSize, sortBy: 'impact' },
    });
    return data;
  },
};
