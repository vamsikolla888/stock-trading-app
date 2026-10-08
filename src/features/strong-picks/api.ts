import { apiClient } from '@/services/api/client';

import {
  normalizeAnalytics,
  normalizeGenerate,
  normalizeStrongPicks,
  normalizeSweep,
} from './lib/normalize';
import type {
  GenerateStrongPicksResult,
  MonitorSweepResult,
  StrongPickAnalytics,
  StrongPicksResponse,
} from './types';

// Endpoints: server/src/modules/recommendations/recommendation.routes.ts
// (spec: docs/specs/recommendation.routes.yaml).

export const strongPicksApi = {
  /** Today's review, or one exact `YYYY-MM-DD` day (e.g. the last day that published). */
  async get(date?: string, signal?: AbortSignal): Promise<StrongPicksResponse> {
    const { data } = await apiClient.get<unknown>('/recommendations/strong-picks', {
      params: date ? { date } : undefined,
      signal,
    });
    return normalizeStrongPicks(data);
  },
  /** The track record over the last `days` (7–180). New in 2026-10 — older servers 404. */
  async analytics(days: number, signal?: AbortSignal): Promise<StrongPickAnalytics> {
    const { data } = await apiClient.get<unknown>('/recommendations/strong-picks/analytics', {
      params: { days },
      signal,
    });
    return normalizeAnalytics(data);
  },
  /** Samples the published picks now rather than waiting for the next minute's cron. */
  async sweep(): Promise<MonitorSweepResult> {
    const { data } = await apiClient.post<unknown>('/recommendations/strong-picks/monitor/sweep');
    return normalizeSweep(data);
  },
  /** Admin: re-runs the 09:30 review (a model call; replaces the day's published set). */
  async generate(): Promise<GenerateStrongPicksResult> {
    const { data } = await apiClient.post<unknown>('/recommendations/strong-picks/generate');
    return normalizeGenerate(data);
  },
};
