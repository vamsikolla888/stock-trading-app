import React, { useCallback, useState } from 'react';
import { Pressable, Text, View, type LayoutChangeEvent } from 'react-native';

import { Sparkline } from '@/components/market/Sparkline';
import { StatusDot } from '@/features/settings/components/StatusPill';
import type { StatusTone } from '@/features/settings/lib/status';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

const NUM = { fontVariant: ['tabular-nums' as const], letterSpacing: -0.4 };

const VALUE_TONE: Record<StatusTone, string> = {
  ok: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  bad: 'text-danger-600 dark:text-danger-dark',
  info: 'text-info dark:text-info-dark',
  neutral: 'text-ink dark:text-ink-dark',
};

/**
 * A headline number — label, value, one short line under it, and (optionally) its recent trend
 * as a sparkline. Numbers first, no icons: the label says what it is. A `status` puts a dot
 * before the label and colours the value; colour is never the only signal (the sub line says it).
 */
export function StatTile({
  label,
  value,
  sub,
  status,
  trend,
  onPress,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: StatusTone;
  /** Recent values, oldest first, drawn under the number. */
  trend?: readonly number[];
  onPress?: () => void;
  className?: string;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => setWidth(Math.floor(event.nativeEvent.layout.width)),
    [],
  );
  const showTrend = trend && trend.filter(Number.isFinite).length >= 2;

  const body = (
    <>
      <View className="flex-row items-center gap-1.5">
        {status ? <StatusDot tone={status} size={7} /> : null}
        <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        className={cn('mt-1.5 text-[22px] font-bold', VALUE_TONE[status ?? 'neutral'])}
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text
          className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
      {showTrend ? (
        <View onLayout={onLayout} className="mt-2.5 h-7">
          {width > 0 ? (
            <Sparkline data={trend} width={width} height={28} color={colors.accent} />
          ) : null}
        </View>
      ) : null}
    </>
  );

  const frame = cn(
    'rounded-card border border-line bg-surface px-3.5 py-3 dark:border-line-dark dark:bg-surface-dark',
    className,
  );
  const a11y = `${label}: ${value}${sub ? `, ${sub}` : ''}`;

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className={cn(frame, 'active:bg-surface-sunk dark:active:bg-surface-sunk-dark')}
    >
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={a11y} className={frame}>
      {body}
    </View>
  );
}
