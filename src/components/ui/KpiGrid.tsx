import React from 'react';
import { Text, View } from 'react-native';

import { trendTextClass, trendOf } from '@/components/market/ChangeText';
import { cn } from '@/lib/utils/cn';

export interface Kpi {
  label: string;
  /** Pre-formatted. */
  value: string;
  /** Small line under the value (e.g. "+1.2% today"). */
  sub?: string;
  /** Colours value and sub by sign. */
  trend?: number | null;
}

interface KpiGridProps {
  items: readonly Kpi[];
  columns?: 2 | 3;
  className?: string;
}

/**
 * Headline numbers as separate soft tiles (the web's Kpi row). Use StatGrid instead for a
 * dense bordered table of many small facts.
 */
export function KpiGrid({ items, columns = 2, className }: KpiGridProps) {
  const rows: Kpi[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View className={cn('gap-2.5', className)}>
      {rows.map((row) => (
        <View key={row.map((kpi) => kpi.label).join('|')} className="flex-row gap-2.5">
          {row.map((kpi) => {
            const tone =
              kpi.trend !== undefined
                ? trendTextClass[trendOf(kpi.trend)]
                : 'text-ink dark:text-ink-dark';
            return (
              <View
                key={kpi.label}
                accessible
                accessibilityLabel={`${kpi.label}: ${kpi.value}${kpi.sub ? `, ${kpi.sub}` : ''}`}
                className="flex-1 rounded-card border border-line bg-surface px-3.5 py-3 dark:border-line-dark dark:bg-surface-dark"
              >
                <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
                  {kpi.label}
                </Text>
                <Text
                  className={cn('mt-1 text-[16px] font-bold', tone)}
                  style={{ fontVariant: ['tabular-nums'], letterSpacing: -0.3 }}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {kpi.value}
                </Text>
                {kpi.sub ? (
                  <Text
                    className={cn(
                      'mt-0.5 text-[11px]',
                      kpi.trend !== undefined ? tone : 'text-ink-faint dark:text-ink-dark-faint',
                    )}
                    numberOfLines={1}
                  >
                    {kpi.sub}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`pad-${index}`} className="flex-1" />
          ))}
        </View>
      ))}
    </View>
  );
}
