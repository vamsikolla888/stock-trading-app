import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { ScrollTabs } from '@/components/ui/Tabs';
import { PaperAnalyticsSection } from '@/features/paper/components/PaperAnalyticsSection';
import {
  PaperHoldingsSection,
  PaperPositionsSection,
} from '@/features/paper/components/PaperBookSections';
import { PaperFundsSection } from '@/features/paper/components/PaperFundsSection';
import { PaperOrdersSection } from '@/features/paper/components/PaperOrdersSection';
import { PaperSummaryCard } from '@/features/paper/components/PaperSummaryCard';
import { ProfileButton, ProfileSheet } from '@/features/paper/components/ProfileSwitcher';
import {
  useActivePaperProfile,
  usePaperOrders,
  usePaperPortfolio,
  usePaperQuotes,
  usePaperSegments,
} from '@/features/paper/hooks';
import { paperKeys } from '@/features/paper/keys';
import { paperKpis, type KpiScope } from '@/features/paper/lib/book';
import type { CashSegment, PaperPortfolio } from '@/features/paper/types';
import { useLiveBookQuotes } from '@/features/paper/useLiveBookQuotes';
import { afterSheetClose } from '@/features/trading/components/Sheet';
import { StockSearchSheet, type StockPick } from '@/features/trading/components/StockSearchSheet';
import { ticketHref } from '@/features/trading/lib/ticket';
import { useNow } from '@/hooks/useNow';

type BookTab = 'holdings' | 'positions' | 'orders' | 'funds' | 'analytics';

const TABS: readonly { key: BookTab; label: string }[] = [
  { key: 'holdings', label: 'Holdings' },
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Orders' },
  { key: 'funds', label: 'Funds' },
  { key: 'analytics', label: 'Analytics' },
];

const TAB_KEYS = new Set<string>(TABS.map((tab) => tab.key));

/** Holdings read delivery, Positions intraday, and every other tab the whole wallet. */
function scopeOf(tab: BookTab): KpiScope {
  if (tab === 'holdings') return 'equity';
  if (tab === 'positions') return 'intraday';
  return 'account';
}

/**
 * Paper trading (Trade › Paper trading) — virtual cash, real prices, no broker. Shaped like a
 * broker's own account screen, as on the web: a summary card that follows the tab, then the book
 * — Holdings (delivery), Positions (intraday), Orders, Funds and Analytics. ONE wallet funds both
 * products; F&O paper trading has its own pool on the F&O tab. The tab lives in the route
 * (`?tab=funds`), so other screens can link straight to a part of the book.
 */
