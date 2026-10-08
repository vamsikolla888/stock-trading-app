import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIsFocused } from 'expo-router';

import { agentsApi } from './api';
import { isActiveJob, summaryPollMs } from './lib/view';
import type { ResearchPage, ResearchRequest } from './types';

/**
 * REFRESH POLICY. Every query is `subscribed: focused`, so a covered screen (another tab, a pushed
 * screen) neither polls nor re-renders and catches up when shown again.
 *   - Hub: every 30 s while a review or a research run is in flight, else every 2 minutes.
 *   - Portfolio review: every 20 s while any holding is being reviewed (the server collects
 *     finished results on read, at most every 20 s), else every 5 minutes — the schedule is hourly.
 *   - Research list: every 10 s while a run is in flight; research job: every 5 s until it ends.
 * Mutations never update optimistically: they invalidate, and the screen shows the server's state.
 */

export const agentsKeys = {
  all: ['agents'] as const,
  summary: ['agents', 'summary'] as const,
  portfolio: ['agents', 'portfolio-review'] as const,
  research: ['agents', 'web-research'] as const,
  researchList: ['agents', 'web-research', 'list'] as const,
  researchDetail: (jobId: string) => ['agents', 'web-research', 'job', jobId] as const,
};

export function useAgentsSummary() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: agentsKeys.summary,
    queryFn: ({ signal }) => agentsApi.summary(signal),
    staleTime: 30_000,
    refetchInterval: (query) => summaryPollMs(query.state.data),
    subscribed: focused,
  });
}

export function usePortfolioReview() {
  const focused = useIsFocused();
  return useQuery({
    queryKey: agentsKeys.portfolio,
    queryFn: ({ signal }) => agentsApi.portfolioReview(signal),
    staleTime: 30_000,
    refetchInterval: (query) => ((query.state.data?.counts.inFlight ?? 0) > 0 ? 20_000 : 300_000),
    subscribed: focused,
  });
}

export function useSetPortfolioReviewEnabled() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => agentsApi.setPortfolioReviewEnabled(enabled),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: agentsKeys.portfolio }),
        client.invalidateQueries({ queryKey: agentsKeys.summary }),
      ]),
  });
}

export function useRunPortfolioReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => agentsApi.runPortfolioReview(),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: agentsKeys.portfolio }),
        client.invalidateQueries({ queryKey: agentsKeys.summary }),
      ]),
  });
}

const anyActive = (pages: readonly ResearchPage[] | undefined) =>
  (pages ?? []).some((page) => page.items.some((item) => isActiveJob(item.status)));

/** Admin. Paged by `nextBefore`; only the first page carries the headline figures shown. */
export function useResearchList(enabled: boolean) {
  const focused = useIsFocused();
  return useInfiniteQuery({
    queryKey: agentsKeys.researchList,
    queryFn: ({ pageParam, signal }) => agentsApi.researchList(pageParam, signal),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextBefore ?? undefined,
    enabled,
    staleTime: 30_000,
    refetchInterval: (query) => (anyActive(query.state.data?.pages) ? 10_000 : false),
    subscribed: focused,
  });
}

/** Admin. Polled while the run is queued or researching; a finished run never changes. */
export function useResearchDetail(jobId: string, enabled: boolean) {
  const focused = useIsFocused();
  return useQuery({
    queryKey: agentsKeys.researchDetail(jobId),
    queryFn: ({ signal }) => agentsApi.researchDetail(jobId, signal),
    enabled: enabled && jobId.length > 0,
    staleTime: (query) =>
      query.state.data && !isActiveJob(query.state.data.status) ? 10 * 60_000 : 0,
    refetchInterval: (query) => {
      const data = query.state.data;
      // A run that could not be read (not found, admins only) is not polled into the ground.
      if (!data) return query.state.status === 'error' ? false : 5_000;
      return isActiveJob(data.status) ? 5_000 : false;
    },
    subscribed: focused,
  });
}

export function useAskResearch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ResearchRequest) => agentsApi.askResearch(input),
    onSuccess: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: agentsKeys.researchList }),
        client.invalidateQueries({ queryKey: agentsKeys.summary }),
      ]),
  });
}
