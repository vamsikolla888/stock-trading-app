import { apiClient } from '@/services/api/client';

import type { StrongPicksResponse } from './types';

export const strongPicksApi = {
  /** Today's review, or one exact `YYYY-MM-DD` day (e.g. the last day that published). */
  async get(date?: string, signal?: AbortSignal): Promise<StrongPicksResponse> {
    const { data } = await apiClient.get<StrongPicksResponse>('/recommendations/strong-picks', {
      params: date ? { date } : undefined,
      signal,
    });
    return data;
  },
};
