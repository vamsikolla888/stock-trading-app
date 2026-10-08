import React, { memo, useCallback, useId, useMemo, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import { axisLabel, nearestIndex, niceCeil, stackTops } from './chartScale';

export interface AreaSeries {
  key: string;
  label: string;
  color: string;
  values: readonly number[];
}

const PAD_TOP = 10;
/** Right-hand gutter for the axis values, so they never sit on the latest point. */
const AXIS_W = 46;
/** Clear space between the plot's edge (and its end-point marker) and the axis values. */
const AXIS_GAP = 8;
const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * A time series as filled lines — requests per hour, tokens per day. Straight segments (no
 * smoothing that invents values between points), a zero-based axis with a "nice" top, and three
 * hairline gridlines labelled at the right. Several series share the axis; `stacked` piles them
 * so the top edge is the total (input + output tokens).
 *
 * Tap anywhere on the plot to read a point; the readout above the chart starts on the latest one,
 * so the number most people want needs no tap.
 */
export const AreaChart = memo(function AreaChart({
  labels,
  series,
  height = 150,
  stacked = false,
  format = (value: number) => value.toLocaleString('en-IN'),
  accessibilityLabel,
}: {
  /** One label per point (the x axis), oldest first. */
  labels: readonly string[];
  series: readonly AreaSeries[];
  height?: number;
  stacked?: boolean;
  format?: (value: number) => string;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '');
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const next = Math.floor(event.nativeEvent.layout.width);
    setWidth((current) => (current === next ? current : next));
  }, []);

  const count = labels.length;
  const { tops, bases, max } = useMemo(
    () =>
      stackTops(
        series.map((s) => s.values),
        stacked,
      ),
    [series, stacked],
  );
  const top = niceCeil(max);
  const plotH = height - PAD_TOP;
  const plotW = Math.max(0, width - AXIS_W);

  const geometry = useMemo(() => {
    const x = (i: number) => (count <= 1 ? plotW / 2 : (i / (count - 1)) * plotW);
    const y = (v: number) => PAD_TOP + plotH - (v / top) * plotH;
    const paths =
      width <= 0 || count < 2
        ? []
        : series.map((s, k) => {
            const t = tops[k] ?? [];
            const b = bases[k] ?? [];
            const line = t
              .map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
              .join(' ');
            const back = b
              .map((v, i) => `L${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
              .reverse()
              .join(' ');
            return { key: s.key, color: s.color, line, area: `${line} ${back} Z` };
          });
    return { x, y, paths };
  }, [series, tops, bases, width, plotW, count, top, plotH]);

  if (count < 2) {
    return (
      <View style={{ height }} className="items-center justify-center">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not enough points to draw yet.
        </Text>
      </View>
    );
  }

  const { x, y, paths } = geometry;
  const index = Math.min(picked ?? count - 1, count - 1);
  const total = tops[tops.length - 1]?.[index] ?? 0;
  const onPress = (event: GestureResponderEvent) =>
    setPicked(nearestIndex(Math.min(event.nativeEvent.locationX, plotW), plotW, count));

  return (
    <View>
      {/* The readout: the picked point — the latest until a tap. */}
      <View
        accessibilityLiveRegion="polite"
        className="mb-2 flex-row flex-wrap items-center gap-x-3 gap-y-1"
      >
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{labels[index]}</Text>
        {series.map((s) => (
          <View key={s.key} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: s.color }} />
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {series.length > 1 ? `${s.label} ` : ''}
              <Text className="font-semibold text-ink dark:text-ink-dark" style={NUM}>
                {format(s.values[index] ?? 0)}
              </Text>
            </Text>
          </View>
        ))}
        {stacked && series.length > 1 ? (
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
            Total{' '}
            <Text className="font-semibold text-ink dark:text-ink-dark" style={NUM}>
              {format(total)}
            </Text>
          </Text>
        ) : null}
      </View>

      <Pressable
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Tap a point to read its value"
        onPress={onPress}
        onLayout={onLayout}
        style={{ height }}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              {paths.map((p) => (
                <LinearGradient
                  key={p.key}
                  id={`${gradientId}${p.key}`}
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor={p.color} stopOpacity={0.24} />
                  <Stop offset="1" stopColor={p.color} stopOpacity={0.02} />
                </LinearGradient>
              ))}
            </Defs>
            {[0, 0.5, 1].map((f) => (
              <Line
                key={f}
                x1={0}
                x2={plotW}
                y1={y(top * f)}
                y2={y(top * f)}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray={f === 0 ? undefined : '3 4'}
              />
            ))}
            {paths.map((p) => (
              <Path key={`a-${p.key}`} d={p.area} fill={`url(#${gradientId}${p.key})`} />
            ))}
            {paths.map((p) => (
              <Path
                key={`l-${p.key}`}
                d={p.line}
                fill="none"
                stroke={p.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            <Line
              x1={x(index)}
              x2={x(index)}
              y1={PAD_TOP}
              y2={height}
              stroke={colors.borderStrong}
              strokeWidth={1}
            />
            {series.map((s, k) => (
              <Circle
                key={`d-${s.key}`}
                cx={x(index)}
                cy={y(tops[k]?.[index] ?? 0)}
                r={3.5}
                fill={colors.surface}
                stroke={s.color}
                strokeWidth={2}
              />
            ))}
          </Svg>
        ) : null}
        {/* Axis values in the right-hand gutter, level with their gridlines. */}
        {width > 0
          ? [0, 0.5, 1].map((f) => (
              <Text
                key={f}
                pointerEvents="none"
                numberOfLines={1}
                className="absolute right-0 text-right text-[10px] text-ink-faint dark:text-ink-dark-faint"
                style={[NUM, { top: y(top * f) - 7, width: AXIS_W - AXIS_GAP }]}
              >
                {axisLabel(format(top * f))}
              </Text>
            ))
          : null}
      </Pressable>

      <View className="mt-1.5 flex-row justify-between" style={{ marginRight: AXIS_W }}>
        {[0, Math.floor((count - 1) / 2), count - 1].map((i, position) => (
          <Text
            key={`${i}-${position}`}
            className="text-[10px] text-ink-faint dark:text-ink-dark-faint"
          >
            {labels[i]}
          </Text>
        ))}
      </View>
    </View>
  );
});
