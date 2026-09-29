import { Redirect, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Text } from 'react-native';

import { StackScreen } from '@/components/navigation/StackScreen';
import { Chips, Tabs } from '@/components/ui/Tabs';
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

type RankKind = 'gainers' | 'losers';

const KINDS: readonly { key: RankKind; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

const LIMIT = 20;

/**
 * Today's biggest movers, one market-cap band at a time (the web's /explore/movers). The
 * two controls compose: the band picks which stocks are in scope, the tab picks which end
 * of that scope to rank.
 */
function MoversScreen({ initialKind, initialCap }: { initialKind: RankKind; initialCap: CapTab }) {
  const [kind, setKind] = useState<RankKind>(initialKind);
  const [cap, setCap] = useState<CapTab>(initialCap);
  const movers = useMovers(kind, LIMIT, capParam(cap));

  return (
    <StackScreen
      title="Top movers"
      subtitle={`By change today · ${capTabRange(cap)}`}
      onRefresh={movers.refetch}
    >
      <Tabs items={KINDS} value={kind} onChange={setKind} />
      <Chips items={CAP_TABS} value={cap} onChange={setCap} className="my-4" />

      <RankingList query={movers} kind={kind} cap={cap} onShowAllCaps={() => setCap('all')} />

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Computed from the shared price snapshot, so it works with or without a broker. Low cap
        starts at ₹500 crore — below that, listings are too thin for a change to mean much. The
        small line plots the session’s real points: previous close, open, the day’s high and low,
        then the latest price.
      </Text>
    </StackScreen>
  );
}

/**
 * `/movers?kind=&cap=`. Most traded has its own screen now, as on the web
 * (/explore/most-traded); a `kind=volume` link from before the split lands there.
 */
export default function MoversRoute() {
  const params = useLocalSearchParams<{ kind?: string; cap?: string }>();
  const cap: CapTab = isCapTab(params.cap) ? params.cap : 'large';

  if (params.kind === 'volume') {
    return <Redirect href={{ pathname: '/most-traded', params: { cap } }} />;
  }
  return (
    <MoversScreen initialKind={params.kind === 'losers' ? 'losers' : 'gainers'} initialCap={cap} />
  );
}
