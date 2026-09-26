import { apiClient } from '@/services/api/client';

import type {
  AnalyzedArticleDetail,
  AnalyzedArticleListResponse,
  NewsFilters,
  NewsRunListResponse,
} from './types';

/** Drops undefined keys: the server's query schema is strict. */
function compact(filters: NewsFilters & { page: number }): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params[key] = value as string | number;
  }
  return params;
}

export const newsApi = {
  async list(
    filters: NewsFilters & { page: number },
    signal?: AbortSignal,
  ): Promise<AnalyzedArticleListResponse> {
    const { data } = await apiClient.get<AnalyzedArticleListResponse>('/news/analysis', {
      params: compact(filters),
      signal,
    });
    return data;
  },

  async article(newsId: string, signal?: AbortSignal): Promise<AnalyzedArticleDetail> {
    const { data } = await apiClient.get<AnalyzedArticleDetail>(
      `/news/analysis/${encodeURIComponent(newsId)}`,
      { signal },
    );
    return data;
  },

  /** Re-queues a FAILED analysis (the server answers 422 for any other state). */
  async retry(newsId: string): Promise<{ newsId: string; status: 'queued' }> {
    const { data } = await apiClient.post<{ newsId: string; status: 'queued' }>(
      `/news/analysis/${encodeURIComponent(newsId)}/retry`,
    );
    return data;
  },

  async runs(pageSize = 3): Promise<NewsRunListResponse> {
    const { data } = await apiClient.get<NewsRunListResponse>('/news/runs', {
      params: { page: 1, pageSize },
    });
    return data;
  },
};
