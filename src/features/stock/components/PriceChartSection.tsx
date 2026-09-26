import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import { RangeSelector } from '@/components/ui/Tabs';
import { useCandles } from '@/features/market/hooks';
import {
  CHART_RANGES,
  candlesToPoints,
  formatPointTime,
  type ChartRange,
} from '@/features/market/lib/chartRanges';
import { formatINR, formatSignedINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const RANGE_LABEL: Record<ChartRange, string> = {
  '1D': 'today',
  '1W': 'past week',
  '1M': 'past month',
  '1Y': 'past year',
  '5Y': 'past 5 years',
};

interface PriceChartSectionProps {
  symbol: string;
  exchange: string;
  ltp: number | null;
  prevClose: number | null;
  marketOpen: boolean;
  /** Where the price came from, when that isn't obvious (broker time, saved snapshot). */
  note?: string | null;
}

/**
 * Price headline + chart. The headline follows the chart: the day's move on 1D (against the
 * previous close), the range's move otherwise, and the scrubbed point while a finger is down.
 */
export function PriceChartSection({
  symbol,
  exchange,
  ltp,
  prevClose,
  marketOpen,
  note,
}: PriceChartSectionProps) {
  const { colors } = useTheme();
  const [range, setRange] = useState<ChartRange>('1D');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const candles = useCandles(symbol, exchange, range);

  const points = useMemo(() => candlesToPoints(candles.data ?? [], range), [candles.data, range]);
  const baseline = range === '1D' ? prevClose : null;
  const reference = range === '1D' ? prevClose : (points[0]?.value ?? null);

  const shownPrice = scrub?.value ?? ltp;
  const change = shownPrice != null && reference != null ? shownPrice - reference : null;
  const changePct = change != null && reference ? (change / reference) * 100 : null;
  const label = scrub
    ? formatPointTime(scrub.time, range)
    : range === '1D' && !marketOpen
      ? 'last session'
      : RANGE_LABEL[range];

  return (
    <View>
      <View className="mt-5" accessibilityLiveRegion="polite">
        <Text
          className="text-[30px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -1, fontVariant: ['tabular-nums'] }}
        >
          {formatINR(shownPrice)}
        </Text>
        <View className="mt-0.5 flex-row items-center gap-1.5">
          <ChangeText
            value={change}
            className="text-[13px]"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {change != null
              ? `${formatSignedINR(change)} (${formatSignedPercent(changePct)})`
              : '—'}
          </ChangeText>
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
        </View>
        {note && !scrub ? (
          <Text className="mt-1 text-[11px] text-ink-faint dark:text-ink-dark-faint">{note}</Text>
        ) : null}
      </View>

      <View className="-mx-5 mt-4 border-y border-line bg-surface px-5 dark:border-line-dark dark:bg-surface-dark">
        <View className="h-[200px] justify-center pt-2">
          {points.length > 1 ? (
            <PriceChart points={points} baseline={baseline} onScrub={setScrub} height={190} />
          ) : candles.isPending || candles.isFetching ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {candles.error
                ? getErrorMessage(candles.error)
                : 'No price history for this range yet.'}
            </Text>
          )}
        </View>
        <RangeSelector items={CHART_RANGES} value={range} onChange={setRange} className="py-3" />
      </View>
    </View>
  );
}
