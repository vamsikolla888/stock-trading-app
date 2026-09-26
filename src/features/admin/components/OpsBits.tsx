import React from 'react';
import { Text, View } from 'react-native';

import { BarChart, type Bar } from '@/components/charts/BarChart';
import { Card } from '@/components/ui/Card';
import { Meter, type MeterTone } from '@/components/ui/Meter';
import { bucketTone } from '@/features/admin/lib/format';
import { monoFont } from '@/features/settings/components/JsonBlock';
import type { StatusTone } from '@/features/settings/lib/status';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

const STRIP_CLASS: Record<StatusTone, string> = {
  ok: 'bg-brand dark:bg-brand-strong-dark',
  warn: 'bg-warning-500 dark:bg-warning-dark',
  bad: 'bg-danger-500 dark:bg-danger-dark',
  info: 'bg-info dark:bg-info-dark',
  neutral: 'bg-line dark:bg-line-dark',
};

/**
 * One full-height bar per bucket, coloured by the share of checks that passed. Colour, not
 * height, carries the value — a half-height bar would read as "less traffic".
 */
export function UptimeStrip({
  series,
  accessibilityLabel,
}: {
  series: readonly { periodStart: string; uptimePct: number | null; checks: number }[];
  accessibilityLabel: string;
}) {
  if (series.length === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      className="h-5 flex-row gap-px overflow-hidden rounded"
    >
      {series.map((point) => (
        <View
          key={point.periodStart}
          className={cn(
            'flex-1 rounded-[1px]',
            STRIP_CLASS[bucketTone(point.uptimePct, point.checks)],
          )}
        />
      ))}
    </View>
  );
}

/** A titled bar chart card with first/middle/last labels and a one-line footnote. */
export function ChartCard({
  title,
  bars,
  footer,
  accessibilityLabel,
  height = 120,
  right,
}: {
  title: string;
  bars: readonly Bar[];
  footer?: string;
  accessibilityLabel: string;
  height?: number;
  right?: React.ReactNode;
}) {
  const hasData = bars.some((bar) => bar.value > 0);
  return (
    <Card className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
        {right}
      </View>
      {bars.length === 0 || !hasData ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Nothing recorded in this window.
        </Text>
      ) : (
        <BarChart bars={bars} height={height} accessibilityLabel={accessibilityLabel} />
      )}
      {footer ? (
        <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">{footer}</Text>
      ) : null}
    </Card>
  );
}

/** A breakdown row: a monospaced key, figures beneath, and a share bar. */
export function BreakdownRow({
  name,
  value,
  details,
  share,
  tone = 'info',
  valueClassName,
}: {
  name: string;
  value: string;
  details: string;
  /** 0–100 */
  share: number;
  tone?: MeterTone;
  valueClassName?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${name}: ${value}. ${details}`}
      className="gap-1.5 px-3.5 py-3"
    >
      <View className="flex-row items-baseline gap-3">
        <Text
          className="flex-1 text-xs text-ink dark:text-ink-dark"
          style={{ fontFamily: monoFont }}
          numberOfLines={2}
        >
          {name}
        </Text>
        <Text
          className={cn('text-[13px] font-semibold text-ink dark:text-ink-dark', valueClassName)}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {value}
        </Text>
      </View>
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{details}</Text>
      <Meter value={share} tone={tone} height={4} />
    </View>
  );
}

/** Coloured notice strip for a number that would otherwise be misread (under-counted, stale). */
export function NoticeCard({
  tone,
  title,
  children,
}: {
  tone: 'warn' | 'bad' | 'info';
  title: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const accent = tone === 'bad' ? colors.danger : tone === 'warn' ? colors.warning : colors.info;
  return (
    <View
      accessibilityRole="alert"
      className="gap-1 rounded-card border border-line bg-surface p-3.5 dark:border-line-dark dark:bg-surface-dark"
      style={{ borderLeftWidth: 3, borderLeftColor: accent }}
    >
      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{title}</Text>
      {typeof children === 'string' ? (
        <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {children}
        </Text>
      ) : (
        children
      )}
    </View>
  );
}
