import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';

import {
  buildCandlestickGeometry,
  candleGroupSize,
  groupCandles,
} from '@/components/market/candleLayout';
import { useSwipeHold } from '@/components/navigation/swipeLock';
import type { Candle } from '@/features/market/types';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

export interface CandlestickChartProps {
  candles: readonly Candle[];
  height?: number;
  /** Dashed reference line, e.g. previous close on 1D view. */
  baseline?: number | null;
  /** Receives the candle under the finger while scrubbing, then null on release. */
  onScrub?: (candle: Candle | null) => void;
}

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/**
 * Interactive TradingView-style Candlestick Chart rendered with react-native-svg.
 * Displays OHLC wicks, candle bodies, volume bars, baseline, and crosshair scrubbing.
 */
export const CandlestickChart = memo(function CandlestickChart({
  candles,
  height = 190,
  baseline,
  onScrub,
}: CandlestickChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Scrubbing sideways must not turn a swipeable tab page underneath (swipeLock.ts).
  const swipe = useSwipeHold();

  // More bars than fit at a readable width merge into wider candles (candleLayout.ts).
  const drawn = useMemo(
    () => groupCandles(candles, candleGroupSize(candles.length, width)),
    [candles, width],
  );
  const geometry = useMemo(
    () => buildCandlestickGeometry(drawn, width, height, baseline),
    [drawn, width, height, baseline],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const scrubTo = useCallback(
    (event: GestureResponderEvent) => {
      if (!geometry || drawn.length === 0) return;
      const x = Math.max(0, Math.min(width, event.nativeEvent.locationX));
      const index = Math.min(drawn.length - 1, Math.max(0, Math.floor(x / geometry.slotWidth)));
      setActiveIndex(index);
      onScrub?.(drawn[index] ?? null);
    },
    [geometry, drawn, width, onScrub],
  );

  const startScrub = useCallback(
    (event: GestureResponderEvent) => {
      swipe.take();
      scrubTo(event);
    },
    [swipe, scrubTo],
  );

  const endScrub = useCallback(() => {
    swipe.release();
    setActiveIndex(null);
    onScrub?.(null);
  }, [swipe, onScrub]);

  const activeCandle = activeIndex !== null ? drawn[activeIndex] : null;
  const activeGeo = activeIndex !== null ? geometry?.candlesGeo[activeIndex] : null;
  const activeChangePct =
    activeCandle && activeCandle.open > 0
      ? ((activeCandle.close - activeCandle.open) / activeCandle.open) * 100
      : 0;

  return (
    <View
      style={{ height }}
      onLayout={onLayout}
      onStartShouldSetResponder={() => Boolean(geometry)}
      onResponderGrant={startScrub}
      onResponderMove={scrubTo}
      onResponderRelease={endScrub}
      onResponderTerminate={endScrub}
      accessibilityRole="image"
      accessibilityLabel="Candlestick chart"
    >
      {/* OHLC Bar Readout header */}
      {activeCandle ? (
        <View className="absolute left-1 top-0 z-10 flex-row flex-wrap items-center gap-2 rounded bg-surface/90 px-2 py-0.5 dark:bg-surface-dark/90">
          <Text
            className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted"
            style={NUMBERS}
          >
            O{' '}
            <Text className="font-bold text-ink dark:text-ink-dark">
              {formatINR(activeCandle.open)}
            </Text>
          </Text>
          <Text
            className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted"
            style={NUMBERS}
          >
            H{' '}
            <Text className="font-bold text-ink dark:text-ink-dark">
              {formatINR(activeCandle.high)}
            </Text>
          </Text>
          <Text
            className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted"
            style={NUMBERS}
          >
            L{' '}
            <Text className="font-bold text-ink dark:text-ink-dark">
              {formatINR(activeCandle.low)}
            </Text>
          </Text>
          <Text
            className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted"
            style={NUMBERS}
          >
            C{' '}
            <Text className="font-bold text-ink dark:text-ink-dark">
              {formatINR(activeCandle.close)}
            </Text>
          </Text>
          <Text
            className={`text-[11px] font-bold ${
              activeCandle.close >= activeCandle.open
                ? 'text-brand-strong dark:text-brand-strong-dark'
                : 'text-danger-600 dark:text-danger-dark'
            }`}
            style={NUMBERS}
          >
            {formatSignedPercent(activeChangePct)}
          </Text>
        </View>
      ) : null}

      {geometry ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="bullVol" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0.08} />
            </LinearGradient>
            <LinearGradient id="bearVol" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={colors.loss} stopOpacity={0.35} />
              <Stop offset="1" stopColor={colors.loss} stopOpacity={0.08} />
            </LinearGradient>
          </Defs>

          {/* Baseline previous close reference line */}
          {geometry.baselineY !== null ? (
            <Line
              x1={0}
              x2={width}
              y1={geometry.baselineY}
              y2={geometry.baselineY}
              stroke={colors.borderStrong}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}

          {/* Candles & Volume bars */}
          {geometry.candlesGeo.map((item, index) => {
            const candleColor = item.isBullish ? colors.accent : colors.loss;
            const isHovered = activeIndex === index;

            return (
              <React.Fragment key={item.candle.time}>
                {/* Volume Histogram bar */}
                {item.volHeight > 0 ? (
                  <Rect
                    x={item.x - geometry.bodyWidth / 2}
                    y={height - item.volHeight}
                    width={geometry.bodyWidth}
                    height={item.volHeight}
                    fill={item.isBullish ? 'url(#bullVol)' : 'url(#bearVol)'}
                    rx={0.5}
                  />
                ) : null}

                {/* Candle Wick (High to Low) */}
                <Line
                  x1={item.x}
                  x2={item.x}
                  y1={item.highY}
                  y2={item.lowY}
                  stroke={candleColor}
                  strokeWidth={isHovered ? 2 : 1.2}
                  strokeOpacity={isHovered ? 1 : 0.85}
                />

                {/* Candle Body (Open to Close) */}
                <Rect
                  x={item.x - geometry.bodyWidth / 2}
                  y={item.topY}
                  width={geometry.bodyWidth}
                  height={item.bodyHeight}
                  fill={candleColor}
                  stroke={isHovered ? colors.text : candleColor}
                  strokeWidth={isHovered ? 1 : 0}
                  rx={0.5}
                />
              </React.Fragment>
            );
          })}

          {/* Crosshair guide line on active scrubbed candle */}
          {activeGeo ? (
            <Line
              x1={activeGeo.x}
              x2={activeGeo.x}
              y1={0}
              y2={height}
              stroke={colors.borderStrong}
              strokeWidth={1}
              strokeDasharray="2 2"
            />
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});
