import { useQueryClient } from '@tanstack/react-query';
import React, { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Chips } from '@/components/ui/Tabs';
import {
  BookSummaryCard,
  BookSummarySkeleton,
  HideValuesButton,
} from '@/features/portfolio/components/BookSummaryCard';
import { BrokerStatusCard, ConnectionDot } from '@/features/portfolio/components/BrokerStatus';
import { HoldingsSection } from '@/features/portfolio/components/HoldingsSection';
import { LifetimeSection } from '@/features/portfolio/components/LifetimeSection';
import {
  LinkedAnalyticsSection,
  LinkedOverviewSection,
  PnlStatementSection,
} from '@/features/portfolio/components/LinkedAnalyticsSections';
import { OrderHistorySection } from '@/features/portfolio/components/OrderHistorySection';
import { PerformanceSection } from '@/features/portfolio/components/PerformanceSection';
import { PositionsSection } from '@/features/portfolio/components/PositionsSection';
import {
  LinkedFundsSection,
  TradesSection,
} from '@/features/portfolio/components/TradesFundsSections';
import { portfolioKeys, useLinkedPortfolio } from '@/features/portfolio/hooks';
import { formatAsOf } from '@/features/portfolio/lib/dates';
import { fromLinkedHolding, fromLinkedPosition } from '@/features/portfolio/lib/portfolio';
import { Caveats } from '@/features/trading/components/Sheet';
import { useBrokerCatalog } from '@/features/trading/hooks';
import { formatINR } from '@/lib/utils/formatters';

type SectionKey =
  'holdings' | 'positions' | 'orders' | 'trades' | 'funds' | 'pnl' | 'analytics' | 'statement';

const BROKER = 'groww';

/**
 * The Groww account, connected by API and read live through the server's linked-portfolio
 * endpoints. Read-only, as on the web: holdings, positions, orders and trades are shown,
 * but orders are placed from a stock's page (the ticket picks the broker). Groww's API
 * keeps no history, so the daily P&L and the statement build up from the day it was
 * connected, plus any reports imported on the web.
 */
