import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/services/api/client';

import type { JobView } from './types';

// /admin/fundamentals/* — the weekly batch, its queues and its index list (web: Admin ›
// Fundamentals). Shapes mirror the web client's fundamentals.service.ts admin section.

export interface BatchRunView {
  id: string;
  weekKey: string;
  status: string;
  trigger: string;
  total: number;
  enqueued: number;
  completed: number;
  failed: number;
  skipped: number;
  partial: number;
  insufficient: number;
  startedAt: string;
  finishedAt: string | null;
  tokens: number;
  costUsd: number;
  unpricedCalls: number;
  alerts: string[];
}

export interface FundamentalsOverview {
  frameworkVersion: string;
  schedulerEnabled: boolean;
  weeklyCron: string;
  /** As a worker registered it; null = no worker has scheduled the weekly run. */
  schedule: { pattern: string; nextRunAt: string | null } | null;
  queues: Record<string, Record<string, number>> | null;
  jobsByStatus: { status: string; priority: string; count: number }[];
  failedLast24h: number;
  stageAvgMs: Record<string, number | null>;
  highWaitP95Seconds: number | null;
  currentBatch: BatchRunView | null;
  lastBatch: BatchRunView | null;
  ai: {
    today: { tokens: number; cost: number; n: number };
    onDemandBudget: {
      day: string;
      calls: number;
      usd: number;
      tokens: number;
      callCap: number;
      usdCap: number;
      exceeded: boolean;
    };
  };
  provider: { ok: number; error: number; errorRatePct: number | null };
  alerts: string[];
}

export interface FailedJobView {
  id: string;
  isin: string;
  symbol: string;
  exchange: string;
  companyName: string;
  priority: string;
  status: string;
  source: string;
  attempts: number;
  error: string | null;
  retryable: boolean | null;
  finishedAt: string | null;
}

export interface IndexConfigView {
  key: string;
  label: string;
  exchange: 'NSE' | 'BSE';
  enabled: boolean;
  kind: 'catalog' | 'custom';
  url: string | null;
  expectedCount: number | null;
  updatedAt: string | null;
}

export const fundamentalsAdminApi = {
  async overview(): Promise<FundamentalsOverview> {
    const { data } = await apiClient.get<FundamentalsOverview>('/admin/fundamentals/overview');
    return data;
  },
  async startBatch(): Promise<{ status: string; batchRunId: string | null; message?: string }> {
    const { data } = await apiClient.post<{
      status: string;
      batchRunId: string | null;
      message?: string;
    }>('/admin/fundamentals/batch-runs');
    return data;
  },
  async failedJobs(): Promise<FailedJobView[]> {
    const { data } = await apiClient.get<FailedJobView[]>('/admin/fundamentals/jobs/failed');
    return data;
  },
  async retry(id: string): Promise<{ job: JobView; created: boolean }> {
    const { data } = await apiClient.post<{ job: JobView; created: boolean }>(
      `/admin/fundamentals/jobs/${encodeURIComponent(id)}/retry`,
    );
    return data;
  },
  async indices(): Promise<IndexConfigView[]> {
    const { data } = await apiClient.get<IndexConfigView[]>('/admin/fundamentals/indices');
    return data;
  },
  async setIndexEnabled(key: string, enabled: boolean): Promise<IndexConfigView[]> {
    const { data } = await apiClient.put<IndexConfigView[]>(
      `/admin/fundamentals/indices/${encodeURIComponent(key)}`,
      { enabled },
    );
    return data;
  },
};

const keys = {
  overview: ['admin', 'fundamentals', 'overview'] as const,
  failed: ['admin', 'fundamentals', 'failed'] as const,
  indices: ['admin', 'fundamentals', 'indices'] as const,
};

/** Polls while a batch is running, so its progress bar moves on its own. */
export function useFundamentalsOverview() {
  return useQuery({
    queryKey: keys.overview,
    queryFn: fundamentalsAdminApi.overview,
    staleTime: 10_000,
    refetchInterval: (query) => (query.state.data?.currentBatch ? 10_000 : false),
  });
}

export function useFailedFundamentalJobs() {
  return useQuery({
    queryKey: keys.failed,
    queryFn: fundamentalsAdminApi.failedJobs,
    staleTime: 15_000,
  });
}

export function useFundamentalIndices() {
  return useQuery({
    queryKey: keys.indices,
    queryFn: fundamentalsAdminApi.indices,
    staleTime: 60_000,
  });
}

export function useFundamentalsAdminActions() {
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['admin', 'fundamentals'] });
  return {
    startBatch: useMutation({ mutationFn: fundamentalsAdminApi.startBatch, onSettled: refresh }),
    retry: useMutation({
      mutationFn: (id: string) => fundamentalsAdminApi.retry(id),
      onSettled: refresh,
    }),
    setIndexEnabled: useMutation({
      mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
        fundamentalsAdminApi.setIndexEnabled(key, enabled),
      onSuccess: (indices) => queryClient.setQueryData(keys.indices, indices),
    }),
  };
}
