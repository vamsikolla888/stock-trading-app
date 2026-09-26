import React from 'react';
import { Text, type TextProps } from 'react-native';

import { cn } from '@/lib/utils/cn';

export type Trend = 'up' | 'down' | 'flat';

export function trendOf(value: number | null | undefined): Trend {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return 'flat';
  return value > 0 ? 'up' : 'down';
}

export const trendTextClass: Record<Trend, string> = {
  up: 'text-brand-text dark:text-brand-text-dark',
  down: 'text-danger-600 dark:text-danger-dark',
  flat: 'text-ink-muted dark:text-ink-dark-muted',
};

interface ChangeTextProps extends TextProps {
  /** Decides the colour; the text itself is `children`, already formatted. */
  value: number | null | undefined;
}

/** Gain/loss coloured text using the AA-safe text tones (never the vivid fill green). */
export function ChangeText({ value, className, children, ...rest }: ChangeTextProps) {
  return (
    <Text className={cn('font-semibold', trendTextClass[trendOf(value)], className)} {...rest}>
      {children}
    </Text>
  );
}
