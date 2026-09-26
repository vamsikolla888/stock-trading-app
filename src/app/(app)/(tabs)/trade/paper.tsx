import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockRow } from '@/components/market/StockRow';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Tabs } from '@/components/ui/Tabs';
import { stockLogoUrl } from '@/features/market/api';
import { usePaperOrders, usePaperPortfolio, usePaperSegments } from '@/features/trading/hooks';
import type { CashSegment, PaperOrderStatus } from '@/features/trading/types';
import { stockHref } from '@/lib/navigation';
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

export default function PaperTradingScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [segment, setSegment] = useState<CashSegment>('equity');
  const overview = usePaperSegments();
  const portfolio = usePaperPortfolio(segment);
  const orders = usePaperOrders();
  const combined = overview.data?.combined;

  return (
    <GroupScreen
      intro="Virtual cash · real prices · no broker"
      onRefresh={() => queryClient.invalidateQueries({ queryKey: ['paper'] })}
      footer={
        <View className="border-t border-line px-5 pb-2 pt-3 dark:border-line-dark">
          <Button
            label="Place a paper order"
            size="lg"
            fullWidth
            onPress={() => router.push('/search')}
          />
        </View>
      }
    >
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
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">Account value</Text>
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
        </View>
      ) : null}

      <Tabs items={SEGMENTS} value={segment} onChange={setSegment} className="mt-6" />

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
        <>
          <View className="mt-4 flex-row gap-4">
            <Metric label="Cash" value={formatINR(portfolio.data.cash)} />
            <Metric label="Invested" value={formatINR(portfolio.data.investedValue)} />
            <Metric
              label="P&L"
              value={`${formatSignedINR(portfolio.data.totalPnl)} (${formatSignedPercent(portfolio.data.totalPnlPct)})`}
              tone={portfolio.data.totalPnl}
            />
          </View>
          <Section title={`Positions (${portfolio.data.positions.length})`}>
            {portfolio.data.positions.length === 0 ? (
              <InlineEmpty
                title="No open positions"
                message="Buy any stock in paper mode to start practising."
              />
            ) : (
              <ListCard>
                {portfolio.data.positions.map((position, index) => (
                  <View key={`${position.exchange}:${position.symbol}:${position.product}`}>
                    {index > 0 ? <RowDivider /> : null}
                    <StockRow
                      symbol={position.symbol}
                      name={position.companyName}
                      exchange={position.exchange}
                      logoUri={stockLogoUrl(position.symbol)}
                      subtitle={`${formatQuantity(position.quantity)} shares · Avg ${formatINR(position.avgPrice)}`}
                      onPress={() => router.push(stockHref(position.symbol, position.exchange))}
                      right={
                        <View className="items-end">
                          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                            {formatINR(position.currentValue ?? position.investedValue)}
                          </Text>
                          <ChangeText value={position.unrealisedPnl} className="mt-0.5 text-xs">
                            {formatSignedPercent(position.unrealisedPct)}
                          </ChangeText>
                        </View>
                      }
                    />
                  </View>
                ))}
              </ListCard>
            )}
          </Section>
        </>
      ) : null}

      {orders.data && orders.data.length > 0 ? (
        <Section title="Recent paper orders">
          <ListCard>
            {orders.data.slice(0, 10).map((order, index) => (
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
                  </View>
                  <Badge label={order.status} variant={ORDER_VARIANT[order.status]} />
                </View>
              </View>
            ))}
          </ListCard>
        </Section>
      ) : null}

      {overview.data?.caveats.map((caveat) => (
        <Text
          key={caveat}
          className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
        >
          {caveat}
        </Text>
      ))}
    </GroupScreen>
  );
}
