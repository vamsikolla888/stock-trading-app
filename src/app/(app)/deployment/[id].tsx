import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { Note, QuietEmpty } from '@/features/deployments/components/parts';
import { EventRow, OrderRow, TradeRow } from '@/features/deployments/components/rows';
import { useDeploymentDetail } from '@/features/deployments/hooks';
import { isDeployPlatformKey } from '@/features/deployments/lib/normalize';
import {
  filterEvents,
  logFilters,
  modeLabel,
  type LogFilter,
} from '@/features/deployments/lib/view';
import type { DeployTarget, DeploymentDetail } from '@/features/deployments/types';
import { isServerOutdated } from '@/services/api/contract';
import { isApiError } from '@/types/api';

// A render failure here shows the error page with a retry, not a crashed app.
export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

type Section = 'orders' | 'trades' | 'activity';

const one = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value)?.trim() ?? '';

/**
 * A deployment's long lists, one tap from its tab: every planned order or resting trigger (daily
 * strategies), every trade, and the whole activity log with its filters. Same query as the tab,
 * so it paints at once and refreshes on the same 30-second market-hours beat.
 *
 * Params: `id` (the deployment), `strategy` (a user's strategy id) or `key` (a platform key), and
 * `section` (orders | trades | activity).
 */
export default function DeploymentListsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    id?: string | string[];
    strategy?: string | string[];
    key?: string | string[];
    section?: string | string[];
  }>();
  const id = one(params.id);
  const strategyId = one(params.strategy);
  const key = one(params.key);
  const target = useMemo<DeployTarget | null>(() => {
    if (strategyId) return { kind: 'strategy', strategyId };
    if (isDeployPlatformKey(key)) return { kind: 'platform', key };
    return null;
  }, [strategyId, key]);
  const requested = one(params.section);
  const [section, setSection] = useState<Section>(
    requested === 'orders' || requested === 'activity' ? requested : 'trades',
  );

  const query = useDeploymentDetail(
    target ?? { kind: 'strategy', strategyId: '' },
    target ? id : null,
  );
  const d = query.data;
  const refresh = useCallback(() => query.refetch(), [query]);
  const notFound = !target || !id || (isApiError(query.error) && query.error.status === 404);

  const title = section === 'orders' ? 'Orders' : section === 'activity' ? 'Activity' : 'Trades';
  const subtitle = d
    ? `${d.deployment.strategyName ? `${d.deployment.strategyName} · ` : ''}${modeLabel(d.deployment.mode, d.deployment.broker)}`
    : undefined;

  let body: React.ReactNode;
  if (notFound) {
    body = (
      <InlineEmpty
        title="Deployment not found"
        message="It may belong to another account, or the link is out of date."
        action={{ label: 'Go back', onPress: () => router.back() }}
      />
    );
  } else if (query.isPending) {
    body = <ListSkeleton rows={8} />;
  } else if (!d) {
    body = isServerOutdated(query.error) ? (
      <InlineEmpty
        title="Needs a newer server"
        message="Deployments aren’t available on the server this app is connected to yet."
      />
    ) : (
      <InlineError
        what="this deployment"
        error={query.error}
        onRetry={() => void query.refetch()}
      />
    );
  } else {
    body = <Lists detail={d} section={section} onSection={setSection} />;
  }

  return (
    <StackScreen title={title} subtitle={subtitle} onRefresh={notFound ? undefined : refresh}>
      {body}
    </StackScreen>
  );
}

function Lists({
  detail,
  section,
  onSection,
}: {
  detail: DeploymentDetail;
  section: Section;
  onSection: (section: Section) => void;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<LogFilter>('all');
  const dep = detail.deployment;
  const swing = dep.engine === 'swing';
  const platform = dep.source === 'platform';
  const shown: Section = !swing && section === 'orders' ? 'trades' : section;
  const events = useMemo(
    () => filterEvents(detail.events, filter, dep.engine),
    [detail.events, filter, dep.engine],
  );
  const openStock = (symbol: string) =>
    router.push({ pathname: '/stock/[symbol]', params: { symbol, exchange: 'NSE' } });

  const items: { key: Section; label: string }[] = [
    ...(swing ? [{ key: 'orders' as const, label: platform ? 'Triggers' : 'Orders' }] : []),
    { key: 'trades', label: 'Trades' },
    { key: 'activity', label: 'Activity' },
  ];

  return (
    <View>
      <SegmentedControl items={items} value={shown} onChange={onSection} className="mb-4" />

      {shown === 'orders' ? (
        detail.orders.length === 0 ? (
          <QuietEmpty
            message={platform ? 'No trigger is waiting.' : 'Nothing to buy at the next open.'}
          />
        ) : (
          <ListCard>
            {detail.orders.map((o, i) => (
              <React.Fragment key={o.id}>
                {i > 0 ? <RowDivider /> : null}
                <OrderRow t={o} platform={platform} onOpen={openStock} />
              </React.Fragment>
            ))}
          </ListCard>
        )
      ) : null}

      {shown === 'trades' ? (
        <>
          <Note className="mb-2.5">
            {swing
              ? `${detail.stats.trades} closed · ${detail.stats.failed} refused · ${detail.stats.cancelled} not taken`
              : `${detail.stats.trades} closed · ${detail.stats.failed} refused`}
          </Note>
          {detail.trades.length === 0 ? (
            <QuietEmpty message="No trades yet." />
          ) : (
            <ListCard>
              {detail.trades.map((t, i) => (
                <React.Fragment key={t.id}>
                  {i > 0 ? <RowDivider /> : null}
                  <TradeRow t={t} engine={dep.engine} onOpen={openStock} />
                </React.Fragment>
              ))}
            </ListCard>
          )}
        </>
      ) : null}

      {shown === 'activity' ? (
        <>
          <Chips
            items={logFilters(dep.engine)}
            value={filter}
            onChange={setFilter}
            className="mb-3"
          />
          {events.length === 0 ? (
            <QuietEmpty message="Nothing yet." />
          ) : (
            <ListCard>
              {events.map((e, i) => (
                <React.Fragment key={`${e.at}-${i}`}>
                  {i > 0 ? <RowDivider /> : null}
                  <EventRow e={e} engine={dep.engine} />
                </React.Fragment>
              ))}
            </ListCard>
          )}
          <Note className="mt-2">The newest 200 entries.</Note>
        </>
      ) : null}
    </View>
  );
}
