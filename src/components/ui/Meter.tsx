import React from 'react';
import { View } from 'react-native';

import { cn } from '@/lib/utils/cn';

export type MeterTone = 'brand' | 'gain' | 'loss' | 'warning' | 'info' | 'neutral';

const FILL: Record<MeterTone, string> = {
  brand: 'bg-brand',
  gain: 'bg-brand-strong dark:bg-brand-strong-dark',
  loss: 'bg-danger-500 dark:bg-danger-dark',
  warning: 'bg-warning-500 dark:bg-warning-dark',
  info: 'bg-info dark:bg-info-dark',
  neutral: 'bg-ink-faint dark:bg-ink-dark-faint',
};

interface MeterProps {
  /** 0–100; clamped. */
  value: number | null | undefined;
  tone?: MeterTone;
  /** Bar height in px. */
  height?: number;
  accessibilityLabel?: string;
  className?: string;
}

/** Thin horizontal gauge — confidence, allocation, usage against a limit. */
export function Meter({
  value,
  tone = 'brand',
  height = 6,
  accessibilityLabel,
  className,
}: MeterProps) {
  const pct =
    typeof value === 'number' && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
      className={cn('w-full overflow-hidden rounded-full bg-line dark:bg-line-dark', className)}
      style={{ height }}
    >
      <View className={cn('h-full rounded-full', FILL[tone])} style={{ width: `${pct}%` }} />
    </View>
  );
}
