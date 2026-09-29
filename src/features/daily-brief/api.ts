import { apiClient } from '@/services/api/client';

import {
  normalizeAudio,
  normalizeBrief,
  normalizeDates,
  normalizePreferences,
} from './lib/normalize';
import type {
  DailyBrief,
  DailyBriefAudio,
  DailyBriefPreferences,
  DailyBriefRiskProfile,
} from './types';

// Endpoints: server/src/modules/daily-brief/daily-brief.routes.ts (spec: docs/specs/daily-brief.routes.yaml).
// The query schema is .strict() — send exactly date, mode and riskProfile, nothing else.

/**
 * Today's brief is assembled from ten sources on a cache miss (indices, NIFTY 500 breadth,
 * movers, the NIFTY chain, portfolio, watchlists, news, signals), which can outlast the
 * app-wide 15 s timeout.
 */
const BRIEF_TIMEOUT_MS = 45_000;
/** Refresh also runs the AI analysis before answering. */
const REFRESH_TIMEOUT_MS = 120_000;

function briefParams(date: string, riskProfile: DailyBriefRiskProfile) {
  return { date, mode: 'auto', riskProfile };
}

export const dailyBriefApi = {
  async brief(
    date: string,
    riskProfile: DailyBriefRiskProfile,
    signal?: AbortSignal,
  ): Promise<DailyBrief> {
    const { data } = await apiClient.get<unknown>('/market/daily-brief', {
      params: briefParams(date, riskProfile),
      timeout: BRIEF_TIMEOUT_MS,
      signal,
    });
    return normalizeBrief(data);
  },

  /** Rebuilds today's brief with a fresh AI analysis. Rate-limited to 6 per 10 minutes. */
  async refresh(date: string, riskProfile: DailyBriefRiskProfile): Promise<DailyBrief> {
    const { data } = await apiClient.post<unknown>(
      '/market/daily-brief/refresh',
      {},
      { params: briefParams(date, riskProfile), timeout: REFRESH_TIMEOUT_MS },
    );
    return normalizeBrief(data);
  },

  /** Past days with a stored brief, newest first (at most 60). */
  async dates(): Promise<string[]> {
    const { data } = await apiClient.get<unknown>('/market/daily-brief/dates');
    return normalizeDates(data);
  },

  async preferences(): Promise<DailyBriefPreferences> {
    const { data } = await apiClient.get<unknown>('/market/daily-brief/preferences');
    return normalizePreferences(data);
  },

  async updatePreferences(patch: Partial<DailyBriefPreferences>): Promise<DailyBriefPreferences> {
    const { data } = await apiClient.patch<unknown>('/market/daily-brief/preferences', patch);
    return normalizePreferences(data);
  },

  /** The narration script. The device speaks it — the server has no TTS provider. */
  async audio(date: string, riskProfile: DailyBriefRiskProfile): Promise<DailyBriefAudio> {
    const { data } = await apiClient.get<unknown>(
      `/market/daily-brief/${encodeURIComponent(date)}/audio`,
      { params: { riskProfile }, timeout: BRIEF_TIMEOUT_MS },
    );
    return normalizeAudio(data);
  },
};
