import React from 'react';
import { Text, View } from 'react-native';

import { StatusPill } from '@/features/settings/components/StatusPill';
import { cn } from '@/lib/utils/cn';

import { TONE_STATUS, TONE_TEXT, type Tone } from '../lib/view';
import type { Direction } from '../types';

export const NUM = { fontVariant: ['tabular-nums' as const] };

/** Long / Short / Two-sided — the one place green and red mean a direction. */
export function DirectionChip({
  direction,
  twoSided = false,
}: {
  direction: Direction;
  twoSided?: boolean;
}) {
  const label = twoSided ? 'Two-sided' : direction === 'LONG' ? 'Long' : 'Short';
  const box = twoSided
    ? 'bg-surface-sunk dark:bg-surface-sunk-dark'
    : direction === 'LONG'
      ? 'bg-success-wash dark:bg-success-wash-dark'
      : 'bg-danger-wash dark:bg-danger-wash-dark';
  const text = twoSided
    ? 'text-ink-muted dark:text-ink-dark-muted'
    : direction === 'LONG'
      ? 'text-brand-text dark:text-brand-text-dark'
      : 'text-danger-600 dark:text-danger-dark';
  return (
    <View className={cn('rounded-md px-1.5 py-0.5', box)}>
      <Text className={cn('text-[11px] font-semibold', text)}>{label}</Text>
    </View>
  );
}

/** A small neutral tag ("F&O", "Intraday"). */
export function Tag({ label }: { label: string }) {
  return (
    <View className="rounded-md border border-line px-1.5 py-[1px] dark:border-line-dark">
      <Text className="text-[10px] font-semibold text-ink-muted dark:text-ink-dark-muted">
        {label}
      </Text>
    </View>
  );
}

/** A tone's status pill. */
export function TonePill({ tone, label }: { tone: Tone; label: string }) {
  return <StatusPill tone={TONE_STATUS[tone]} label={label} />;
}

/** Text coloured by a tone (gain, loss, warning) — ink when the tone is none. */
export function ToneText({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Text className={cn(TONE_TEXT[tone], className)} style={NUM}>
      {children}
    </Text>
  );
}

/** Muted short lines, each with a leading dot — rules, caveats, warnings. */
export function Bullets({ items, className }: { items: readonly string[]; className?: string }) {
  return (
    <View className={cn('gap-2', className)}>
      {items.map((item) => (
        <View key={item} className="flex-row gap-2">
          <Text className="text-[13px] leading-[19px] text-ink-faint dark:text-ink-dark-faint">
            •
          </Text>
          <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The closing caveat line under a screen. */
export function FinePrint({ children }: { children: string }) {
  return (
    <Text className="mt-5 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}

/** A small uppercase label above a block. */
export function Kicker({ children }: { children: string }) {
  return (
    <Text className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}
