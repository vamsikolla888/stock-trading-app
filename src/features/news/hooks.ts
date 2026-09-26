import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';

import { useNow } from '@/hooks/useNow';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

import { newsApi } from './api';
import { HOUR_MS, newsWindowStart } from './lib/news';
import type { AnalyzedArticleListResponse, NewsFilters } from './types';

export const NEWS_PAGE_SIZE = 20;

export const newsKeys = {
  all: ['news-analysis'] as const,
  lists: () => [...newsKeys.all, 'list'] as const,
  list: (filters: NewsFilters) => [...newsKeys.lists(), filters] as const,
  article: (newsId: string) => [...newsKeys.all, 'article', newsId] as const,
  runs: (pageSize: number) => [...newsKeys.all, 'runs', pageSize] as const,
};

/** The page after `last`, or undefined once every row has been fetched. */
export function nextNewsPage(last: AnalyzedArticleListResponse): number | undefined {
  return last.page * last.pageSize < last.total && last.items.length > 0
    ? last.page + 1
    : undefined;
}

/** The analysed-news feed for one filter set, a page at a time ("load more" on scroll). */
export function useNewsFeed(filters: NewsFilters) {
  const query = { pageSize: NEWS_PAGE_SIZE, ...filters };
  return useInfiniteQuery({
    queryKey: newsKeys.list(query),
    queryFn: ({ pageParam, signal }) => newsApi.list({ ...query, page: pageParam }, signal),
    initialPageParam: 1,
    getNextPageParam: nextNewsPage,
    staleTime: 2 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** One article with its analysis. Re-checks every 15 s while the analysis is still running. */
export function useArticle(newsId: string) {
  return useQuery({
    queryKey: newsKeys.article(newsId),
    queryFn: ({ signal }) => newsApi.article(newsId, signal),
    enabled: newsId.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: (query) => {
      const status = query.state.data?.job?.status;
      return status === 'queued' || status === 'processing' ? 15_000 : false;
    },
  });
}

/**
 * The company's analysed news over the last 30 days, newest first — the stock page's News
 * tab. The window start moves once an hour, so the query key stays stable in between.
 */
export function useStockNews(stockSymbol: string, enabled = true) {
  const from = newsWindowStart(useNow(HOUR_MS));
  const filters: NewsFilters = {
    pageSize: 10,
    stockSymbol: stockSymbol.toUpperCase(),
    from,
    sortBy: 'date',
  };
  return useQuery({
    queryKey: newsKeys.list(filters),
    queryFn: ({ signal }) => newsApi.list({ ...filters, page: 1 }, signal),
    enabled: enabled && stockSymbol.length > 0,
    staleTime: 5 * 60_000,
  });
}

/** Recent ingestion batches — Today's activity rows. Runs a few times a day; no polling. */
export function useNewsRuns(pageSize = 3) {
  return useQuery({
    queryKey: newsKeys.runs(pageSize),
    queryFn: () => newsApi.runs(pageSize),
    staleTime: 5 * 60_000,
  });
}

/**
 * Re-queues a failed analysis. On success the row reads "Analyzing…" everywhere it is
 * cached straight away (the pipeline updates it again when the retry finishes), and the
 * article screen refetches.
 */
export function useRetryAnalysis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newsId: string) => newsApi.retry(newsId),
    onSuccess: (_result, newsId) => {
      queryClient.setQueriesData<InfiniteData<AnalyzedArticleListResponse>>(
        { queryKey: newsKeys.lists() },
        (old) =>
          old && Array.isArray(old.pages)
            ? {
                ...old,
                pages: old.pages.map((page) => ({
                  ...page,
                  items: page.items.map((item) =>
                    item.newsId === newsId
                      ? { ...item, jobStatus: 'queued' as const, lastError: null }
                      : item,
                  ),
                })),
              }
            : old,
      );
      toast.success('Analysis queued', 'It will be scored again shortly.');
      return queryClient.invalidateQueries({ queryKey: newsKeys.article(newsId) });
    },
    onError: (error) => toast.error('Couldn’t retry', getErrorMessage(error)),
  });
}
