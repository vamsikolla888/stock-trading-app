import { type ErrorBoundaryProps, useRouter } from 'expo-router';
import React, { useEffect } from 'react';

import { ErrorScreen } from '@/components/common/ErrorScreen';

/**
 * Expo Router error boundary for a layout: re-exported as `ErrorBoundary` from each
 * main-menu layout, so a crash inside one screen shows the error page in that tab while
 * the bottom menu stays usable — the user can retry or simply go elsewhere.
 */
export function RouteErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const router = useRouter();

  useEffect(() => {
    // Wire to a crash-reporting service (Sentry, Bugsnag) in production.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.error('[RouteErrorBoundary]', error);
    }
  }, [error]);

  return (
    <ErrorScreen error={error} onRetry={() => void retry()} onHome={() => router.replace('/')} />
  );
}
