import { apiClient } from '@/services/api/client';
import { requireFields } from '@/services/api/contract';
import { isApiError } from '@/types/api';

import {
  normalizeLibrary,
  normalizeQueued,
  normalizeReportDocument,
  normalizeReports,
  normalizeStatus,
  normalizeTrackRecord,
} from './lib/normalize';
import type {
  NextDayAction,
  NextDayStatus,
  ReportDocument,
  ReportListItem,
  StrategyLibrary,
  TrackRecordResponse,
} from './types';

// Endpoints: server/src/modules/next-day/next-day.routes.ts (spec: docs/specs/next-day.routes.yaml).
// Reads are open to every signed-in user; run / backfill / measure / morning are admin-only. A
// server without the module answers 404 "No route matches", which the client turns into
// SERVER_OUTDATED — distinct from the report's own 404 "no report yet".

const WHAT = 'The next-day scanner';
/** The report carries every listed candidate in full; a cold read can take a few seconds. */
const READ_TIMEOUT_MS = 30_000;

function shaped(data: unknown, fields: string[]): Record<string, unknown> {
  const record =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};
  return requireFields(record, fields, WHAT);
}

/** The report route's own 404 — "no report yet" / "none for that date" — is an answer. */
const isNoReport = (error: unknown) =>
  isApiError(error) && error.status === 404 && error.code !== 'SERVER_OUTDATED';

export const nextDayApi = {
  /** The newest completed report, or one session's (`YYYY-MM-DD`). null = no report yet. */
  async report(date: string | null, signal?: AbortSignal): Promise<ReportDocument | null> {
    try {
      const { data } = await apiClient.get<unknown>('/next-day/report', {
        params: date ? { date } : undefined,
        timeout: READ_TIMEOUT_MS,
        signal,
      });
      const doc = normalizeReportDocument(shaped(data, ['date', 'status']));
      if (!doc) throw new Error('The server’s answer did not describe a report.');
      return doc;
    } catch (error) {
      if (isNoReport(error)) return null;
      throw error;
    }
  },

  /** The last 30 reports, slim, newest first. */
  async reports(signal?: AbortSignal): Promise<ReportListItem[]> {
    const { data } = await apiClient.get<unknown>('/next-day/reports', { signal });
    return normalizeReports(shaped(data, ['reports']));
  },

  async library(signal?: AbortSignal): Promise<StrategyLibrary> {
    const { data } = await apiClient.get<unknown>('/next-day/strategies', {
      timeout: READ_TIMEOUT_MS,
      signal,
    });
    return normalizeLibrary(shaped(data, ['strategies']));
  },

  /** How the published picks did over the last `days` graded sessions (5–120). */
  async trackRecord(days: number, signal?: AbortSignal): Promise<TrackRecordResponse> {
    const { data } = await apiClient.get<unknown>('/next-day/track-record', {
      params: { days },
      signal,
    });
    return normalizeTrackRecord(shaped(data, ['record']));
  },

  async status(signal?: AbortSignal): Promise<NextDayStatus> {
    const { data } = await apiClient.get<unknown>('/next-day/status', { signal });
    return normalizeStatus(shaped(data, ['eod']));
  },

  /** Admin: queue a run on the screener worker. `queued: false` = one is already waiting. */
  async action(action: NextDayAction, body: Record<string, unknown> = {}) {
    const { data } = await apiClient.post<unknown>(`/next-day/${action}`, body);
    return normalizeQueued(data);
  },
};
