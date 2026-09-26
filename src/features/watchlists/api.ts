import { apiClient } from '@/services/api/client';

import type { WatchlistItemInput, WatchlistListItem, WatchlistView } from './types';

export const watchlistsApi = {
  async list(): Promise<WatchlistListItem[]> {
    const { data } = await apiClient.get<{ watchlists: WatchlistListItem[] }>('/watchlists');
    return data.watchlists;
  },

  async get(id: string): Promise<WatchlistView> {
    const { data } = await apiClient.get<WatchlistView>(`/watchlists/${encodeURIComponent(id)}`);
    return data;
  },

  async create(name: string, items: WatchlistItemInput[] = []): Promise<WatchlistView> {
    const { data } = await apiClient.post<WatchlistView>('/watchlists', {
      name,
      ...(items.length > 0 ? { items } : {}),
    });
    return data;
  },

  async rename(id: string, name: string): Promise<WatchlistView> {
    const { data } = await apiClient.patch<WatchlistView>(`/watchlists/${encodeURIComponent(id)}`, {
      name,
    });
    return data;
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`/watchlists/${encodeURIComponent(id)}`);
  },

  /** Adding a stock that's already listed is a no-op server-side (its baseline price is kept). */
  async addItems(id: string, items: WatchlistItemInput[]): Promise<WatchlistView> {
    const { data } = await apiClient.post<WatchlistView>(
      `/watchlists/${encodeURIComponent(id)}/items`,
      {
        items,
      },
    );
    return data;
  },

  async removeItem(id: string, exchange: string, symbol: string): Promise<WatchlistView> {
    const { data } = await apiClient.delete<WatchlistView>(
      `/watchlists/${encodeURIComponent(id)}/items/${encodeURIComponent(exchange)}/${encodeURIComponent(symbol)}`,
    );
    return data;
  },
};
