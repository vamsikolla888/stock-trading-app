import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { ScannerDetail } from '@/features/next-day/components/ScannerDetail';
import { useNextDayLibrary } from '@/features/next-day/hooks';
import { isServerOutdated } from '@/services/api/contract';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** One next-day scanner in full — pushed from the scanner library. */
export default function NextDayScannerScreen() {
  const params = useLocalSearchParams<{ key?: string }>();
  const key = typeof params.key === 'string' ? params.key : '';
  const query = useNextDayLibrary();
  const strategy = query.data?.strategies.find((s) => s.key === key) ?? null;

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={6} />;
  } else if (query.error && !query.data) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="The next-day scanners aren’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="the scanner" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (!strategy || !query.data) {
    body = <InlineEmpty title="Scanner not found" message="The server no longer lists it." />;
  } else {
    body = <ScannerDetail s={strategy} lib={query.data} />;
  }

  return (
    <StackScreen
      title={strategy?.name ?? 'Scanner'}
      subtitle="Next-day scanner"
      onRefresh={() => query.refetch()}
      fill
    >
      {body}
    </StackScreen>
  );
}
