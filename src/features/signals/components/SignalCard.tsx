import { useRouter } from 'expo-router';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { Meter } from '@/components/ui/Meter';
import { stockLogoUrl } from '@/features/market/api';
import { metricSummary } from '@/features/screeners/lib/metrics';
import { stockHref } from '@/lib/navigation';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import { ACTION_TONE, alertState, convictionLabel } from '../lib/signals';
import type { Signal } from '../types';

const numbers = { fontVariant: ['tabular-nums' as const] };
const ACTION_LABEL = { BUY: 'Buy', SELL: 'Sell', WATCH: 'Watch' } as const;

/**
 * One signal. The measured hit rate (a frequency from that screener's own history) gets the
 * gauge; conviction — the model's read of today — is written as an ordinal ("3/5") and never
 * drawn as a bar, so it cannot be mistaken for a probability.
 */
export const SignalCard = memo(function SignalCard({ signal }: { signal: Signal }) {
  const router = useRouter();
  const alert = alertState(signal);
  const evidence = metricSummary(signal.metrics, 3);
  const measured = signal.hitRatePct != null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ACTION_LABEL[signal.action]} ${signal.companyName ?? signal.symbol}, from ${signal.screenerName}. ${
        measured
          ? `Measured hit rate ${formatPercent(signal.hitRatePct, 1)}`
          : 'Hit rate not measured'
      }. Conviction ${convictionLabel(signal.conviction)}. Open the stock`}
      onPress={() => router.push(stockHref(signal.symbol, signal.exchange))}
      className="rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <StockLogo symbol={signal.symbol} uri={stockLogoUrl(signal.symbol)} />
        <View className="min-w-0 flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {signal.companyName ?? signal.symbol}
          </Text>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {signal.symbol} · {signal.screenerName}
          </Text>
        </View>
        <Badge label={ACTION_LABEL[signal.action]} variant={ACTION_TONE[signal.action]} />
      </View>

      <View className="mt-3 flex-row items-baseline gap-1.5">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={numbers}>
          {formatINR(signal.ltp)}
        </Text>
        <ChangeText value={signal.changePct} className="text-xs" style={numbers}>
          {formatSignedPercent(signal.changePct)}
        </ChangeText>
      </View>

      <View className="mt-3 rounded-lg bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
        <View className="flex-row items-baseline justify-between gap-2">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Measured hit rate</Text>
          <Text className="text-sm font-bold text-ink dark:text-ink-dark" style={numbers}>
            {measured ? formatPercent(signal.hitRatePct, 1) : '—'}
          </Text>
        </View>
        {measured ? (
          <Meter
            value={signal.hitRatePct}
            tone="info"
            height={4}
            className="mt-1.5"
            accessibilityLabel={`Measured hit rate ${formatPercent(signal.hitRatePct, 1)}`}
          />
        ) : null}
        <Text
          className="mt-1.5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          style={numbers}
        >
          {measured
            ? `${signal.sampleTrades != null ? `${formatNumber(signal.sampleTrades, 0)} past matches` : 'Sample size unknown'}${
                signal.holdDays != null ? ` · ${signal.holdDays}-day hold` : ''
              }`
            : 'This screener has never been measured — not the same as 0%.'}
        </Text>
        <View className="mt-2 flex-row gap-3 border-t border-line pt-2 dark:border-line-dark">
          <View className="flex-1">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Avg return</Text>
            <ChangeText value={signal.avgReturnPct} className="mt-0.5 text-[13px]" style={numbers}>
              {formatSignedPercent(signal.avgReturnPct, 2)}
            </ChangeText>
          </View>
          <View className="flex-1">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">Conviction</Text>
            <Text
              className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
              style={numbers}
            >
              {convictionLabel(signal.conviction)}
            </Text>
          </View>
        </View>
      </View>

      {signal.rationale ? (
        <Text className="mt-3 text-[13px] leading-[19px] text-ink dark:text-ink-dark">
          {signal.rationale}
        </Text>
      ) : null}
      {signal.invalidation ? (
        <Text className="mt-1.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          Wrong if: {signal.invalidation}
        </Text>
      ) : null}
      {evidence ? (
        <Text
          className="mt-1.5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint"
          style={numbers}
        >
          {evidence}
        </Text>
      ) : null}

      <View className="mt-3">
        <Badge label={alert.label} variant={alert.tone} />
      </View>
    </Pressable>
  );
});
