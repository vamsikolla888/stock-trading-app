import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { Badge } from '@/components/ui/Badge';
import { stockLogoUrl } from '@/features/market/api';
import {
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import { ACTION_LABEL, ACTION_TONE, alertState, convictionLabel } from '../lib/signals';
import type { Signal } from '../types';

import { DotLabel, Metric, NUM, signedClass } from './SignalParts';

/**
 * One evaluated setup (web: a row of "All evaluated setups"): the stock and its call, the price
 * at the check, the measured record beside today's 1–5 read, the reason in two lines, and where
 * it stands against the alert rules. Tap for the full reason, risk and evidence.
 */
export const SignalRow = memo(function SignalRow({
  signal,
  onPress,
}: {
  signal: Signal;
  onPress: () => void;
}) {
  const alert = alertState(signal);
  const measured = signal.hitRatePct != null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ACTION_LABEL[signal.action]} ${signal.companyName ?? signal.symbol}. ${
        measured
          ? `Historical hit rate ${formatPercent(signal.hitRatePct, 1)}`
          : 'Hit rate not measured'
      }, past average ${formatSignedPercent(signal.avgReturnPct, 2)}, today ${convictionLabel(signal.conviction)}. ${alert.label}`}
      accessibilityHint="Shows the reason, the risk and the evidence"
      onPress={onPress}
      className="gap-2.5 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-start gap-3">
        <StockLogo symbol={signal.symbol} uri={stockLogoUrl(signal.symbol)} />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            <Text
              className="flex-shrink text-[15px] font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {signal.symbol}
            </Text>
            <Badge label={ACTION_LABEL[signal.action]} variant={ACTION_TONE[signal.action]} />
          </View>
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {signal.companyName ?? signal.screenerName}
          </Text>
        </View>
        <View className="items-end">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark" style={NUM}>
            {formatINR(signal.ltp)}
          </Text>
          <ChangeText value={signal.changePct} className="mt-0.5 text-xs" style={NUM}>
            {formatSignedPercent(signal.changePct)}
          </ChangeText>
        </View>
      </View>

      <View className="flex-row gap-3 pl-[48px]">
        <Metric
          label="Hit rate"
          value={measured ? formatPercent(signal.hitRatePct, 1) : '—'}
          sub={
            signal.sampleTrades != null
              ? `${formatNumber(signal.sampleTrades, 0)} matches`
              : measured
                ? undefined
                : 'Not measured'
          }
        />
        <Metric
          label="Past average"
          value={formatSignedPercent(signal.avgReturnPct, 2)}
          valueClassName={signedClass(signal.avgReturnPct)}
        />
        <Metric label="Today" value={convictionLabel(signal.conviction)} align="right" />
      </View>

      {signal.rationale ? (
        <Text
          className="pl-[48px] text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={2}
        >
          {signal.rationale}
        </Text>
      ) : null}
      <DotLabel tone={alert.tone} label={alert.label} className="pl-[48px]" />
    </Pressable>
  );
});
