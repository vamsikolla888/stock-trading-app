import React, { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

import type { Tone } from '../lib/format';

/** The rating as a ring — the web draws it as a gauge. Null (no rating) is an empty ring. */
export const ScoreRing = memo(function ScoreRing({
  value,
  tone,
  size = 92,
  label = 'rating',
}: {
  value: number | null;
  tone: Tone;
  size?: number;
  label?: string;
}) {
  const { colors } = useTheme();
  const stroke = Math.max(6, Math.round(size / 11));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = value == null ? 0 : Math.min(100, Math.max(0, value));
  const color = {
    success: colors.accent,
    primary: colors.accent,
    warning: colors.warning,
    danger: colors.danger,
    neutral: colors.textFaint,
  }[tone];

  return (
    <View
      accessible
      accessibilityLabel={value == null ? 'No rating' : `Rating ${Math.round(clamped)} percent`}
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      <Svg width={size} height={size} style={{ position: 'absolute' }} accessible={false}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.border}
          strokeWidth={stroke}
          fill="none"
        />
        {value != null ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={[circumference, circumference]}
            strokeDashoffset={circumference * (1 - clamped / 100)}
            // Start at twelve o'clock.
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
      </Svg>
      <Text
        className="font-bold text-ink dark:text-ink-dark"
        style={{ fontSize: size * 0.26, fontVariant: ['tabular-nums'], letterSpacing: -0.5 }}
      >
        {value == null ? '—' : Math.round(clamped)}
        {value == null ? null : <Text style={{ fontSize: size * 0.13 }}>%</Text>}
      </Text>
      {label ? (
        <Text className="text-[10px] uppercase tracking-wide text-ink-faint dark:text-ink-dark-faint">
          {label}
        </Text>
      ) : null}
    </View>
  );
});
