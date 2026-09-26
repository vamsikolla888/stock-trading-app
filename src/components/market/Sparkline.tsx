import React, { memo, useMemo } from 'react';
import Svg, { Path } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

interface SparklineProps {
  data: readonly number[];
  width?: number;
  height?: number;
  /** Defaults to gain/loss colour from first vs last point. */
  color?: string;
}

export function sparklinePath(
  data: readonly number[],
  width: number,
  height: number,
  inset = 1.5,
): string {
  const values = data.filter((value) => Number.isFinite(value));
  if (values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (width - inset * 2) / (values.length - 1);
  return values
    .map((value, index) => {
      const x = inset + index * stepX;
      const y = inset + (1 - (value - min) / range) * (height - inset * 2);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Tiny trend line for index cards and rows. Renders nothing without two data points. */
export const Sparkline = memo(function Sparkline({
  data,
  width = 44,
  height = 18,
  color,
}: SparklineProps) {
  const { colors } = useTheme();
  const path = useMemo(() => sparklinePath(data, width, height), [data, width, height]);
  if (!path) return null;

  const first = data[0] ?? 0;
  const last = data[data.length - 1] ?? 0;
  const stroke = color ?? (last >= first ? colors.gain : colors.loss);

  return (
    <Svg width={width} height={height} accessible={false}>
      <Path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
});
