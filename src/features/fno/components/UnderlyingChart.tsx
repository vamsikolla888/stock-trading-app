import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import ChartLine from 'lucide-react-native/icons/chart-line';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import React, { memo, useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CandlestickChart } from '@/components/market/CandlestickChart';
import { PriceChart, type ChartPoint } from '@/components/market/PriceChart';
import type { Candle } from '@/features/market/types';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { UNDERLYING_RANGES, type UnderlyingRange } from '../lib/underlying';

export const UNDERLYING_CHART_HEIGHT = 300;

export interface ChartScrub {
  /** Unix seconds. */
  time: number;
  value: number;
}

interface UnderlyingChartProps {
  bars: readonly Candle[];
  loading: boolean;
  /** Why there are no bars (an API reason or an error), when there are none. */
  message: string | null;
  onRetry?: () => void;
  /** Dashed reference line — the previous close on 1D. */
  baseline: number | null;
  range: UnderlyingRange;
  onRangeChange: (range: UnderlyingRange) => void;
  type: 'candles' | 'line';
  onTypeChange: (type: 'candles' | 'line') => void;
  onScrub: (scrub: ChartScrub | null) => void;
  onFullScreen: () => void;
  /** The bars are a previous range's, shown dimmed while the asked-for one loads. */
  stale?: boolean;
}

/**
 * The underlying's chart, as Groww draws it on an index page: candles (or a line) edge to edge,
 * a full-screen button in the chart's corner, and the range row with the candle/line switch at
 * its end. Scrubbing reports the bar under the finger so the price headline can follow it.
 */
export const UnderlyingChart = memo(function UnderlyingChart({
  bars,
  loading,
  message,
  onRetry,
  baseline,
  range,
  onRangeChange,
  type,
  onTypeChange,
  onScrub,
  onFullScreen,
  stale = false,
}: UnderlyingChartProps) {
  const { colors } = useTheme();
  const points = useMemo<ChartPoint[]>(
    () => bars.map((bar) => ({ time: bar.time * 1000, value: bar.close })),
    [bars],
  );
  const onCandleScrub = useCallback(
    (candle: Candle | null) => onScrub(candle ? { time: candle.time, value: candle.close } : null),
    [onScrub],
  );
  const onLineScrub = useCallback(
    (point: ChartPoint | null) =>
      onScrub(point ? { time: Math.round(point.time / 1000), value: point.value } : null),
    [onScrub],
  );

  let chart: React.ReactNode;
  if (bars.length > 1) {
    chart =
      type === 'candles' ? (
        <CandlestickChart
          candles={bars}
          baseline={baseline}
          onScrub={onCandleScrub}
          height={UNDERLYING_CHART_HEIGHT}
        />
      ) : (
        <PriceChart
          points={points}
          baseline={baseline}
          onScrub={onLineScrub}
          height={UNDERLYING_CHART_HEIGHT}
        />
      );
  } else if (loading) {
    chart = <ActivityIndicator color={colors.accent} />;
  } else {
    chart = (
      <View className="items-center gap-2 px-6">
        <Text className="text-center text-[13px] leading-5 text-ink-muted dark:text-ink-dark-muted">
          {message ?? 'No price history for this range yet.'}
        </Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            onPress={onRetry}
            hitSlop={6}
            className="rounded-lg px-3 py-1.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Try again
            </Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const NextType = type === 'candles' ? ChartLine : ChartCandlestick;

  return (
    <View>
      <View
        className="-mx-5 justify-center"
        style={{ height: UNDERLYING_CHART_HEIGHT, opacity: stale ? 0.45 : 1 }}
      >
        {chart}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Full screen chart"
          accessibilityHint="Opens the detailed chart full screen, with intervals and indicators"
          hitSlop={8}
          onPress={onFullScreen}
          className="absolute bottom-2 right-4 h-11 w-11 items-center justify-center rounded-full border border-line bg-surface active:opacity-80 dark:border-line-dark dark:bg-surface-dark"
        >
          <Maximize2 size={18} color={colors.text} />
        </Pressable>
      </View>

      <View className="mt-3 flex-row items-center">
        <View accessibilityRole="tablist" className="flex-1 flex-row justify-between pr-2">
          {UNDERLYING_RANGES.map((option) => {
            const on = option.key === range;
            return (
              <Pressable
                key={option.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${option.label} range`}
                hitSlop={4}
                onPress={() => onRangeChange(option.key)}
                className={cn(
                  'min-w-[42px] items-center rounded-full px-2.5 py-1.5',
                  on && 'border border-ink dark:border-ink-dark',
                )}
              >
                <Text
                  className={cn(
                    'text-[13px] font-semibold',
                    on ? 'text-ink dark:text-ink-dark' : 'text-ink-muted dark:text-ink-dark-muted',
                  )}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={type === 'candles' ? 'Show as a line' : 'Show as candles'}
          hitSlop={8}
          onPress={() => onTypeChange(type === 'candles' ? 'line' : 'candles')}
          className="h-9 w-9 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <NextType size={18} color={colors.accent} />
        </Pressable>
      </View>
    </View>
  );
});
