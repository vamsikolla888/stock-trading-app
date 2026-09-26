import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockRow } from '@/components/market/StockRow';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { manualLists, useWatchlist, useWatchlists } from '@/features/watchlists/hooks';
import { stockHref } from '@/lib/navigation';

const PREVIEW_ROWS = 4;

/** First few rows of the user's first own watchlist, with each stock's 7-day trend. */
export function WatchlistPreview() {
  const router = useRouter();
  const lists = useWatchlists();
  const first = manualLists(lists.data)[0];
  const detail = useWatchlist(first?.id);

  const seeAll = {
    label: first ? 'See all' : 'Create',
    onPress: () => router.push('/trade/watchlists'),
  };

  let body: React.ReactNode;
  if (lists.isPending || (first && detail.isPending)) {
    body = <ListSkeleton rows={3} />;
  } else if (lists.error || detail.error) {
    body = (
      <InlineError
        what="your watchlist"
        error={lists.error ?? detail.error}
        onRetry={() => void (lists.error ? lists.refetch() : detail.refetch())}
      />
    );
  } else if (!first || !detail.data || detail.data.items.length === 0) {
    body = (
      <InlineEmpty
        title={first ? 'Your watchlist is empty' : 'No watchlist yet'}
        message="Tap the star on any stock to follow its price here."
        action={{ label: 'Find stocks', onPress: () => router.push('/search') }}
      />
    );
  } else {
    const items = detail.data.items.slice(0, PREVIEW_ROWS);
    body = (
      <ListCard>
        {items.map((item, index) => (
          <View key={`${item.exchange}:${item.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <StockRow
              symbol={item.symbol}
              name={item.companyName}
              exchange={item.exchange}
              price={item.ltp}
              changePercent={item.changeTodayPct}
              logoUri={stockLogoUrl(item.symbol)}
              trend={item.sparkline}
              onPress={() => router.push(stockHref(item.symbol, item.exchange))}
            />
          </View>
        ))}
      </ListCard>
    );
  }

  return (
    <Section title={first?.name ?? 'Your watchlist'} action={seeAll}>
      {body}
    </Section>
  );
}
