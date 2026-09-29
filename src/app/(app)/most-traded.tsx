import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { Chips } from '@/components/ui/Tabs';
import { RankingList } from '@/features/home/components/RankingList';
import {
  CAP_TABS,
  capParam,
  capTabRange,
  isCapTab,
  type CapTab,
} from '@/features/home/lib/capBands';
import { useMovers } from '@/features/market/hooks';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const LIMIT = 20;

/**
 * The full "Most traded" ranking by day volume, one market-cap band at a time — the web's
 * /explore/most-traded. Behind Explore's Most traded shelf and Today's volume ranking.
 */
export default function MostTradedScreen() {
  const params = useLocalSearchParams<{ cap?: string }>();
  const [cap, setCap] = useState<CapTab>(isCapTab(params.cap) ? params.cap : 'large');
  const movers = useMovers('volume', LIMIT, capParam(cap));

  return (
    <StackScreen
      title="Most traded"
      subtitle={`By day volume · ${capTabRange(cap)}`}
      onRefresh={movers.refetch}
    >
      <Chips items={CAP_TABS} value={cap} onChange={setCap} className="mb-4" />

      <RankingList query={movers} kind="volume" cap={cap} onShowAllCaps={() => setCap('all')} />

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Ranked by the volume traded so far today. Volume comes from a snapshot refreshed about every
        15 minutes during market hours, so a band can look sparse early in the session. The small
        line plots the session’s real points: previous close, open, the day’s high and low, then the
        latest price.
      </Text>
    </StackScreen>
  );
}
