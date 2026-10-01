import { apiClient } from '@/services/api/client';

import type {
  AnalysisListQuery,
  AnalysisListResponse,
  AnalysisResponse,
  AnalysisView,
  HistoryPoint,
  JobView,
} from './types';

const key = (symbolOrIsin: string) => encodeURIComponent(symbolOrIsin);

/**
 * /stocks/{symbol}/analysis and /fundamentals/* — the same calls as the web client's
 * fundamentals.service.ts. A GET never needs a job started by hand: the server serves a fresh
 * analysis, attaches to one in flight, or starts one, and says which in `state`.
 */
export const fundamentalsApi = {
  async analysis(
    symbolOrIsin: string,
    exchange: 'NSE' | 'BSE' | undefined,
    signal?: AbortSignal,
  ): Promise<AnalysisResponse> {
    const { data } = await apiClient.get<AnalysisResponse>(
      `/stocks/${key(symbolOrIsin)}/analysis`,
      {
        params: exchange ? { exchange } : undefined,
        signal,
      },
    );
    return data;
  },

  /** A fresh analysis (users: once per stock per 24 h — a 429 says when). */
  async refresh(symbolOrIsin: string, exchange?: 'NSE' | 'BSE'): Promise<AnalysisResponse> {
    const { data } = await apiClient.post<AnalysisResponse>(
      `/stocks/${key(symbolOrIsin)}/analysis/refresh`,
      undefined,
      { params: exchange ? { exchange } : undefined },
    );
    return data;
  },

  /** The weekly rating trend, oldest first. */
  async history(
    symbolOrIsin: string,
    weeks = 12,
    signal?: AbortSignal,
  ): Promise<{ isin: string | null; points: HistoryPoint[] }> {
    const { data } = await apiClient.get<{ isin: string | null; points: HistoryPoint[] }>(
      `/stocks/${key(symbolOrIsin)}/analysis/history`,
      { params: { weeks }, signal },
    );
    return data;
  },

  /** One job — the progress poll while an analysis is being produced. */
  async job(
    jobId: string,
    signal?: AbortSignal,
  ): Promise<{ job: JobView; analysis: AnalysisView | null }> {
    const { data } = await apiClient.get<{ job: JobView; analysis: AnalysisView | null }>(
      `/fundamentals/jobs/${encodeURIComponent(jobId)}`,
      { signal },
    );
    return data;
  },

  /** Every stock's latest saved analysis, filtered, sorted and paged server-side. */
  async list(query: AnalysisListQuery, signal?: AbortSignal): Promise<AnalysisListResponse> {
    const params: Record<string, string | number> = {};
    if (query.verdict && query.verdict.length > 0) params.verdict = query.verdict.join(',');
    if (query.index) params.index = query.index;
    if (query.sector) params.sector = query.sector;
    if (query.q && query.q.trim()) params.q = query.q.trim().slice(0, 40);
    if (query.sort) params.sort = query.sort;
    if (query.dir) params.dir = query.dir;
    if (query.page) params.page = query.page;
    if (query.limit) params.limit = query.limit;
    const { data } = await apiClient.get<AnalysisListResponse>('/fundamentals/analyses', {
      params,
      signal,
    });
    return data;
  },
};
