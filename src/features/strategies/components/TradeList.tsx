import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Badge } from '@/components/ui/Badge';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { barDate } from '@/features/insights/lib/dates';
import { stockHref } from '@/lib/navigation';
import { formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import { exitReasonLabel, tradeReturnPercent } from '../lib/backtest';
import type { BacktestTrade } from '../types';

const REASON_VARIANT: Record<string, 'success' | 'danger' | 'neutral'> = {
  target: 'success',
  stop: 'danger',
};

/** Backtest trades as rows — no quantity or ₹ P&L, because the test sizes in equal slots. */
export function TradeList({ trades }: { trades: readonly BacktestTrade[] }) {
  const router = useRouter();
  return (
    <ListCard>
      {trades.map((trade, index) => {
        // The server sends a trade's return as a fraction (0.031), not a percentage.
        const returnPct = tradeReturnPercent(trade);
        return (
          <View key={`${trade.exchange}:${trade.symbol}:${trade.entryTime}:${index}`}>
            {index > 0 ? <RowDivider /> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${trade.symbol}, ${formatSignedPercent(returnPct, 2)}, ${exitReasonLabel(trade.exitReason)}`}
              onPress={() => router.push(stockHref(trade.symbol, trade.exchange))}
              className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <View className="min-w-0 flex-1">
                <Text
                  className="text-sm font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {trade.symbol}
                </Text>
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={1}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {barDate(trade.entryTime, false)} → {barDate(trade.exitTime, false)} ·{' '}
                  {trade.barsHeld} bars
                </Text>
                <Text
                  className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                  numberOfLines={1}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  ₹{formatNumber(trade.entryPrice)} → ₹{formatNumber(trade.exitPrice)}
                </Text>
              </View>
              <View className="items-end gap-1">
                <ChangeText
                  value={returnPct}
                  className="text-sm"
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatSignedPercent(returnPct, 2)}
                </ChangeText>
                <Badge
                  label={exitReasonLabel(trade.exitReason)}
                  variant={REASON_VARIANT[trade.exitReason] ?? 'neutral'}
                />
              </View>
            </Pressable>
          </View>
        );
      })}
    </ListCard>
  );
}
