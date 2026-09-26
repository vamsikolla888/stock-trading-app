interface PersistedStore {
  persist: {
    hasHydrated: () => boolean;
    onFinishHydration: (listener: () => void) => () => void;
  };
}

/**
 * Resolves once a zustand `persist` store has loaded from disk. zustand never fires
 * the finish listener if hydration throws, so a timeout guarantees startup can't hang
 * behind the splash screen on a corrupt or unreadable store — the store just keeps its
 * defaults for this launch.
 */
export function waitForHydration(store: PersistedStore, timeoutMs = 3000): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve();

  return new Promise((resolve) => {
    const timer = setTimeout(done, timeoutMs);
    const unsubscribe = store.persist.onFinishHydration(done);

    function done() {
      clearTimeout(timer);
      unsubscribe();
      resolve();
    }
  });
}

export function waitForStores(stores: PersistedStore[], timeoutMs?: number): Promise<void> {
  return Promise.all(stores.map((store) => waitForHydration(store, timeoutMs))).then(
    () => undefined,
  );
}
