import React, { memo, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line, Rect } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

export interface Bar {
  label: string;
  value: number;
}

interface BarChartProps {
  bars: readonly Bar[];
  height?: number;
  /** Colour bars by sign (P&L); otherwise all bars use the brand colour. */
  signed?: boolean;
  /** Labels under the first, middle and last bars; the rest are omitted to stay legible. */
  showLabels?: boolean;
  accessibilityLabel?: string;
}

/**
 * Vertical bars around a zero line — daily/monthly P&L, counts per bucket. Negative
 * values hang below the axis. Measures its own width, so it fills whatever card holds it.
 */
export const BarChart = memo(function BarChart({
  bars,
  height = 140,
  signed = false,
  showLabels = true,
  accessibilityLabel,
}: BarChartProps) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const values = bars.map((bar) => bar.value).filter(Number.isFinite);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const zeroY = (max / span) * height;
  const slot = bars.length > 0 ? width / bars.length : 0;
  const barWidth = Math.max(2, Math.min(28, slot * 0.64));
  const labelIndexes = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1]);

  return (
    <View accessible accessibilityLabel={accessibilityLabel} onLayout={onLayout}>
      {width > 0 && bars.length > 0 ? (
        <Svg width={width} height={height}>
          <Line x1={0} x2={width} y1={zeroY} y2={zeroY} stroke={colors.border} strokeWidth={1} />
          {bars.map((bar, index) => {
            const value = Number.isFinite(bar.value) ? bar.value : 0;
            const barHeight = Math.max(1, (Math.abs(value) / span) * height);
            const y = value >= 0 ? zeroY - barHeight : zeroY;
            const fill = signed ? (value >= 0 ? colors.gain : colors.loss) : colors.accent;
            return (
              <Rect
                key={`${bar.label}-${index}`}
                x={index * slot + (slot - barWidth) / 2}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={Math.min(3, barWidth / 3)}
                fill={fill}
              />
            );
          })}
        </Svg>
      ) : (
        <View style={{ height }} />
      )}
      {showLabels && bars.length > 0 ? (
        <View className="mt-1.5 flex-row justify-between">
          {bars.map((bar, index) =>
            labelIndexes.has(index) ? (
              <Text
                key={`${bar.label}-${index}`}
                className="text-[10px] text-ink-faint dark:text-ink-dark-faint"
              >
                {bar.label}
              </Text>
            ) : null,
          )}
        </View>
      ) : null}
    </View>
  );
});
