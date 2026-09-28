import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, Text, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Rect, Line, Defs, LinearGradient, Stop } from 'react-native-svg';

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

const PAD_Y = 16;
const NUMBERS = { fontVariant: ['tabular-nums' as const] };

interface CandleGeometry {
  x: number;
  highY: number;
  lowY: number;
  openY: number;
  closeY: number;
  topY: number;
  bottomY: number;
  bodyHeight: number;
  isBullish: boolean;
  volHeight: number;
  candle: Candle;
}

interface ChartGeometry {
  candlesGeo: CandleGeometry[];
  slotWidth: number;
  bodyWidth: number;
  baselineY: number | null;
}

export function buildCandlestickGeometry(
  candles: readonly Candle[],
  width: number,
  height: number,
  baseline?: number | null,
): ChartGeometry | null {
  if (width <= 0 || candles.length < 2) return null;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume || 0);

  if (typeof baseline === 'number' && Number.isFinite(baseline)) {
    highs.push(baseline);
    lows.push(baseline);
  }

  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...lows.concat(highs));
  const priceRange = maxPrice - minPrice || 1;

  const maxVolume = Math.max(...volumes) || 1;
  const maxVolHeight = height * 0.22;

  const slotWidth = width / candles.length;
  const bodyWidth = Math.max(1.8, Math.min(9, slotWidth * 0.65));

  const toY = (price: number) =>
    PAD_Y + (1 - (price - minPrice) / priceRange) * (height - PAD_Y * 2);

  const candlesGeo: CandleGeometry[] = candles.map((candle, index) => {
    const x = index * slotWidth + slotWidth / 2;
    const highY = toY(candle.high);
    const lowY = toY(candle.low);
    const openY = toY(candle.open);
    const closeY = toY(candle.close);
    const topY = Math.min(openY, closeY);
    const bottomY = Math.max(openY, closeY);
    const bodyHeight = Math.max(1.2, bottomY - topY);
    const isBullish = candle.close >= candle.open;
    const volHeight = ((candle.volume || 0) / maxVolume) * maxVolHeight;

    return {
      x,
      highY,
      lowY,
      openY,
      closeY,
      topY,
      bottomY,
      bodyHeight,
      isBullish,
      volHeight,
      candle,
    };
  });

  return {
    candlesGeo,
    slotWidth,
    bodyWidth,
    baselineY: typeof baseline === 'number' && Number.isFinite(baseline) ? toY(baseline) : null,
  };
}

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

  const geometry = useMemo(
    () => buildCandlestickGeometry(candles, width, height, baseline),
    [candles, width, height, baseline],
  );

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const scrubTo = useCallback(
    (event: GestureResponderEvent) => {
      if (!geometry || candles.length === 0) return;
      const x = Math.max(0, Math.min(width, event.nativeEvent.locationX));
      const index = Math.min(candles.length - 1, Math.max(0, Math.floor(x / geometry.slotWidth)));
      setActiveIndex(index);
      onScrub?.(candles[index] ?? null);
    },
    [geometry, candles, width, onScrub],
  );

  const endScrub = useCallback(() => {
    setActiveIndex(null);
    onScrub?.(null);
  }, [onScrub]);

  const activeCandle = activeIndex !== null ? candles[activeIndex] : null;
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
      onResponderGrant={scrubTo}
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
