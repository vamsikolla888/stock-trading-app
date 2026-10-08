import React, { memo, useCallback, useId, useMemo, useState } from 'react';
import {
  Pressable,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

import { axisLabel, nearestIndex } from '@/components/charts/chartScale';
import { useTheme } from '@/theme/ThemeProvider';

import { curvePaths, gridValues, signedDomain, yOf } from '../lib/chart';
import { NUM } from './parts';

const PAD_TOP = 8;
const AXIS_W = 52;
const AXIS_GAP = 8;

/**
 * The running total of net P&L, drawn against a zero line — the dashboard AreaChart's look, but
 * signed: a curve that dips below zero is drawn below it instead of being clipped to the axis.
 * Coloured by where the total ends (green up, red down). Tap to read a day; the readout starts on
 * the latest one.
 */
export const NetCurve = memo(function NetCurve({
  labels,
  values,
  height = 160,
  format,
  axisFormat = format,
  readoutLabel = 'Running total',
  accessibilityLabel,
}: {
  labels: readonly string[];
  values: readonly number[];
  height?: number;
  format: (value: number) => string;
  /** Shorter labels for the axis gutter ("₹2.5k"). */
  axisFormat?: (value: number) => string;
  /** The word before the picked value ("Running total", "Return"). */
  readoutLabel?: string;
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

  const count = values.length;
  const plotH = height - PAD_TOP;
  const plotW = Math.max(0, width - AXIS_W);
  const domain = useMemo(() => signedDomain(values), [values]);
  const paths = useMemo(
    () => curvePaths(values, plotW, plotH, domain, PAD_TOP),
    [values, plotW, plotH, domain],
  );

  if (count < 2) {
    return (
      <View style={{ height: 96 }} className="items-center justify-center">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Not enough trading days to draw yet.
        </Text>
      </View>
    );
  }

  const last = values[count - 1] ?? 0;
  const color = last < 0 ? colors.loss : colors.gain;
  const index = Math.min(picked ?? count - 1, count - 1);
  const value = values[index] ?? 0;
  const x = (i: number) => (i / (count - 1)) * plotW;
  const y = (v: number) => yOf(v, domain.lo, domain.hi, plotH, PAD_TOP);
  const onPress = (event: GestureResponderEvent) =>
    setPicked(nearestIndex(Math.min(event.nativeEvent.locationX, plotW), plotW, count));

  return (
    <View>
      <View accessibilityLiveRegion="polite" className="mb-2 flex-row items-center gap-2">
        <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{labels[index]}</Text>
        <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
          {readoutLabel}{' '}
          <Text className="font-semibold text-ink dark:text-ink-dark" style={NUM}>
            {format(value)}
          </Text>
        </Text>
      </View>
      <Pressable
        accessible
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`Tap a point to read its ${readoutLabel.toLowerCase()}`}
        onPress={onPress}
        onLayout={onLayout}
        style={{ height }}
      >
        {width > 0 ? (
          <Svg width={width} height={height} pointerEvents="none">
            <Defs>
              <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity={0.2} />
                <Stop offset="1" stopColor={color} stopOpacity={0.03} />
              </LinearGradient>
            </Defs>
            {gridValues(domain.lo, domain.hi).map((g) => (
              <Line
                key={g}
                x1={0}
                x2={plotW}
                y1={y(g)}
                y2={y(g)}
                stroke={g === 0 ? colors.borderStrong : colors.border}
                strokeWidth={1}
                strokeDasharray={g === 0 ? undefined : '3 4'}
              />
            ))}
            <Path d={paths.area} fill={`url(#${gradientId})`} />
            <Path
              d={paths.line}
              fill="none"
              stroke={color}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <Line
              x1={x(index)}
              x2={x(index)}
              y1={PAD_TOP}
              y2={height}
              stroke={colors.borderStrong}
              strokeWidth={1}
            />
            <Circle
              cx={x(index)}
              cy={y(value)}
              r={3.5}
              fill={colors.surface}
              stroke={color}
              strokeWidth={2}
            />
          </Svg>
        ) : null}
        {width > 0
          ? gridValues(domain.lo, domain.hi).map((g) => (
              <Text
                key={g}
                pointerEvents="none"
                numberOfLines={1}
                className="absolute right-0 text-right text-[10px] text-ink-faint dark:text-ink-dark-faint"
                style={[NUM, { top: y(g) - 7, width: AXIS_W - AXIS_GAP }]}
              >
                {axisLabel(axisFormat(g))}
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
