import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Tabs } from '@/components/ui/Tabs';
import {
  PaperHoldingsSection,
  PaperPositionsSection,
} from '@/features/paper/components/PaperBookSections';
import { ProfileButton, ProfileSheet } from '@/features/paper/components/ProfileSwitcher';
import {
  useActivePaperProfile,
  usePaperOrders,
  usePaperPortfolio,
  usePaperQuotes,
  usePaperSegments,
} from '@/features/paper/hooks';
import { paperKeys } from '@/features/paper/keys';
import type { CashSegment, PaperOrderStatus } from '@/features/paper/types';
import { afterSheetClose } from '@/features/trading/components/Sheet';
import { StockSearchSheet, type StockPick } from '@/features/trading/components/StockSearchSheet';
import { ticketHref } from '@/features/trading/lib/ticket';
import { useNow } from '@/hooks/useNow';
import {
  formatINR,
  formatQuantity,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';

const SEGMENTS: readonly { key: CashSegment; label: string }[] = [
  { key: 'equity', label: 'Delivery' },
  { key: 'intraday', label: 'Intraday' },
];

const ORDER_VARIANT: Record<PaperOrderStatus, 'success' | 'warning' | 'danger' | 'neutral'> = {
  FILLED: 'success',
  PENDING: 'warning',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

function Metric({ label, value, tone }: { label: string; value: string; tone?: number | null }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      {tone !== undefined ? (
        <ChangeText value={tone} className="mt-1 text-sm">
          {value}
        </ChangeText>
      ) : (
        <Text className="mt-1 text-sm font-semibold text-ink dark:text-ink-dark">{value}</Text>
      )}
    </View>
  );
}

/**
 * Paper trading hub — virtual cash, real prices, no broker. Mirrors the web's paper book:
 * a per-profile account overview, delivery holdings and intraday positions with full P&L,
 * the last 20 orders with realised returns, and a profile switcher for running separate
 * strategies side-by-side.
 */
export default function PaperTradingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const now = useNow();
  const [segment, setSegment] = useState<CashSegment>('equity');
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);
  /** The pool a new paper order is being searched for; null while the search is closed. */
  const [searchFor, setSearchFor] = useState<CashSegment | null>(null);

  const { profiles, active, profileId, select } = useActivePaperProfile();
  const overview = usePaperSegments(profileId);
  const portfolio = usePaperPortfolio(segment, profileId);
  const orders = usePaperOrders(profileId, 200);
  const combined = overview.data?.combined;

  // Live-mark positions against current prices.
  const positions = portfolio.data?.positions ?? [];
  const quotes = usePaperQuotes(positions);

  const onRefresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: paperKeys.all }),
    [queryClient],
  );

  const openTrade = useCallback(
    (params: {
      symbol: string;
      exchange: string;
      side: 'BUY' | 'SELL';
      qty?: number;
      product?: 'delivery' | 'intraday';
    }) =>
      router.push(
        ticketHref({
          ...params,
          mode: 'paper',
          profileId,
        }),
      ),
    [router, profileId],
  );

  // New paper orders start from an in-place search, never the app-wide search: a stock's
  // own page opens the ticket in LIVE mode when a broker is connected, and a paper screen
  // must not hand the user a real-money ticket.
  const quickPicks: StockPick[] = positions
    .filter((position) => position.exchange === 'NSE' || position.exchange === 'BSE')
    .map((position) => ({
      exchange: position.exchange as 'NSE' | 'BSE',
      symbol: position.symbol,
      companyName: position.companyName,
    }));
  const pickStock = (pick: StockPick) => {
    const pool = searchFor ?? segment;
    setSearchFor(null);
    afterSheetClose(() =>
      openTrade({
        symbol: pick.symbol,
        exchange: pick.exchange,
        side: 'BUY',
        product: pool === 'intraday' ? 'intraday' : 'delivery',
      }),
    );
  };

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
              label="Place a paper order"
              size="lg"
              fullWidth
              onPress={() => setSearchFor(segment)}
            />
          </View>
        }
      >
        {/* ── Account overview ── */}
        {overview.isPending ? (
          <ListSkeleton rows={2} />
        ) : overview.error ? (
          <InlineError
            what="your paper account"
            error={overview.error}
            onRetry={() => void overview.refetch()}
          />
        ) : combined ? (
          <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
              Account value
            </Text>
            <Text
              className="mt-1 text-[26px] font-bold text-ink dark:text-ink-dark"
              style={{ letterSpacing: -0.8 }}
            >
              {formatINR(combined.equity)}
            </Text>
            <View className="mt-4 flex-row gap-4">
              <Metric
                label="Total P&L"
                value={formatSignedINR(combined.totalPnl)}
                tone={combined.totalPnl}
              />
              <Metric label="Cash" value={formatINR(combined.cash)} />
              <Metric label="Charges" value={formatINR(combined.totalCharges)} />
            </View>
            {/* Delivery vs Intraday breakdown */}
            {(() => {
              const segs = overview.data?.segments ?? [];
              const equitySeg = segs.find((s) => s.segment === 'equity');
              const intradaySeg = segs.find((s) => s.segment === 'intraday');
              if (!equitySeg || !intradaySeg) return null;
              return (
                <View className="mt-3 border-t border-line pt-3 dark:border-line-dark">
                  <View className="flex-row gap-3">
                    <View className="flex-1 rounded-lg bg-surface-sunk px-2.5 py-2 dark:bg-surface-sunk-dark">
                      <Text className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
                        Delivery
                      </Text>
                      <Text className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark">
                        {formatINR(equitySeg.cash)}
                      </Text>
                      <Text className="text-[10px] text-ink-muted dark:text-ink-dark-muted">
                        cash left
                      </Text>
                    </View>
                    <View className="flex-1 rounded-lg bg-surface-sunk px-2.5 py-2 dark:bg-surface-sunk-dark">
                      <Text className="text-[10px] font-semibold uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
                        Intraday
                      </Text>
                      <Text className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark">
                        {formatINR(intradaySeg.cash)}
                      </Text>
                      <ChangeText value={intradaySeg.totalPnl} className="text-[10px]">
                        {formatSignedINR(intradaySeg.totalPnl)} P&L
                      </ChangeText>
                    </View>
                  </View>
                </View>
              );
            })()}
          </View>
        ) : null}

        {/* ── Delivery / Intraday tabs ── */}
        <Tabs items={SEGMENTS} value={segment} onChange={setSegment} className="mt-6" />

        {/* ── Per-segment positions book ── */}
        {portfolio.isPending ? (
          <View className="mt-4">
            <ListSkeleton rows={3} />
          </View>
        ) : portfolio.error ? (
          <InlineError
            className="mt-4"
            what="positions"
            error={portfolio.error}
            onRetry={() => void portfolio.refetch()}
          />
        ) : portfolio.data ? (
          <View className="mt-4">
            <View className="mb-4 flex-row gap-4">
              <Metric label="Cash" value={formatINR(portfolio.data.cash)} />
              <Metric label="Invested" value={formatINR(portfolio.data.investedValue)} />
              <Metric
                label="P&L"
                value={`${formatSignedINR(portfolio.data.totalPnl)} (${formatSignedPercent(portfolio.data.totalPnlPct)})`}
                tone={portfolio.data.totalPnl}
              />
            </View>
            {segment === 'equity' ? (
              <PaperHoldingsSection
                portfolio={portfolio.data}
                quotes={quotes.data}
                profileId={profileId}
                now={now}
                onTrade={(params) => openTrade(params)}
                onNewOrder={setSearchFor}
              />
            ) : (
              <PaperPositionsSection
                portfolio={portfolio.data}
                quotes={quotes.data}
                profileId={profileId}
                now={now}
                onTrade={(params) => openTrade(params)}
                onNewOrder={setSearchFor}
              />
            )}
          </View>
        ) : null}

        {/* ── Order log ── */}
        {orders.error && !orders.data ? (
          <Section title="Order log">
            <InlineError
              what="your paper orders"
              error={orders.error}
              onRetry={() => void orders.refetch()}
            />
          </Section>
        ) : null}
        {orders.data && orders.data.length > 0 ? (
          <Section title="Order log" note={`last ${Math.min(orders.data.length, 20)}`}>
            <ListCard>
              {orders.data.slice(0, 20).map((order, index) => (
                <View key={order.id}>
                  {index > 0 ? <RowDivider /> : null}
                  <View className="flex-row items-center gap-3 px-3.5 py-3">
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {order.side} {formatQuantity(order.quantity)} × {order.symbol}
                      </Text>
                      <Text
                        className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                        numberOfLines={2}
                      >
                        {order.type} ·{' '}
                        {order.filledPrice
                          ? `filled ${formatINR(order.filledPrice)}`
                          : formatINR(order.limitPrice)}
                        {order.note ? ` · ${order.note}` : ''}
                      </Text>
                      {order.realisedPnl != null ? (
                        <ChangeText value={order.realisedPnl} className="mt-0.5 text-xs">
                          {formatSignedINR(order.realisedPnl)} realised
                        </ChangeText>
                      ) : null}
                    </View>
                    <Badge label={order.status} variant={ORDER_VARIANT[order.status]} />
                  </View>
                </View>
              ))}
            </ListCard>
          </Section>
        ) : null}

        {(overview.data?.caveats ?? []).map((caveat) => (
          <Text
            key={caveat}
            className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          >
            {caveat}
          </Text>
        ))}

        <Text className="mt-4 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          Paper orders use real market prices but no real money or broker is involved.
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
