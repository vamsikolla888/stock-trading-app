import React, { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

import { formatPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: readonly DonutSegment[];
  size?: number;
  thickness?: number;
}

/** Allocation donut + legend. Segments are drawn as dashed circle strokes — no arc math, crisp at any size. */
export const Donut = memo(function Donut({ segments, size = 92, thickness = 17 }: DonutProps) {
  const { colors } = useTheme();
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const fraction = total > 0 ? Math.max(0, segment.value) / total : 0;
    const arc = { ...segment, fraction, dash: fraction * circumference, offset };
    offset += fraction * circumference;
    return arc;
  });

  return (
    <View className="flex-row items-center gap-5">
      <Svg width={size} height={size} accessible={false}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={colors.border}
            strokeWidth={thickness}
            fill="none"
          />
          {arcs.map((arc) =>
            arc.dash > 0 ? (
              <Circle
                key={arc.label}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={arc.color}
                strokeWidth={thickness}
                strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                strokeDashoffset={-arc.offset}
                fill="none"
              />
            ) : null,
          )}
        </G>
      </Svg>
      <View className="flex-1 gap-2.5">
        {arcs.map((arc) => (
          <View
            key={arc.label}
            accessible
            accessibilityLabel={`${arc.label}: ${formatPercent(arc.fraction * 100, 0)}`}
            className="flex-row items-center gap-2"
          >
            <View className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: arc.color }} />
            <Text
              className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted"
              numberOfLines={1}
            >
              {arc.label}
            </Text>
            <Text className="text-xs font-semibold text-ink dark:text-ink-dark">
              {formatPercent(arc.fraction * 100, 0)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
});
