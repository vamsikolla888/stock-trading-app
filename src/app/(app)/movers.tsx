import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips, Tabs } from '@/components/ui/Tabs';
import { MoverRow } from '@/features/home/components/MoverRow';
import {
  CAP_TABS,
  capParam,
  capTabRange,
  isCapTab,
  type CapTab,
} from '@/features/home/lib/capBands';
import { useMovers } from '@/features/market/hooks';
import type { MoverKind } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';

const KINDS: readonly { key: MoverKind; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'volume', label: 'Most traded' },
];

const LIMIT = 20;

/**
 * Today's full rankings, one market-cap band at a time (the web's /explore/movers and
 * /explore/most-traded). The two controls compose: the band picks which stocks are in
 * scope, the tab picks which end of that scope to rank.
 */
export default function MoversScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; cap?: string }>();
  const [kind, setKind] = useState<MoverKind>(
    KINDS.some((option) => option.key === params.kind) ? (params.kind as MoverKind) : 'gainers',
  );
  const [cap, setCap] = useState<CapTab>(isCapTab(params.cap) ? params.cap : 'large');
  const movers = useMovers(kind, LIMIT, capParam(cap));

  return (
    <StackScreen
      title={kind === 'volume' ? 'Most traded' : 'Top movers'}
      subtitle={`${kind === 'volume' ? 'By day volume' : 'By change today'} · ${capTabRange(cap)}`}
      onRefresh={movers.refetch}
    >
      <Tabs items={KINDS} value={kind} onChange={setKind} />
      <Chips items={CAP_TABS} value={cap} onChange={setCap} className="my-4" />

      {movers.isPending ? (
        <ListSkeleton rows={8} />
      ) : movers.error && !movers.data ? (
        <InlineError
          what="this ranking"
          error={movers.error}
          onRetry={() => void movers.refetch()}
        />
      ) : !movers.data || movers.data.length === 0 ? (
        <InlineEmpty
          title="Nothing in this band yet"
          message="The price snapshot may still be warming up. Try another band."
          action={
            cap !== 'all'
              ? { label: 'Show every market cap', onPress: () => setCap('all') }
              : undefined
          }
        />
      ) : (
        <ListCard className={movers.isPlaceholderData ? 'opacity-60' : undefined}>
          {movers.data.map((mover, index) => (
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
      )}

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {kind === 'volume'
          ? 'Ranked by volume traded so far today. Volume comes from a snapshot refreshed about every 15 minutes during market hours, so a band can look sparse early in the session.'
          : 'Computed from the shared price snapshot, so it works with or without a broker. Low cap starts at ₹500 crore — below that, listings are too thin for a change to mean much.'}{' '}
        The small line plots the session’s real points: previous close, open, the day’s high and
        low, then the latest price.
      </Text>
    </StackScreen>
  );
}
