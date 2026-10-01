import React, { memo, useCallback, useMemo, useState } from 'react';
import { View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useSwipeHold } from '@/components/navigation/swipeLock';
import { useTheme } from '@/theme/ThemeProvider';

export interface ChartPoint {
  /** Epoch milliseconds. */
  time: number;
  value: number;
}

interface PriceChartProps {
  points: readonly ChartPoint[];
  height?: number;
  /** Dashed reference line, e.g. previous close on the 1D view. */
  baseline?: number | null;
  /** Receives the point under the finger while scrubbing, then null on release. */
  onScrub?: (point: ChartPoint | null) => void;
}

const PAD_Y = 12;

interface Geometry {
  line: string;
  area: string;
  xs: number[];
  ys: number[];
  baselineY: number | null;
}

export function buildChartGeometry(
  points: readonly ChartPoint[],
  width: number,
  height: number,
  baseline?: number | null,
): Geometry | null {
  if (width <= 0 || points.length < 2) return null;
  const values = points.map((point) => point.value);
  if (typeof baseline === 'number') values.push(baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const toY = (value: number) => PAD_Y + (1 - (value - min) / range) * (height - PAD_Y * 2);

  const xs = points.map((_, index) => index * stepX);
  const ys = points.map((point) => toY(point.value));
  const line = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${ys[i]!.toFixed(1)}`)
    .join(' ');
  const area = `${line} L${width.toFixed(1)} ${height} L0 ${height} Z`;

  return { line, area, xs, ys, baselineY: typeof baseline === 'number' ? toY(baseline) : null };
}

/**
 * Line + gradient area chart, drawn in one SVG (no charting library to load). Touching
 * the chart scrubs through points; the parent ScrollView can still take the gesture for
 * a vertical scroll, which simply ends the scrub.
 */
export const PriceChart = memo(function PriceChart({
  points,
  height = 185,
  baseline,
  onScrub,
}: PriceChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  // Scrubbing sideways must not turn a swipeable tab page underneath (swipeLock.ts).
  const swipe = useSwipeHold();

  const geometry = useMemo(
    () => buildChartGeometry(points, width, height, baseline),
    [points, width, height, baseline],
  );

  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;
  const reference = typeof baseline === 'number' ? baseline : first;
  const stroke = last >= reference ? colors.accent : colors.loss;

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const scrubTo = useCallback(
    (event: GestureResponderEvent) => {
      if (!geometry || points.length === 0) return;
      const x = Math.max(0, Math.min(width, event.nativeEvent.locationX));
      const index = Math.round((x / width) * (points.length - 1));
      setActiveIndex(index);
      onScrub?.(points[index] ?? null);
    },
    [geometry, points, width, onScrub],
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

  const activeX = activeIndex !== null ? geometry?.xs[activeIndex] : undefined;
  const activeY = activeIndex !== null ? geometry?.ys[activeIndex] : undefined;

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
      accessibilityLabel="Price chart"
    >
      {geometry ? (
        <Svg width={width} height={height}>
          <Defs>
            <LinearGradient id="priceArea" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={stroke} stopOpacity={0.18} />
              <Stop offset="1" stopColor={stroke} stopOpacity={0} />
            </LinearGradient>
          </Defs>
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
          <Path d={geometry.area} fill="url(#priceArea)" />
          <Path
            d={geometry.line}
            fill="none"
            stroke={stroke}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {activeX !== undefined && activeY !== undefined ? (
            <>
              <Line
                x1={activeX}
                x2={activeX}
                y1={0}
                y2={height}
                stroke={colors.borderStrong}
                strokeWidth={1}
              />
              <Circle
                cx={activeX}
                cy={activeY}
                r={5}
                fill={colors.surface}
                stroke={stroke}
                strokeWidth={2}
              />
            </>
          ) : null}
        </Svg>
      ) : null}
    </View>
  );
});
