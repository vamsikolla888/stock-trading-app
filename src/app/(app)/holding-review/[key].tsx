import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { HoldingNote } from '@/features/agents/components/HoldingNote';
import { AgentsOutdated } from '@/features/agents/components/Parts';
import { usePortfolioReview } from '@/features/agents/hooks';
import { BOOK_ROUTE, BROKER_WORD } from '@/features/agents/lib/view';
import { useNow } from '@/hooks/useNow';
import { isServerOutdated } from '@/services/api/contract';

/**
 * One holding's review note (web: the holding pane of /agents/portfolio). Reads the same
 * portfolio-review response the list screen does — no endpoint of its own — and finds the holding
 * by its key ("NSE:INFY"), so it stays in step with the list and polls while a review is running.
 */
export default function HoldingReviewScreen() {
  const router = useRouter();
  const layout = useScreenLayout();
  const now = useNow();
  const params = useLocalSearchParams<{ key?: string | string[] }>();
  const key = typeof params.key === 'string' ? params.key : '';
  const review = usePortfolioReview();
  const data = review.data;
  // Links from elsewhere (a book's holdings, the activity feed) may not match the server's case.
  const holding = data?.holdings.find((h) => h.key.toUpperCase() === key.toUpperCase()) ?? null;
  const symbolFromKey = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;

  const onRefresh = useCallback(() => review.refetch(), [review]);
  const openStock = useCallback(() => {
    if (!holding) return;
    router.push({
      pathname: '/stock/[symbol]',
      params: { symbol: holding.symbol, exchange: holding.exchange },
    });
  }, [router, holding]);

  if (!data) {
    return (
      <StackScreen title={symbolFromKey || 'Holding review'} onRefresh={onRefresh}>
        {isServerOutdated(review.error) ? (
          <AgentsOutdated what="Portfolio review and the other Agents screens" />
        ) : review.error ? (
          <InlineError
            what="this review"
            error={review.error}
            onRetry={() => void review.refetch()}
          />
        ) : (
          <View className="gap-4" accessibilityLabel="Loading the review">
            <Skeleton height={96} rounded="lg" />
            <Skeleton height={140} rounded="lg" />
            <ListSkeleton rows={4} />
          </View>
        )}
      </StackScreen>
    );
  }

  if (!holding) {
    return (
      <StackScreen title={symbolFromKey || 'Holding review'} onRefresh={onRefresh}>
        <InlineEmpty
          title="This holding isn’t in the review"
          message="It may have been sold, or its reviews are older than the review window."
        />
        <Button
          className="mt-4"
          label="Open portfolio review"
          variant="outline"
          onPress={() => router.replace('/agents/portfolio')}
        />
      </StackScreen>
    );
  }

  return (
    <StackScreen
      title={holding.symbol}
      subtitle={[holding.companyName, holding.exchange].filter(Boolean).join(' · ')}
      onRefresh={onRefresh}
      fill
    >
      <HoldingNote
        holding={holding}
        now={now}
        pendingDeadlineMinutes={data.pendingDeadlineMinutes}
        wide={layout.columns >= 2}
        footnote={data.note}
      />
      <View className="mt-5 gap-2.5">
        <Button
          label={`Open ${holding.symbol}`}
          variant="outline"
          onPress={openStock}
          accessibilityHint="Opens the stock's own page with its chart and fundamentals"
        />
        {/* An older server names no book: it reviewed Groww only. */}
        {(holding.brokers.length ? holding.brokers : (['groww'] as const)).map((broker) => (
          <Button
            key={broker}
            label={`${BROKER_WORD[broker]} portfolio`}
            variant="ghost"
            onPress={() => router.push(BOOK_ROUTE[broker])}
          />
        ))}
      </View>
    </StackScreen>
  );
}
