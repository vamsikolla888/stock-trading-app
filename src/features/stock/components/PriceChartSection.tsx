import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import TrendingUpIcon from 'lucide-react-native/icons/trending-up';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CandlestickChart } from '@/components/market/CandlestickChart';
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
 * Price headline + chart. Shows Candlestick chart (TradingView style with wicks, bodies,
 * volume histogram, and crosshair) by default, with option to toggle to line view.
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
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const candles = useCandles(symbol, exchange, range);

  const candleList = candles.data ?? [];
  const points = useMemo(() => candlesToPoints(candleList, range), [candleList, range]);
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
      <View className="mt-5 flex-row items-start justify-between" accessibilityLiveRegion="polite">
        <View className="flex-1">
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

        {/* Chart type toggle button (Candlestick / Line) */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Switch to ${chartType === 'candlestick' ? 'line' : 'candlestick'} chart`}
          onPress={() => setChartType((prev) => (prev === 'candlestick' ? 'line' : 'candlestick'))}
          className="flex-row items-center gap-1 rounded-lg border border-line bg-surface-sunk px-2.5 py-1.5 active:opacity-70 dark:border-line-dark dark:bg-surface-sunk-dark"
        >
          {chartType === 'candlestick' ? (
            <>
              <ChartCandlestick size={16} color={colors.accent} />
              <Text className="text-xs font-semibold text-brand-strong dark:text-brand-strong-dark">
                Candles
              </Text>
            </>
          ) : (
            <>
              <TrendingUpIcon size={16} color={colors.accent} />
              <Text className="text-xs font-semibold text-brand-strong dark:text-brand-strong-dark">
                Line
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <View className="-mx-5 mt-4 border-y border-line bg-surface px-5 dark:border-line-dark dark:bg-surface-dark">
        <View className="h-[200px] justify-center pt-2">
          {candleList.length > 1 ? (
            chartType === 'candlestick' ? (
              <CandlestickChart
                candles={candleList}
                baseline={baseline}
                onScrub={(c) => setScrub(c ? { time: c.time, value: c.close } : null)}
                height={190}
              />
            ) : (
              <PriceChart points={points} baseline={baseline} onScrub={setScrub} height={190} />
            )
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