export default function GrowwPortfolioScreen() {
  const queryClient = useQueryClient();
  const catalog = useBrokerCatalog();
  const label = catalog.data?.find((entry) => entry.id === BROKER)?.label ?? 'Groww';
  const { query, state } = useLinkedPortfolio(BROKER);
  const snapshot = query.data;
  const [section, setSection] = useState<SectionKey>('holdings');

  // Linked holdings report `dayChange` as the ROW's rupee move (see fromLinkedHolding).
  const holdings = useMemo(() => snapshot?.holdings.map(fromLinkedHolding) ?? [], [snapshot]);
  const positions = useMemo(() => snapshot?.positions.map(fromLinkedPosition) ?? [], [snapshot]);
  const extras = useMemo(
    () =>
      Object.fromEntries(
        (snapshot?.holdings ?? []).map((holding) => [
          `${holding.exch}:${holding.sym}`,
          { t1Qty: holding.t1Qty },
        ]),
      ),
    [snapshot],
  );
  const openPositions = positions.filter((row) => row.qty !== 0).length;

  const onRefresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: portfolioKeys.linked(BROKER) }),
    [queryClient],
  );

  const intro =
    snapshot && state === 'connected'
      ? `Synced ${formatAsOf(snapshot.asOf)}${snapshot.accountLabel ? ` · ${snapshot.accountLabel}` : ''}${snapshot.stale ? ' · refreshing' : ''}`
      : `Your ${label} account, read live via its API`;

  const sections: readonly { key: SectionKey; label: string }[] = [
    { key: 'holdings', label: `Holdings${holdings.length ? ` (${holdings.length})` : ''}` },
    { key: 'positions', label: `Positions${openPositions ? ` (${openPositions})` : ''}` },
    { key: 'orders', label: 'Orders' },
    { key: 'trades', label: 'Trades' },
    { key: 'funds', label: 'Funds' },
    { key: 'pnl', label: 'Daily P&L' },
    { key: 'analytics', label: 'Analytics' },
    { key: 'statement', label: 'Statement' },
  ];

  const totals = snapshot?.totals;
  const chargesSource = totals?.chargesTodaySource;

  return (
    <GroupScreen
      onRefresh={onRefresh}
      intro={intro}
      right={
        <View className="flex-row items-center gap-2">
          <ConnectionDot state={state} />
          <HideValuesButton />
        </View>
      }
    >
      {state === 'loading' && !snapshot ? (
        <View className="gap-4">
          <BookSummarySkeleton />
          <ListSkeleton rows={4} />
        </View>
      ) : null}

      {state === 'not-connected' || state === 'session-expired' || state === 'error' ? (
        <BrokerStatusCard
          className="mb-4"
          state={state}
          brokerLabel={label}
          error={query.error}
          notConnectedMessage={`Add your ${label} API key and TOTP secret once — the daily token then renews automatically.`}
          sessionMessage={`${label}'s access lapsed. Open connections to renew it, then pull to refresh.`}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {snapshot && totals ? (
        <>
          {state !== 'connected' ? (
            <Banner
              className="mb-3"
              tone="info"
              message={`Showing the last figures read at ${formatAsOf(snapshot.asOf)}.`}
            />
          ) : null}
          <BookSummaryCard
            value={totals.value}
            invested={totals.invested}
            pnl={totals.unrealised}
            pnlPct={totals.unrealisedPct}
            day={totals.dayChange === null ? null : { abs: totals.dayChange, pct: null }}
            dayUnavailable={
              holdings.length === 0 ? 'No holdings yet' : "Today's move isn't available yet"
            }
            extras={[
              {
                label: 'Available funds',
                value:
                  snapshot.funds?.available !== undefined && snapshot.funds?.available !== null
                    ? formatINR(snapshot.funds.available)
                    : '—',
                sensitive: true,
              },
              {
                label: 'Charges today',
                value:
                  totals.chargesToday === undefined || totals.chargesToday === null
                    ? '—'
                    : `${formatINR(totals.chargesToday)}${chargesSource === 'estimated' ? ' (est.)' : ''}`,
              },
            ]}
          />

          {snapshot.warnings.map((warning) => (
            <Banner key={warning} className="mt-3" tone="warning" message={warning} />
          ))}

          <Chips items={sections} value={section} onChange={setSection} className="mb-4 mt-5" />

          {section === 'holdings' ? (
            <HoldingsSection
              holdings={holdings}
              brokerLabel={label}
              tradable={false}
              extras={extras}
              emptyMessage={`No holdings in your ${label} account.`}
            />
          ) : section === 'positions' ? (
            <PositionsSection rows={positions} brokerLabel={label} tradable={false} />
          ) : section === 'orders' ? (
            <OrderHistorySection broker={BROKER} brokerLabel={label} />
          ) : section === 'trades' ? (
            <TradesSection broker={BROKER} brokerLabel={label} />
          ) : section === 'funds' ? (
            <LinkedFundsSection snapshot={snapshot} />
          ) : section === 'pnl' ? (
            <PnlStatementSection broker={BROKER} label={label} />
          ) : section === 'analytics' ? (
            <View>
              <PerformanceSection holdings={holdings} scope="groww" />
              <LinkedOverviewSection snapshot={snapshot} holdings={holdings} />
              <View className="mt-7">
                <LinkedAnalyticsSection broker={BROKER} label={label} />
              </View>
            </View>
          ) : (
            <LifetimeSection broker={BROKER} label={label} />
          )}

          <Caveats items={snapshot.caveats} className="mt-6 gap-1.5" />
        </>
      ) : null}

      {!snapshot &&
      (state === 'not-connected' || state === 'error' || state === 'session-expired') ? (
        // An imported statement stays readable without a live connection.
        <View className="mt-3">
          <LifetimeSection broker={BROKER} label={label} quiet />
        </View>
      ) : null}
    </GroupScreen>
  );
}
