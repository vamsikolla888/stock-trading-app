import React from 'react';
import { Text, View } from 'react-native';

import { trendOf, trendTextClass } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';

const NUM = { fontVariant: ['tabular-nums' as const] };

export interface Fact {
  label: string;
  value: string;
  /** Colours the value by sign — only for a move or a return. */
  trend?: number | null;
  /** Red value: a loss-side level (a stop, a drawdown). */
  negative?: boolean;
}

/**
 * Small label-over-number facts in even columns (a plan's levels, the market's averages). Wraps
 * to a new row instead of squeezing — three to a row on a phone, more on a wide window.
 */
export function FactGrid({
  facts,
  columns = 3,
  className,
}: {
  facts: readonly Fact[];
  columns?: number;
  className?: string;
}) {
  const basis = `${100 / Math.max(1, columns)}%` as const;
  return (
    <View className={cn('-mx-1.5 flex-row flex-wrap', className)}>
      {facts.map((fact) => (
        <View
          key={fact.label}
          accessible
          accessibilityLabel={`${fact.label} ${fact.value}`}
          className="px-1.5 py-1.5"
          style={{ width: basis }}
        >
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {fact.label}
          </Text>
          <Text
            className={cn(
              'mt-0.5 text-[13px] font-semibold',
              fact.negative
                ? 'text-danger-600 dark:text-danger-dark'
                : fact.trend !== undefined
                  ? trendTextClass[trendOf(fact.trend)]
                  : 'text-ink dark:text-ink-dark',
            )}
            style={NUM}
            numberOfLines={1}
          >
            {fact.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** A horizontal share bar, 0–100 of its track, in a quiet neutral (or brand for trades). */
export function TrackBar({
  pct,
  emphasis = false,
  className,
}: {
  pct: number;
  emphasis?: boolean;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, pct));
  return (
    <View
      className={cn('h-1.5 overflow-hidden rounded-full bg-line dark:bg-line-dark', className)}
      accessibilityElementsHidden
      importantForAccessibility="no"
    >
      <View
        className={cn(
          'h-full rounded-full',
          emphasis
            ? 'bg-brand-strong dark:bg-brand-strong-dark'
            : 'bg-ink-faint dark:bg-ink-dark-faint',
        )}
        style={{ width: `${width}%` }}
      />
    </View>
  );
}

/** A muted sentence block — notes under a panel, a "how this was tested" line. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={cn('text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint', className)}
    >
      {children}
    </Text>
  );
}

/** Bulleted sentences rendered verbatim (server caveats, rules). */
export function BulletList({ items }: { items: readonly string[] }) {
  return (
    <View className="gap-2">
      {items.map((item) => (
        <View key={item} className="flex-row gap-2">
          <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">•</Text>
          <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}
