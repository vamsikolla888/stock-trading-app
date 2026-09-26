import React from 'react';
import { Text, View } from 'react-native';

import { trendTextClass, trendOf } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';

interface KeyValueRowProps {
  label: string;
  /** Pre-formatted text, or a node for custom content (a badge, a switch). */
  value: React.ReactNode;
  /** Colours the value as a gain/loss by this number's sign. */
  trend?: number | null;
  /** Muted helper under the label. */
  hint?: string;
  /** Hairline above the row, for stacked rows inside a card. */
  divider?: boolean;
  className?: string;
}

/**
 * "Label ........ value" row — returns breakdowns, order details, risk limits. Values use
 * tabular figures so stacked numbers line up.
 */
export function KeyValueRow({ label, value, trend, hint, divider, className }: KeyValueRowProps) {
  const valueClass =
    trend !== undefined ? trendTextClass[trendOf(trend)] : 'text-ink dark:text-ink-dark';

  return (
    <View
      accessible
      className={cn(
        'flex-row items-center justify-between gap-3 py-2.5',
        divider && 'border-t border-line dark:border-line-dark',
        className,
      )}
    >
      <View className="flex-1">
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
        {hint ? (
          <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">{hint}</Text>
        ) : null}
      </View>
      {typeof value === 'string' || typeof value === 'number' ? (
        <Text
          className={cn('text-right text-[13px] font-semibold', valueClass)}
          style={{ fontVariant: ['tabular-nums'] }}
        >
          {value}
        </Text>
      ) : (
        value
      )}
    </View>
  );
}
