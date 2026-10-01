import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { isApiError } from '@/types/api';

import { fundamentalsApi } from './api';
import { isJobActive, jobTakingLong } from './lib/format';
import type { AnalysisListQuery, AnalysisResponse } from './types';

export const fundamentalsKeys = {
  all: ['fundamentals'] as const,
  analysis: (symbol: string, exchange: string) =>
    ['fundamentals', 'analysis', symbol, exchange] as const,
  history: (symbol: string) => ['fundamentals', 'history', symbol] as const,
  job: (jobId: string | null) => ['fundamentals', 'job', jobId] as const,
  list: (query: Omit<AnalysisListQuery, 'page'>) => ['fundamentals', 'list', query] as const,
};

/** A 4xx (bar a rate limit) answers the same way again; only transient failures retry. */
const retryTransient = (count: number, error: unknown) =>
  count < 2 &&
  !(isApiError(error) && error.status > 0 && error.status < 500 && error.status !== 429);

/** Weekly batch data — it changes at most a few times a week, so it is cached generously. */
export function useFundamentalAnalysis(symbol: string, exchange: 'NSE' | 'BSE', enabled = true) {
  return useQuery({
    queryKey: fundamentalsKeys.analysis(symbol, exchange),
    queryFn: ({ signal }) => fundamentalsApi.analysis(symbol, exchange, signal),
    enabled: enabled && symbol.length > 0,
    staleTime: 10 * 60_000,
    retry: retryTransient,
  });
}

/**
 * Follows the job producing an analysis (the web's socket fallback, which is all a phone needs:
 * a few seconds of latency on a result that takes a minute). Backs off from 3 s to 15 s, stops
 * ten minutes after the job was created (see jobTakingLong), and when the job finishes
 * refreshes the analysis it produced.
 */
export function useFundamentalJob(
  symbol: string,
  exchange: 'NSE' | 'BSE',
  jobId: string | null,
  enabled: boolean,
) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: fundamentalsKeys.job(jobId),
    queryFn: async ({ signal }) => {
      const result = await fundamentalsApi.job(jobId!, signal);
      if (!isJobActive(result.job)) {
        void queryClient.invalidateQueries({
          queryKey: fundamentalsKeys.analysis(symbol, exchange),
        });
        void queryClient.invalidateQueries({ queryKey: fundamentalsKeys.history(symbol) });
      }
      return result;
    },
    enabled: enabled && jobId !== null,
    retry: retryTransient,
    refetchInterval: (q) => {
      const job = q.state.data?.job;
      if (job && !isJobActive(job)) return false;
      if (job && jobTakingLong(job, Date.now())) return false;
      return Math.min(15_000, 3_000 + q.state.dataUpdateCount * 1_500);
    },
  });
}

/** Forces a new analysis. The answer carries the job; the section follows it from there. */
export function useRefreshFundamentals(symbol: string, exchange: 'NSE' | 'BSE') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => fundamentalsApi.refresh(symbol, exchange),
    onSuccess: (response: AnalysisResponse) =>
      queryClient.setQueryData(fundamentalsKeys.analysis(symbol, exchange), response),
  });
}

export function useFundamentalHistory(symbol: string, enabled: boolean) {
  return useQuery({
    queryKey: fundamentalsKeys.history(symbol),
    queryFn: ({ signal }) => fundamentalsApi.history(symbol, 12, signal),
    enabled: enabled && symbol.length > 0,
    staleTime: 60 * 60_000,
    retry: retryTransient,
  });
}

const LIST_PAGE = 30;

/** The Stock analysis list, paged for an infinite scroll. */
export function useFundamentalList(query: Omit<AnalysisListQuery, 'page' | 'limit'>) {
  return useInfiniteQuery({
    queryKey: fundamentalsKeys.list(query),
    queryFn: ({ pageParam, signal }) =>
      fundamentalsApi.list({ ...query, page: pageParam, limit: LIST_PAGE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page < last.pages ? last.page + 1 : undefined),
    staleTime: 3 * 60_000,
    placeholderData: keepPreviousData,
    retry: retryTransient,
  });
}
