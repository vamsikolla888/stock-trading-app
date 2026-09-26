import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useMemo } from 'react';

import { livePriceInterval } from '@/lib/utils/market';

import { watchlistsApi } from './api';
import type { WatchlistItemInput, WatchlistListItem, WatchlistView } from './types';

export const watchlistKeys = {
  all: ['watchlists'] as const,
  list: () => [...watchlistKeys.all, 'list'] as const,
  detail: (id: string) => [...watchlistKeys.all, 'detail', id] as const,
};

export function useWatchlists() {
  return useQuery({
    queryKey: watchlistKeys.list(),
    queryFn: watchlistsApi.list,
    staleTime: 30_000,
  });
}

export function useWatchlist(id: string | undefined, keepPrevious = false) {
  return useQuery({
    queryKey: watchlistKeys.detail(id ?? ''),
    queryFn: () => watchlistsApi.get(id!),
    enabled: Boolean(id),
    staleTime: 20_000,
    refetchInterval: () => livePriceInterval(60_000),
    // The lists screen keeps the previous list on screen while the next one loads, so a
    // switch never blanks the page.
    ...(keepPrevious ? { placeholderData: keepPreviousData } : {}),
  });
}

/** The user's own lists (the derived recommendations list is read-only). */
export function manualLists(lists: readonly WatchlistListItem[] | undefined): WatchlistListItem[] {
  return (lists ?? []).filter((list) => list.kind === 'manual' && !list.readOnly);
}

/**
 * Which of the user's lists contain this stock. The server has no reverse lookup, so this
 * reads each manual list (at most 12) — cached and shared with the lists screen.
 */
export function useListsContaining(exchange: string, symbol: string) {
  const lists = useWatchlists();
  const own = useMemo(() => manualLists(lists.data), [lists.data]);
  const details = useQueries({
    queries: own.map((list) => ({
      queryKey: watchlistKeys.detail(list.id),
      queryFn: () => watchlistsApi.get(list.id),
      staleTime: 20_000,
    })),
  });

  const containing = new Set<string>();
  details.forEach((detail, index) => {
    const list = own[index];
    if (
      list &&
      detail.data?.items.some((item) => item.exchange === exchange && item.symbol === symbol)
    ) {
      containing.add(list.id);
    }
  });

  return {
    lists: own,
    containing,
    isLoading: lists.isPending || details.some((detail) => detail.isPending),
    error: lists.error,
  };
}

/** The list-index row a full view implies — so the index agrees before its refetch lands. */
function toListItem(view: WatchlistView): WatchlistListItem {
  return {
    id: view.id,
    name: view.name,
    itemCount: view.items.length,
    readOnly: view.readOnly,
    kind: view.kind,
    updatedAt: view.updatedAt,
  };
}

function useApplyWatchlistView() {
  const queryClient = useQueryClient();
  return (view: WatchlistView) => {
    queryClient.setQueryData(watchlistKeys.detail(view.id), view);
    // Patched in place first: a list created a moment ago must be selectable before the
    // index refetch returns it, and a count must not lag the row just added.
    queryClient.setQueryData<WatchlistListItem[]>(watchlistKeys.list(), (old) => {
      if (!old) return old;
      const row = toListItem(view);
      return old.some((list) => list.id === view.id)
        ? old.map((list) => (list.id === view.id ? row : list))
        : [...old, row];
    });
    void queryClient.invalidateQueries({ queryKey: watchlistKeys.list() });
  };
}

export function useAddToWatchlist() {
  const apply = useApplyWatchlistView();
  return useMutation({
    mutationFn: ({ id, item }: { id: string; item: WatchlistItemInput }) =>
      watchlistsApi.addItems(id, [item]),
    onSuccess: apply,
  });
}

export function useRemoveFromWatchlist() {
  const apply = useApplyWatchlistView();
  return useMutation({
    mutationFn: ({ id, exchange, symbol }: { id: string; exchange: string; symbol: string }) =>
      watchlistsApi.removeItem(id, exchange, symbol),
    onSuccess: apply,
  });
}

export function useCreateWatchlist() {
  const apply = useApplyWatchlistView();
  return useMutation({
    mutationFn: ({ name, items }: { name: string; items?: WatchlistItemInput[] }) =>
      watchlistsApi.create(name, items),
    onSuccess: apply,
  });
}

export function useRenameWatchlist() {
  const apply = useApplyWatchlistView();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => watchlistsApi.rename(id, name),
    onSuccess: apply,
  });
}

export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => watchlistsApi.remove(id),
    onSuccess: (_result, id) => {
      queryClient.removeQueries({ queryKey: watchlistKeys.detail(id) });
      queryClient.setQueryData<WatchlistListItem[]>(watchlistKeys.list(), (old) =>
        old?.filter((list) => list.id !== id),
      );
      return queryClient.invalidateQueries({ queryKey: watchlistKeys.list() });
    },
  });
}
