import { apiClient } from '@/services/api/client';

import type {
  HeatmapIndexSummary,
  HeatmapProvider,
  HeatmapTimeframe,
  MarketHeatmapResponse,
} from './types';

export const heatmapApi = {
  async indices(): Promise<HeatmapIndexSummary[]> {
    const { data } = await apiClient.get<{ indices: HeatmapIndexSummary[] }>('/indices');
    return data.indices;
  },

  async heatmap(
    indexKey: string,
    timeframe: HeatmapTimeframe,
    provider: HeatmapProvider,
    signal?: AbortSignal,
  ): Promise<MarketHeatmapResponse> {
    const { data } = await apiClient.get<MarketHeatmapResponse>(
      `/indices/${encodeURIComponent(indexKey)}/heatmap`,
      { params: { timeframe, provider }, signal },
    );
    return data;
  },
};
