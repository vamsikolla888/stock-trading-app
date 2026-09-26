import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

import { appStorage } from '@/lib/storage/appStorage';

/**
 * Persists the React Query cache to app storage (encrypted MMKV in every real build) so a
 * cold app launch can paint from cache immediately (screens use `placeholderData`/cached
 * reads) before revalidating over the network — the offline-first read path.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: appStorage,
  key: 'REACT_QUERY_OFFLINE_CACHE',
  throttleTime: 1000,
});
