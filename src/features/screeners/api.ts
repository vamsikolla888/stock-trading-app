import { apiClient } from '@/services/api/client';

import type {
  CustomScreener,
  CustomScreenerInput,
  QueueCustomScanResult,
  RunAllScansResult,
  ScreenerDetail,
  ScreenerPreview,
  ScreenerPreviewMatches,
  ScreenerScanStatus,
} from './types';

const customPath = (id: string) => `/screeners/custom/${encodeURIComponent(id)}`;

/** Same endpoints as the web client's screeners.service.ts. */
export const screenersApi = {
  /** A built-in screener with its matches (the server caps `limit` at 100). */
  async builtIn(id: string, limit = 100): Promise<ScreenerDetail> {
    const { data } = await apiClient.get<ScreenerDetail>(`/screeners/${encodeURIComponent(id)}`, {
      params: { limit },
    });
    return data;
  },
  /** The shared library, without matches. */
  async customList(): Promise<CustomScreener[]> {
    const { data } = await apiClient.get<{ screeners: CustomScreener[] }>('/screeners/custom');
    return data.screeners;
  },
  async custom(id: string, limit = 200): Promise<CustomScreener> {
    const { data } = await apiClient.get<CustomScreener>(customPath(id), { params: { limit } });
    return data;
  },
  async create(body: CustomScreenerInput): Promise<CustomScreener> {
    const { data } = await apiClient.post<CustomScreener>('/screeners/custom', body);
    return data;
  },
  async update(id: string, body: Partial<CustomScreenerInput>): Promise<CustomScreener> {
    const { data } = await apiClient.patch<CustomScreener>(customPath(id), body);
    return data;
  },
  async remove(id: string): Promise<void> {
    await apiClient.delete(customPath(id));
  },
  /** A copy with the rules and universe, no matches — named "<name> (copy)". */
  async duplicate(id: string): Promise<CustomScreener> {
    const { data } = await apiClient.post<CustomScreener>(`${customPath(id)}/duplicate`);
    return data;
  },
  /**
   * Queues a scan. There is no per-screener status endpoint any more: the screener's own
   * `runState` (read with the queue consulted) is the answer, polled while `active`.
   */
  async runCustomScan(id: string): Promise<QueueCustomScanResult> {
    const { data } = await apiClient.post<QueueCustomScanResult>(`${customPath(id)}/scan`);
    return data;
  },
  /** "Run all": the built-in scan plus a sweep of the whole library. */
  async runAll(): Promise<RunAllScansResult> {
    const { data } = await apiClient.post<RunAllScansResult>('/screeners/custom/scan-all');
    return data;
  },
  /** The built-in scan's and the library sweep's state, from their own jobs. */
  async status(): Promise<ScreenerScanStatus> {
    const { data } = await apiClient.get<ScreenerScanStatus>('/screeners/status');
    return data;
  },
  /** A live check of a draft — issues, lint, the rule in words. Never a 422. */
  async preview(
    draft: Omit<CustomScreenerInput, 'name' | 'description'>,
    signal?: AbortSignal,
  ): Promise<ScreenerPreview> {
    const { data } = await apiClient.post<ScreenerPreview>('/screeners/custom/preview', draft, {
      signal,
    });
    return data;
  },
  /** "Test now": the draft evaluated on the latest bar, inline (a few seconds). */
  async previewMatches(
    draft: Omit<CustomScreenerInput, 'name' | 'description'>,
    limit = 25,
  ): Promise<ScreenerPreviewMatches> {
    const { data } = await apiClient.post<ScreenerPreviewMatches>(
      '/screeners/custom/preview/matches',
      { ...draft, limit },
      { timeout: 45_000 },
    );
    return data;
  },
};
