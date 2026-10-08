import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

import type { Tone } from '../lib/signals';

/** Small shared pieces of the Signals screen. A colour never carries meaning alone: a word does. */

export const NUM = { fontVariant: ['tabular-nums' as const] };

const TONE_DOT: Record<Tone, string> = {
  success: 'bg-brand dark:bg-brand-text-dark',
  warning: 'bg-warning-500 dark:bg-warning-dark',
  danger: 'bg-danger-500 dark:bg-danger-dark',
  primary: 'bg-brand dark:bg-brand-text-dark',
  neutral: 'bg-ink-faint dark:bg-ink-dark-faint',
};

const TONE_TEXT: Record<Tone, string> = {
  success: 'text-brand-text dark:text-brand-text-dark',
  warning: 'text-warning-600 dark:text-warning-dark',
  danger: 'text-danger-600 dark:text-danger-dark',
  primary: 'text-brand-text dark:text-brand-text-dark',
  neutral: 'text-ink-muted dark:text-ink-dark-muted',
};

/** "● Alert-ready" — a dot and a word. */
export function DotLabel({
  tone,
  label,
  wrap = false,
  className,
}: {
  tone: Tone;
  label: string;
  /** Let a sentence wrap instead of truncating to one line. */
  wrap?: boolean;
  className?: string;
}) {
  return (
    <View className={cn('flex-row gap-1.5', wrap ? 'items-start' : 'items-center', className)}>
      <View className={cn('h-1.5 w-1.5 rounded-full', wrap && 'mt-[6px]', TONE_DOT[tone])} />
      <Text
        className={cn('text-xs font-medium', wrap && 'flex-1 leading-[17px]', TONE_TEXT[tone])}
        numberOfLines={wrap ? undefined : 1}
      >
        {label}
      </Text>
    </View>
  );
}

/** Label over a number, with an optional quiet line under it. */
export function Metric({
  label,
  value,
  valueClassName,
  sub,
  align = 'left',
}: {
  label: string;
  value: string;
  valueClassName?: string;
  sub?: string;
  align?: 'left' | 'right';
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}${sub ? `, ${sub}` : ''}`}
      className={cn('flex-1', align === 'right' && 'items-end')}
    >
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn(
          'mt-0.5 text-[13px] font-semibold',
          valueClassName ?? 'text-ink dark:text-ink-dark',
        )}
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          className="text-[11px] text-ink-faint dark:text-ink-dark-faint"
          style={NUM}
          numberOfLines={1}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

/** The class a signed figure takes: gain, loss or flat. */
export function signedClass(value: number | null | undefined): string {
  if (value == null || value === 0) return 'text-ink dark:text-ink-dark';
  return value > 0
    ? 'text-brand-text dark:text-brand-text-dark'
    : 'text-danger-600 dark:text-danger-dark';
}
