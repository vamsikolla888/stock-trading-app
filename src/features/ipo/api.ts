import { apiClient } from '@/services/api/client';

import {
  normalizeAnalytics,
  normalizeGmpHistory,
  normalizeIpo,
  normalizeIpoList,
  normalizeLiveGmp,
  normalizeReports,
} from './lib/normalize';
import type {
  GmpPoint,
  IpoAnalytics,
  IpoListFilter,
  IpoListResult,
  IpoRecord,
  IpoReportKind,
  IpoReports,
  ReportRequestResult,
} from './types';

// Endpoints: server/src/modules/ipo/ipo.routes.ts (spec: docs/specs/ipo.routes.yaml). The server
// reads its own synced copy of the source; a page view never calls InvestorGain directly.

const LIST_PATHS: Record<IpoListFilter, string> = {
  all: '/ipo',
  upcoming: '/ipo/upcoming',
  open: '/ipo/open',
  closed: '/ipo/closed',
  listed: '/ipo/listed',
};

/** A cold board triggers a source sync before answering, which can outlast the default 15 s. */
const LIST_TIMEOUT_MS = 30_000;

const path = (id: string) => `/ipo/${encodeURIComponent(id)}`;

export const ipoApi = {
  async list(filter: IpoListFilter, signal?: AbortSignal): Promise<IpoListResult> {
    const { data } = await apiClient.get<unknown>(LIST_PATHS[filter], {
      timeout: LIST_TIMEOUT_MS,
      signal,
    });
    return normalizeIpoList(data);
  },

  /** Non-listed issues with a grey-market premium, highest premium first. */
  async liveGmp(signal?: AbortSignal): Promise<IpoRecord[]> {
    const { data } = await apiClient.get<unknown>('/ipo/gmp/live', {
      timeout: LIST_TIMEOUT_MS,
      signal,
    });
    return normalizeLiveGmp(data);
  },

  /** Answers for an IPO off the board too — its page stays reachable through the holding week. */
  async detail(id: string, signal?: AbortSignal): Promise<IpoRecord> {
    const { data } = await apiClient.get<unknown>(path(id), { signal });
    const ipo = normalizeIpo(data);
    if (!ipo) throw new Error('The server’s answer did not describe an IPO.');
    return ipo;
  },

  async gmpHistory(id: string, signal?: AbortSignal): Promise<GmpPoint[]> {
    const { data } = await apiClient.get<unknown>(`${path(id)}/gmp/history`, { signal });
    return normalizeGmpHistory(data);
  },

  async analytics(id: string, signal?: AbortSignal): Promise<IpoAnalytics> {
    const { data } = await apiClient.get<unknown>(`${path(id)}/analytics`, { signal });
    return normalizeAnalytics(data);
  },

  async reports(id: string, signal?: AbortSignal): Promise<IpoReports> {
    const { data } = await apiClient.get<unknown>(`${path(id)}/reports`, { signal });
    return normalizeReports(data);
  },

  /**
   * Queues one report. Answers without queuing while one is being prepared or a complete one is
   * fresh; 422 outside the report's window. Rate-limited to 6 a minute.
   */
  async requestReport(id: string, kind: IpoReportKind): Promise<ReportRequestResult> {
    const { data } = await apiClient.post<Partial<ReportRequestResult>>(
      `${path(id)}/reports/${kind}`,
      {},
    );
    return {
      queued: data?.queued === true,
      reason: data?.reason === 'in-progress' || data?.reason === 'fresh' ? data.reason : null,
    };
  },
};
