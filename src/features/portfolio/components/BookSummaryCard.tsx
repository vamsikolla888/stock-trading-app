import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatPercent, formatSignedINR, MASKED_VALUE } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/** Masks a portfolio amount while the user has hidden their values. */
export function useMask(): (text: string) => string {
  const hideValues = usePreferencesStore((state) => state.hideValues);
  return useCallback((text: string) => (hideValues ? MASKED_VALUE : text), [hideValues]);
}

/** "+₹1,240.00 (2.10%)" — the sign on the amount, the percent unsigned in brackets. */
export function formatReturn(abs: number | null | undefined, pct: number | null | undefined) {
  if (abs === null || abs === undefined || !Number.isFinite(abs)) return '—';
  return pct === null || pct === undefined || !Number.isFinite(pct)
    ? formatSignedINR(abs)
    : `${formatSignedINR(abs)} (${formatPercent(Math.abs(pct))})`;
}

/** The eye toggle on portfolio values — remembered, so values stay hidden in public. */
export function HideValuesButton() {
  const { colors } = useTheme();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const toggle = usePreferencesStore((state) => state.toggleHideValues);
  const Icon = hideValues ? EyeOff : Eye;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={hideValues ? 'Show values' : 'Hide values'}
      hitSlop={10}
      onPress={toggle}
      className="h-8 w-8 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      <Icon size={18} color={colors.textMuted} />
    </Pressable>
  );
}

export interface SummaryExtra {
  label: string;
  value: string;
  /** Colours the value by sign. */
  trend?: number | null;
  /** Portfolio money — masked while values are hidden. */
  sensitive?: boolean;
}

interface BookSummaryCardProps {
  /** Big figure; null renders a dash. */
  value: number | null;
  valueLabel?: string;
  invested: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** Today's move across the book; null when not every row reports one. */
  day?: { abs: number; pct: number | null } | null;
  /** Shown instead of the day line when the move is unknown. */
  dayUnavailable?: string;
  extras?: readonly SummaryExtra[];
  footnote?: string;
  className?: string;
}

/**
 * Groww's portfolio header: current value large, today's move under it, then invested and
 * total returns side by side, and any broker extras (funds, charges) in a quiet row.
 */
export function BookSummaryCard({
  value,
  valueLabel = 'Current value',
  invested,
  pnl,
  pnlPct,
  day,
  dayUnavailable,
  extras = [],
  footnote,
  className,
}: BookSummaryCardProps) {
  const mask = useMask();
  const session = isMarketOpen() ? 'today' : 'last session';

  return (
    <View
      className={cn(
        'rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{valueLabel}</Text>
      <Text
        className="mt-1 text-[26px] font-bold text-ink dark:text-ink-dark"
        style={{ letterSpacing: -0.8, ...NUMBERS }}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value === null ? '—' : mask(formatINR(value))}
      </Text>
      {day ? (
        <ChangeText value={day.abs} className="mt-0.5 text-[13px]" style={NUMBERS}>
          {mask(formatReturn(day.abs, day.pct))} {session}
        </ChangeText>
      ) : dayUnavailable ? (
        <Text className="mt-0.5 text-xs text-ink-faint dark:text-ink-dark-faint">
          {dayUnavailable}
        </Text>
      ) : null}

      <View className="mt-4 flex-row gap-4 border-t border-line pt-3 dark:border-line-dark">
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Invested</Text>
          <Text
            className="mt-1 text-sm font-semibold text-ink dark:text-ink-dark"
            style={NUMBERS}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {invested === null ? '—' : mask(formatINR(invested))}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Total returns</Text>
          <ChangeText
            value={pnl}
            className="mt-1 text-sm"
            style={NUMBERS}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {pnl === null ? '—' : mask(formatReturn(pnl, pnlPct))}
          </ChangeText>
        </View>
      </View>

      {extras.length > 0 ? (
        <View className="mt-3 flex-row flex-wrap gap-y-3">
          {extras.map((extra) => (
            <View key={extra.label} className="w-1/2 pr-2">
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
                {extra.label}
              </Text>
              {extra.trend !== undefined ? (
                <ChangeText
                  value={extra.trend}
                  className="mt-1 text-sm"
                  style={NUMBERS}
                  numberOfLines={1}
                >
                  {extra.sensitive ? mask(extra.value) : extra.value}
                </ChangeText>
              ) : (
                <Text
                  className="mt-1 text-sm font-semibold text-ink dark:text-ink-dark"
                  style={NUMBERS}
                  numberOfLines={1}
                >
                  {extra.sensitive ? mask(extra.value) : extra.value}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {footnote ? (
        <Text className="mt-3 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/** Placeholder with the card's footprint while the book loads. */
export function BookSummarySkeleton() {
  return (
    <View
      accessibilityLabel="Loading"
      className="gap-3 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <View className="h-3 w-24 rounded bg-line dark:bg-line-dark" />
      <View className="h-7 w-44 rounded-md bg-line dark:bg-line-dark" />
      <View className="h-3 w-32 rounded bg-line dark:bg-line-dark" />
      <View className="mt-2 flex-row gap-4">
        <View className="h-8 flex-1 rounded bg-line dark:bg-line-dark" />
        <View className="h-8 flex-1 rounded bg-line dark:bg-line-dark" />
      </View>
    </View>
  );
}
