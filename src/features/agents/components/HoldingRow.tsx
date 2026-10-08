import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { memo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StockLogo } from '@/components/market/StockLogo';
import { stockLogoUrl } from '@/features/market/api';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { relativeTime } from '@/features/settings/lib/time';
import { formatPercent, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { brokersLabel, holdingReturnPct, holdingState, signOf, VERDICT } from '../lib/view';
import type { HoldingSummary } from '../types';

import { NUM, signClass } from './Parts';
import { VerdictChip } from './Verdict';

/**
 * One holding in the portfolio review: logo, symbol and company, its verdict (or why it has
 * none) over the books that hold it, and one line of weight · return · when it was reviewed. A
 * verdict that flipped in the last day says what it was.
 */
export const HoldingRow = memo(function HoldingRow({
  holding,
  now,
  onPress,
}: {
  holding: HoldingSummary;
  now: number;
  onPress: (holding: HoldingSummary) => void;
}) {
  const { colors } = useTheme();
  const state = holdingState(holding);
  const evidence = holding.current?.evidence;
  const ret = holdingReturnPct(evidence?.holding?.averagePrice, evidence?.holding?.lastPrice);
  const weight = evidence?.holding?.portfolioWeightPct;
  const reviewed = holding.current ? relativeTime(holding.current.at, now) : null;
  const books = brokersLabel(holding.brokers);
  const verdictWord =
    state.kind === 'verdict'
      ? VERDICT[state.action].label
      : state.kind === 'reviewing'
        ? 'reviewing'
        : state.kind === 'failed'
          ? 'review failed'
          : 'no verdict yet';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${holding.symbol}, ${verdictWord}${holding.changed ? ', changed today' : ''}${books ? `, held in ${books}` : ''}. Read the review`}
      onPress={() => onPress(holding)}
      className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={holding.symbol} uri={stockLogoUrl(holding.symbol)} size="md" />
      <View className="min-w-0 flex-1">
        <View className="flex-row items-center gap-2">
          <Text
            className="flex-shrink text-sm font-semibold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {holding.symbol}
          </Text>
          {holding.changed && holding.lastChange ? (
            <Text
              className="text-[11px] font-semibold text-warning-600 dark:text-warning-dark"
              numberOfLines={1}
            >
              {`Changed · was ${VERDICT[holding.lastChange.from].label}`}
            </Text>
          ) : null}
        </View>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {holding.companyName ?? holding.exchange}
        </Text>
        {weight != null || ret != null || reviewed ? (
          <Text
            className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
            numberOfLines={1}
            style={NUM}
          >
            {weight != null ? `${formatPercent(weight, 1)} of book` : null}
            {weight != null && ret != null ? ' · ' : null}
            {ret != null ? (
              <Text className={signClass(signOf(ret))}>{formatSignedPercent(ret)}</Text>
            ) : null}
            {(weight != null || ret != null) && reviewed ? ' · ' : null}
            {reviewed ? `reviewed ${reviewed}` : null}
            {holding.inFlight && holding.current ? ' · updating' : null}
          </Text>
        ) : null}
      </View>
      <View className="items-end gap-1">
        {state.kind === 'verdict' ? (
          <VerdictChip action={state.action} />
        ) : state.kind === 'reviewing' ? (
          <StatusPill tone="info" label="Reviewing" />
        ) : state.kind === 'failed' ? (
          <StatusPill tone="bad" label="Failed" />
        ) : (
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">—</Text>
        )}
        {books ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" numberOfLines={1}>
            {books}
          </Text>
        ) : null}
      </View>
      <ChevronRight size={16} color={colors.textFaint} />
    </Pressable>
  );
});
