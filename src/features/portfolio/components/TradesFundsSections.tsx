import React from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Card } from '@/components/ui/Card';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { KpiGrid } from '@/components/ui/KpiGrid';
import { Meter } from '@/components/ui/Meter';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Note, SideTag } from '@/features/trading/components/Sheet';
import { formatINR, formatQuantity } from '@/lib/utils/formatters';

import { useBrokerTrades } from '../hooks';
import { marginUsedPct, tradesSummary } from '../lib/book';
import { istTime } from '../lib/dates';
import type { BrokerFunds, LinkedPortfolioSnapshot } from '../types';

import { useMask } from './BookSummaryCard';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/** Today's executions from the broker's trade book. */
export function TradesSection({ broker, brokerLabel }: { broker: string; brokerLabel: string }) {
  const trades = useBrokerTrades(broker);
  const mask = useMask();

  if (trades.isPending) return <ListSkeleton rows={3} />;
  if (trades.error && !trades.data) {
    return (
      <InlineError
        what="today's trades"
        error={trades.error}
        onRetry={() => void trades.refetch()}
      />
    );
  }
  const rows = trades.data ?? [];
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title="No trades today"
        message={`${brokerLabel}'s trade book covers today. Earlier executions are under Orders.`}
      />
    );
  }
  const { bought, sold } = tradesSummary(rows);

  return (
    <View>
      <KpiGrid
        className="mb-3"
        items={[
          { label: 'Bought today', value: mask(formatINR(bought)) },
          { label: 'Sold today', value: mask(formatINR(sold)) },
        ]}
      />
      <ListCard>
        {rows.map((trade, index) => (
          <View key={`${trade.brokerOrderId}:${trade.tradeId ?? trade.tradedAt ?? index}`}>
            {index > 0 ? <RowDivider /> : null}
            <View className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-3">
              <View className="min-w-0 flex-1">
                <View className="flex-row items-center gap-2">
                  <SideTag side={trade.side} />
                  <Text
                    className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {trade.tradingsymbol ?? '—'}
                  </Text>
                </View>
                <Text
                  className="mt-1 text-xs text-ink-muted dark:text-ink-dark-muted"
                  style={NUMBERS}
                  numberOfLines={1}
                >
                  {formatQuantity(trade.quantity)} @ {formatINR(trade.price)}
                  {trade.product ? ` · ${trade.product}` : ''} · {istTime(trade.tradedAt)}
                </Text>
              </View>
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
                {mask(formatINR(trade.value))}
              </Text>
            </View>
          </View>
        ))}
      </ListCard>
      <Note>Executions only, before charges. Order numbers are on each order under Orders.</Note>
    </View>
  );
}

/** mStock's equity-segment funds: margin in use, then the balances. */
export function MstockFundsSection({ funds }: { funds: BrokerFunds | null | undefined }) {
  const mask = useMask();
  if (!funds) {
    return (
      <InlineEmpty
        title="Funds unavailable right now"
        message="mStock didn't return a fund summary just now — it retries on the next refresh."
      />
    );
  }
  const usedPct = marginUsedPct(funds);
  const money = (value: number | undefined) => (value === undefined ? '—' : mask(formatINR(value)));

  return (
    <View>
      <Card>
        <View className="mb-2 flex-row items-baseline justify-between gap-3">
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">Margin used</Text>
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUMBERS}>
            {money(funds.used)} of {money(funds.openingBalance)}
          </Text>
        </View>
        <Meter
          value={usedPct}
          tone={usedPct > 85 ? 'warning' : 'brand'}
          height={8}
          accessibilityLabel={`Margin used ${Math.round(usedPct)} percent`}
        />
      </Card>
      <KpiGrid
        className="mt-3"
        items={[
          { label: 'Available to trade', value: money(funds.available), sub: 'equity segment' },
          { label: 'Used margin', value: money(funds.used), sub: 'orders and positions' },
          { label: 'Opening balance', value: money(funds.openingBalance), sub: 'start of day' },
          { label: 'Collateral', value: money(funds.collateral), sub: 'pledged holdings' },
          {
            label: 'Realised profit',
            value: money(funds.realisedProfit),
            sub: 'today',
            ...(funds.realisedProfit !== undefined ? { trend: funds.realisedProfit } : {}),
          },
          { label: 'Withdrawal requested', value: money(funds.payout), sub: 'payout pending' },
        ]}
      />
      <Note>
        Add or withdraw money in the mStock app — this app can read your funds but never moves
        money.
      </Note>
    </View>
  );
}

/** A linked broker's funds, with its full breakdown as the broker labels it. */
export function LinkedFundsSection({ snapshot }: { snapshot: LinkedPortfolioSnapshot }) {
  const mask = useMask();
  const funds = snapshot.funds;
  if (!funds) {
    return (
      <InlineEmpty
        title="Funds unavailable right now"
        message={`${snapshot.label} didn't return funds just now — it retries on the next refresh.`}
      />
    );
  }
  const money = (value: number | null) => (value === null ? '—' : mask(formatINR(value)));

  return (
    <View>
      <KpiGrid
        items={[
          { label: 'Available to trade', value: money(funds.available), sub: 'delivery (CNC)' },
          { label: 'Margin used', value: money(funds.used), sub: 'orders and positions' },
          { label: 'Clear cash', value: money(funds.cash), sub: 'settled cash' },
          { label: 'Collateral', value: money(funds.collateral), sub: 'pledged holdings' },
          {
            label: 'Charges today',
            value: funds.chargesToday === null ? '—' : formatINR(funds.chargesToday),
            sub: `reported by ${snapshot.label}`,
          },
        ]}
      />
      {funds.breakdown && funds.breakdown.length > 0 ? (
        <Card className="mt-3">
          <Text className="mb-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
            Full breakdown
          </Text>
          {funds.breakdown.map((line, index) => (
            <KeyValueRow
              key={line.label}
              label={line.label}
              value={money(line.value)}
              divider={index > 0}
            />
          ))}
        </Card>
      ) : null}
      <Note>
        Add or withdraw money in the {snapshot.label} app — this app reads your funds but never
        moves money.
      </Note>
    </View>
  );
}
