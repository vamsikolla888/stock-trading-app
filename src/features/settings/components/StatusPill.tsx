import React from 'react';
import { Text, View } from 'react-native';

import type { StatusTone } from '@/features/settings/lib/status';
import { cn } from '@/lib/utils/cn';

export type { StatusTone };

const PILL: Record<StatusTone, { box: string; text: string; dot: string }> = {
  ok: {
    box: 'bg-success-wash dark:bg-success-wash-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
    dot: 'bg-brand-strong dark:bg-brand-text-dark',
  },
  warn: {
    box: 'bg-warning-wash dark:bg-warning-wash-dark',
    text: 'text-warning-600 dark:text-warning-dark',
    dot: 'bg-warning-500 dark:bg-warning-dark',
  },
  bad: {
    box: 'bg-danger-wash dark:bg-danger-wash-dark',
    text: 'text-danger-600 dark:text-danger-dark',
    dot: 'bg-danger-500 dark:bg-danger-dark',
  },
  info: {
    box: 'bg-info-wash dark:bg-info-wash-dark',
    text: 'text-info dark:text-info-dark',
    dot: 'bg-info dark:bg-info-dark',
  },
  neutral: {
    box: 'bg-surface-sunk dark:bg-surface-sunk-dark',
    text: 'text-ink-muted dark:text-ink-dark-muted',
    dot: 'bg-ink-faint dark:bg-ink-dark-faint',
  },
};

/** Dot + label status chip — the single status indicator on a row (never a dot and a badge). */
export function StatusPill({
  tone,
  label,
  className,
}: {
  tone: StatusTone;
  label: string;
  className?: string;
}) {
  const style = PILL[tone];
  return (
    <View
      accessible
      accessibilityLabel={label}
      className={cn(
        'flex-row items-center gap-1.5 self-start rounded-full py-1 pl-2 pr-2.5',
        style.box,
        className,
      )}
    >
      <View className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      <Text className={cn('text-xs font-semibold', style.text)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

/** A bare status dot, for dense lists where the text beside it carries the label. */
export function StatusDot({ tone, size = 8 }: { tone: StatusTone; size?: number }) {
  return (
    <View
      className={cn('rounded-full', PILL[tone].dot)}
      style={{ width: size, height: size }}
      accessibilityElementsHidden
      importantForAccessibility="no"
    />
  );
}
