import { focusManager, QueryClient } from '@tanstack/react-query';
import { AppState, Platform } from 'react-native';

import { appConfig } from '@/config/app';
import { ApiError } from '@/types/api';

/**
 * Retry only what a retry can fix: connectivity (status 0) and server errors. A 4xx, a
 * rate limit, or an envelope failure sent as HTTP 200 (MARKET_CLOSED) will answer the
 * same way again, so retrying just delays the error state.
 */
function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status !== 0 && error.status < 500) return false;
  return failureCount < appConfig.query.retry;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: appConfig.query.staleTimeMs,
      // Must be >= the persister's maxAge, or queries are evicted before they can be
      // restored on the next cold start and the app paints empty instead of from cache.
      gcTime: appConfig.query.gcTimeMs,
      retry: shouldRetry,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
      onError: (error) => {
        // Central hook for global mutation error reporting (toasts, logging, crash reporting).
        if (__DEV__) {
          // eslint-disable-next-line no-console
          console.warn('[mutation error]', error);
        }
      },
    },
  },
});

// React Native has no window focus: map app foreground/background onto React Query's
// focus state, so stale screens refresh on resume and refetchInterval polling pauses
// while the app is in the background.
if (Platform.OS !== 'web') {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener('change', (status) => {
      setFocused(status === 'active');
    });
    return () => subscription.remove();
  });
}