export default function PaperTradingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();
  const params = useLocalSearchParams<{ tab?: string }>();
  const tab: BookTab =
    typeof params.tab === 'string' && TAB_KEYS.has(params.tab)
      ? (params.tab as BookTab)
      : 'holdings';
  const setTab = useCallback((next: BookTab) => router.setParams({ tab: next }), [router]);

  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  /** The product a new paper order is being searched for; null while the search is closed. */
  const [searchFor, setSearchFor] = useState<CashSegment | null>(null);

  const { profiles, active, profileId, select } = useActivePaperProfile();
  const overview = usePaperSegments(profileId);
  const delivery = usePaperPortfolio('equity', profileId);
  const intraday = usePaperPortfolio('intraday', profileId);
  const orders = usePaperOrders(profileId, 200);

  // One live-price read for every open position, whichever tab is showing.
  const allPositions = useMemo(
    () => [...(delivery.data?.positions ?? []), ...(intraday.data?.positions ?? [])],
    [delivery.data, intraday.data],
  );
  const quotes = usePaperQuotes(allPositions);
  // The polled quotes with live ticks laid over them: marks, KPIs and summary move together.
  const bookQuotes = useLiveBookQuotes(allPositions, quotes.data);

  const wallet = overview.data?.wallet ?? delivery.data?.wallet ?? intraday.data?.wallet ?? null;
  const scope = scopeOf(tab);
  const kpis = useMemo(
    () =>
      paperKpis(scope, {
        delivery: delivery.data,
        intraday: intraday.data,
        wallet,
        quotes: bookQuotes,
        now,
      }),
    [scope, delivery.data, intraday.data, wallet, bookQuotes, now],
  );
  const openOrders = orders.data?.filter((order) => order.status === 'PENDING').length ?? 0;

  const onRefresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: paperKeys.all }),
    [queryClient],
  );

  const openTrade = useCallback(
    (ticket: {
      symbol: string;
      exchange: string;
      side: 'BUY' | 'SELL';
      qty?: number;
      product?: 'delivery' | 'intraday';
    }) => router.push(ticketHref({ ...ticket, mode: 'paper', profileId })),
    [router, profileId],
  );

  // New paper orders start from an in-place search, never the app-wide search: a stock's own
  // page opens the ticket in LIVE mode when a broker is connected, and a paper screen must not
  // hand the user a real-money ticket.
  const quickPicks: StockPick[] = allPositions
    .filter((position) => position.exchange === 'NSE' || position.exchange === 'BSE')
    .filter(
      (position, index, list) =>
        list.findIndex(
          (other) => other.symbol === position.symbol && other.exchange === position.exchange,
        ) === index,
    )
    .map((position) => ({
      exchange: position.exchange as 'NSE' | 'BSE',
      symbol: position.symbol,
      companyName: position.companyName,
    }));
  const pickStock = (pick: StockPick) => {
    const product = searchFor ?? 'equity';
    setSearchFor(null);
    afterSheetClose(() =>
      openTrade({
        symbol: pick.symbol,
        exchange: pick.exchange,
        side: 'BUY',
        product: product === 'intraday' ? 'intraday' : 'delivery',
      }),
    );
  };

  const scopePortfolio: PaperPortfolio | undefined =
    scope === 'equity' ? delivery.data : scope === 'intraday' ? intraday.data : undefined;
  const summaryLoading = overview.isPending && delivery.isPending;

  return (
    <>
      <GroupScreen
        intro="Virtual cash · real prices · no broker"
        onRefresh={onRefresh}
        right={
          profiles.data && profiles.data.length > 0 ? (
            <ProfileButton name={active?.name ?? null} onPress={() => setProfileSheetOpen(true)} />
          ) : undefined
        }
        footer={
          <View className="border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">
            <Button
              label={tab === 'positions' ? 'Place an intraday order' : 'Place a paper order'}
              size="lg"
              fullWidth
              onPress={() => setSearchFor(tab === 'positions' ? 'intraday' : 'equity')}
            />
          </View>
        }
      >
        {summaryLoading ? (
          <ListSkeleton rows={2} />
        ) : overview.error && !wallet ? (
          <InlineError
            what="your paper account"
            error={overview.error}
            onRetry={() => void overview.refetch()}
          />
        ) : (
          <PaperSummaryCard
            kpis={kpis}
            wallet={wallet}
            portfolio={scopePortfolio}
            onOpenFunds={() => setTab('funds')}
          />
        )}

        <ScrollTabs
          items={TABS}
          value={tab}
          onChange={setTab}
          className="mb-4 mt-6"
          badges={{ orders: openOrders }}
        />

        {tab === 'holdings' ? (
          <ProductBook
            query={delivery}
            what="your holdings"
            render={(portfolio) => (
              <PaperHoldingsSection
                portfolio={portfolio}
                quotes={bookQuotes}
                profileId={profileId}
                now={now}
                onTrade={openTrade}
                onNewOrder={setSearchFor}
              />
            )}
          />
        ) : tab === 'positions' ? (
          <ProductBook
            query={intraday}
            what="your intraday positions"
            render={(portfolio) => (
              <PaperPositionsSection
                portfolio={portfolio}
                quotes={bookQuotes}
                profileId={profileId}
                now={now}
                onTrade={openTrade}
                onNewOrder={setSearchFor}
              />
            )}
          />
        ) : tab === 'orders' ? (
          <PaperOrdersSection
            orders={orders.data}
            isPending={orders.isPending}
            error={orders.error}
            onRetry={() => void orders.refetch()}
            profileId={profileId}
            now={now}
          />
        ) : tab === 'funds' ? (
          <PaperFundsSection
            overview={overview.data}
            isPending={overview.isPending}
            error={overview.error}
            onRetry={() => void overview.refetch()}
            profileId={profileId}
            profileName={active?.name ?? null}
            profileCount={profiles.data?.length ?? 1}
          />
        ) : (
          <PaperAnalyticsSection profileId={profileId} />
        )}

        <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Paper orders use real market prices; no real money or broker is involved.
        </Text>
      </GroupScreen>

      <StockSearchSheet
        visible={searchFor !== null}
        title="New paper order"
        subtitle={`${searchFor === 'intraday' ? 'Intraday' : 'Delivery'} · virtual cash`}
        onClose={() => setSearchFor(null)}
        onPick={pickStock}
        quickPicks={quickPicks}
        quickPicksTitle="In this book"
        actionLabel="Trade"
      />

      {profileSheetOpen && profiles.data ? (
        <ProfileSheet
          profiles={profiles.data}
          activeId={profileId}
          onSelect={(id) => {
            select(id);
            setProfileSheetOpen(false);
          }}
          onClose={() => setProfileSheetOpen(false)}
        />
      ) : null}
    </>
  );
}

/** One product's book — loading, failure, or the section itself. */
function ProductBook({
  query,
  what,
  render,
}: {
  query: { data?: PaperPortfolio; isPending: boolean; error: unknown; refetch: () => unknown };
  what: string;
  render: (portfolio: PaperPortfolio) => React.ReactNode;
}) {
  if (query.data) return <>{render(query.data)}</>;
  if (query.isPending) return <ListSkeleton rows={3} />;
  return <InlineError what={what} error={query.error} onRetry={() => void query.refetch()} />;
}
