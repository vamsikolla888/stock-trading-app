import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { CandidateDetail } from '@/features/next-day/components/CandidateDetail';
import { FinePrint } from '@/features/next-day/components/parts';
import { SizingSheet } from '@/features/next-day/components/SizingSheet';
import { nextDayKeys, useNextDayReport } from '@/features/next-day/hooks';
import { sessionDate } from '@/features/next-day/lib/normalize';
import { morningFor, sessionDay } from '@/features/next-day/lib/view';
import { useSizingPrefs } from '@/features/next-day/store';
import { stockHref } from '@/lib/navigation';
import { isServerOutdated } from '@/services/api/contract';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * A next-day candidate in full — pushed from the Scanner's Next day board. `date` is the session
 * the report analysed (the newest report when absent); the board's cached report paints it at once.
 */
export default function NextDayCandidateScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ symbol?: string; date?: string }>();
  const symbol = (typeof params.symbol === 'string' ? params.symbol : '').toUpperCase();
  const date = sessionDate(params.date);
  const query = useNextDayReport(date);
  const [sizing, setSizing] = useState(false);

  const report = query.data?.report ?? null;
  const candidate = report?.candidates.find((c) => c.symbol === symbol) ?? null;
  const reportDefault = report
    ? { capital: report.risk.capital, riskPct: report.risk.riskPct }
    : null;
  const prefs = useSizingPrefs(reportDefault);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: nextDayKeys.report(date) }),
    [queryClient, date],
  );

  let body: React.ReactNode;
  if (query.isPending) {
    body = <ListSkeleton rows={6} />;
  } else if (query.error && !query.data) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="The next-day scanner isn’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError what="the candidate" error={query.error} onRetry={() => void query.refetch()} />
    );
  } else if (!candidate || !report) {
    body = (
      <InlineEmpty
        title={`${symbol || 'This stock'} isn’t in this report`}
        message={query.data ? `Report for ${sessionDay(query.data.forDate)}` : undefined}
        action={
          symbol
            ? { label: 'Open the stock', onPress: () => router.push(stockHref(symbol, 'NSE')) }
            : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <CandidateDetail
          c={candidate}
          compat={report.compatibility}
          morning={morningFor(query.data?.morning, candidate.symbol)}
          prefs={prefs}
          onChangeSizing={() => setSizing(true)}
        />
        <FinePrint>
          A candidate, not an order — wait for the morning confirmation. The score is signal
          strength, never a probability. Not investment advice.
        </FinePrint>
        {reportDefault ? (
          <SizingSheet
            visible={sizing}
            current={prefs}
            reportDefault={reportDefault}
            onClose={() => setSizing(false)}
          />
        ) : null}
      </>
    );
  }

  return (
    <StackScreen
      title={symbol || 'Candidate'}
      subtitle={query.data ? `Next day · for ${sessionDay(query.data.forDate)}` : 'Next day'}
      onRefresh={refresh}
      fill
    >
      {body}
    </StackScreen>
  );
}
