import { useRouter } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider } from '@/components/ui/Section';
import type { useMovers } from '@/features/market/hooks';
import type { MoverKind } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';

import type { CapTab } from '../lib/capBands';

import { MoverRow } from './MoverRow';

/**
 * One full ranking (the web's CapBandTable): loading, failure, an empty band — with a way
 * out to every market cap — or the rows. Shared by the Top movers and Most traded screens,
 * which own the query so pull-to-refresh can reach it.
 */
export function RankingList({
  query,
  kind,
  cap,
  onShowAllCaps,
}: {
  query: ReturnType<typeof useMovers>;
  kind: MoverKind;
  cap: CapTab;
  onShowAllCaps: () => void;
}) {
  const router = useRouter();

  if (query.isPending) return <ListSkeleton rows={8} />;
  if (query.error && !query.data) {
    return (
      <InlineError what="this ranking" error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (!query.data || query.data.length === 0) {
    return (
      <InlineEmpty
        title="Nothing in this band yet"
        message={
          kind === 'volume'
            ? 'The volume snapshot may still be warming up. Try another band.'
            : 'The price snapshot may still be warming up. Try another band.'
        }
        action={
          cap !== 'all' ? { label: 'Show every market cap', onPress: onShowAllCaps } : undefined
        }
      />
    );
  }

  return (
    <ListCard className={query.isPlaceholderData ? 'opacity-60' : undefined}>
      {query.data.map((mover, index) => (
        <View key={`${mover.exchange}:${mover.symbol}`}>
          {index > 0 ? <RowDivider /> : null}
          <MoverRow
            mover={mover}
            kind={kind}
            onPress={() => router.push(stockHref(mover.symbol, mover.exchange))}
          />
        </View>
      ))}
    </ListCard>
  );
}
