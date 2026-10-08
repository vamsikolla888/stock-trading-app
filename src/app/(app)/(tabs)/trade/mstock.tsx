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
import {
  HoldingsSection,
  type HoldingExtras,
} from '@/features/portfolio/components/HoldingsSection';
import { OrderHistorySection } from '@/features/portfolio/components/OrderHistorySection';
import { PerformanceSection } from '@/features/portfolio/components/PerformanceSection';
import { PositionsSection } from '@/features/portfolio/components/PositionsSection';
import {
  MstockFundsSection,
  TradesSection,
} from '@/features/portfolio/components/TradesFundsSections';
import { portfolioKeys, useHoldingReviews, useMstockPortfolio } from '@/features/portfolio/hooks';
import { formatAsOf } from '@/features/portfolio/lib/dates';
import { dayMove, fromBrokerHolding, liveTotals } from '@/features/portfolio/lib/portfolio';
import { useLiveHoldings } from '@/features/portfolio/useLiveHoldings';
import { formatINR } from '@/lib/utils/formatters';

type SectionKey = 'holdings' | 'positions' | 'orders' | 'trades' | 'funds' | 'analytics';

const BROKER = 'mstock';
const LABEL = 'mStock';

/**
 * The mStock portfolio — the one connected live broker, on its own. Every figure comes
 * straight from mStock (never hand-entered): holdings, today's positions, the order and
 * trade books, funds, and the analytics the web shows. Buy / Sell / Exit open the ticket
 * against mStock with the usual review and risk checks.
 */
export default function MstockPortfolioScreen() {
  const queryClient = useQueryClient();
  const { query, state } = useMstockPortfolio();
  const snapshot = query.data;
  const [section, setSection] = useState<SectionKey>('holdings');
  // The AI portfolio review covers this book — each holding's verdict sits in its row.
  const reviews = useHoldingReviews();

  const restHoldings = useMemo(() => snapshot?.holdings.map(fromBrokerHolding) ?? [], [snapshot]);
  // Re-priced at the live feed's ticks: rows, totals and the day's move follow the market.
  const holdings = useLiveHoldings(restHoldings);
  const totals = useMemo(
    () => (snapshot ? liveTotals(snapshot.totals, restHoldings, holdings) : null),
    [snapshot, restHoldings, holdings],
  );
  const extras = useMemo(() => {
    const map: Record<string, HoldingExtras> = {};
    for (const holding of snapshot?.holdings ?? []) {
      map[`${holding.exch}:${holding.sym}`] = { flag: holding.flag, t1Qty: holding.t1Qty };
    }
    return map;
  }, [snapshot]);
  const positions = useMemo(() => snapshot?.positionRows ?? [], [snapshot]);
  const openPositions = positions.filter((row) => row.qty !== 0).length;
  const day = useMemo(() => dayMove(holdings), [holdings]);

  const onRefresh = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: portfolioKeys.all }),
        queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
      ]),
    [queryClient],
  );

  const intro =
    snapshot && state === 'connected'
      ? `Synced ${formatAsOf(snapshot.asOf)}${snapshot.stale ? ' · refreshing' : ''}`
      : 'Your live mStock account';

  const sections: readonly { key: SectionKey; label: string }[] = [
    { key: 'holdings', label: `Holdings${holdings.length ? ` (${holdings.length})` : ''}` },
    { key: 'positions', label: `Positions${openPositions ? ` (${openPositions})` : ''}` },
    { key: 'orders', label: 'Orders' },
    { key: 'trades', label: 'Trades' },
    { key: 'funds', label: 'Funds' },
    { key: 'analytics', label: 'Analytics' },
  ];

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
          brokerLabel={LABEL}
          error={query.error}
          notConnectedMessage="Connect mStock to see your holdings, positions, orders and funds here — live, straight from your account."
          sessionMessage="mStock resets sessions nightly at midnight IST. Reconnect with today's code to keep syncing."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {snapshot ? (
        <>
          {state !== 'connected' ? (
            <Banner
              className="mb-3"
              tone="info"
              message={`Showing the last figures read at ${formatAsOf(snapshot.asOf)}.`}
            />
          ) : null}
          <BookSummaryCard
            value={holdings.length > 0 && totals ? totals.value : null}
            invested={holdings.length > 0 && totals ? totals.invested : null}
            pnl={holdings.length > 0 && totals ? totals.pnl : null}
            pnlPct={holdings.length > 0 && totals ? totals.pnlPct : null}
            day={holdings.length > 0 ? day : null}
            dayUnavailable={holdings.length === 0 ? 'No holdings yet' : undefined}
            extras={[
              {
                label: 'Available funds',
                value:
                  snapshot.funds?.available !== undefined
                    ? formatINR(snapshot.funds.available)
                    : '—',
                sensitive: true,
              },
              {
                label: 'Open positions',
                value: String(openPositions),
              },
            ]}
            footnote={
              snapshot.funds === null
                ? "mStock didn't return funds just now — it retries on the next refresh."
                : undefined
            }
          />

          <Chips items={sections} value={section} onChange={setSection} className="mb-4 mt-5" />

          {section === 'holdings' ? (
            <HoldingsSection
              holdings={holdings}
              broker="mstock"
              brokerLabel={LABEL}
              tradable
              extras={extras}
              emptyMessage="No holdings in your mStock account yet."
              reviews={holdings.length > 0 ? reviews : undefined}
            />
          ) : section === 'positions' ? (
            <PositionsSection rows={positions} broker="mstock" brokerLabel={LABEL} tradable />
          ) : section === 'orders' ? (
            <OrderHistorySection broker={BROKER} brokerLabel={LABEL} />
          ) : section === 'trades' ? (
            <TradesSection broker={BROKER} brokerLabel={LABEL} />
          ) : section === 'funds' ? (
            <MstockFundsSection funds={snapshot.funds} />
          ) : (
            <PerformanceSection holdings={restHoldings} scope="mstock" />
          )}
        </>
      ) : null}
    </GroupScreen>
  );
}
