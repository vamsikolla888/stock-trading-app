import { useRouter } from 'expo-router';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import TrendingUpIcon from 'lucide-react-native/icons/trending-up';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CandlestickChart } from '@/components/market/CandlestickChart';
import { ChangeText } from '@/components/market/ChangeText';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import { RangeSelector } from '@/components/ui/Tabs';
import { useLiveCandles } from '@/features/charts/useLiveCandles';
import { useCandles } from '@/features/market/hooks';
import {
  CHART_RANGES,
  candlesErrorMessage,
  candlesToPoints,
  formatPointTime,
  RANGE_REQUEST,
  sessionCandles,
  type ChartRange,
} from '@/features/market/lib/chartRanges';
import type { Candle } from '@/features/market/types';
import { chartHref } from '@/lib/navigation';
import { formatINR, formatSignedINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

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
 * volume histogram, and crosshair) by default, with option to toggle to line view. While the
 * market is open the live price (`ltp`, streamed by the stock page) folds into the forming
 * candle and opens the next one when its interval runs out; the expand button opens the
 * full advanced chart.
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
  const router = useRouter();
  const [range, setRange] = useState<ChartRange>('1D');
  const [chartType, setChartType] = useState<'candlestick' | 'line'>('candlestick');
  const [scrub, setScrub] = useState<ChartPoint | null>(null);
  const candles = useCandles(symbol, exchange, range);

  // Both chart types draw the same bars: on 1D only the latest session, never the tail of
  // the previous day that the 80-bar request also returns.
  const serverBars = useMemo(
    () => sessionCandles(candles.data ?? [], range),
    [candles.data, range],
  );
  const candleList = useLiveCandles(
    serverBars,
    ltp,
    RANGE_REQUEST[range].minutesPerBar * 60,
    marketOpen,
    `${exchange}:${symbol}:${range}`,
  );
  const points = useMemo(() => candlesToPoints(candleList, range), [candleList, range]);
  // Candle times are unix seconds; chart points (and the scrub label) are epoch ms.
  const onCandleScrub = useCallback(
    (candle: Candle | null) =>
      setScrub(candle ? { time: candle.time * 1000, value: candle.close } : null),
    [],
  );
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

        <View className="flex-row items-center gap-2">
          {/* Chart type toggle button (Candlestick / Line) */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Switch to ${chartType === 'candlestick' ? 'line' : 'candlestick'} chart`}
            onPress={() =>
              setChartType((prev) => (prev === 'candlestick' ? 'line' : 'candlestick'))
            }
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
      </View>

      <View className="-mx-5 mt-4 border-y border-line bg-surface px-5 dark:border-line-dark dark:bg-surface-dark">
        <View className="h-[250px] justify-center pt-2">
          {candleList.length > 1 ? (
            chartType === 'candlestick' ? (
              <CandlestickChart
                candles={candleList}
                baseline={baseline}
                onScrub={onCandleScrub}
                height={240}
              />
            ) : (
              <PriceChart points={points} baseline={baseline} onScrub={setScrub} height={240} />
            )
          ) : candles.isPending || candles.isFetching ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
              {candles.error
                ? candlesErrorMessage(candles.error)
                : 'No price history for this range yet.'}
            </Text>
          )}
        </View>
        <View className="flex-row items-center justify-between gap-2 py-3">
          <RangeSelector items={CHART_RANGES} value={range} onChange={setRange} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Full screen chart"
            accessibilityHint="Opens the detailed chart in landscape, with intervals and indicators"
            hitSlop={6}
            onPress={() => router.push(chartHref(symbol, exchange, { fullscreen: true }))}
            className="flex-row items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
          >
            <Maximize2 size={14} color={colors.accent} />
            <Text className="text-xs font-semibold text-brand-strong dark:text-brand-strong-dark">
              Full screen
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
