import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

export interface Stat {
  label: string;
  value: string;
  valueClassName?: string;
}

/** Two-column bordered stat table (Open / Previous close / Day high / Day low). */
export function StatGrid({ stats }: { stats: readonly Stat[] }) {
  const rows: Stat[][] = [];
  for (let i = 0; i < stats.length; i += 2) rows.push(stats.slice(i, i + 2));

  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      {rows.map((row, rowIndex) => (
        <View
          key={row[0]?.label ?? rowIndex}
          className={cn('flex-row', rowIndex > 0 && 'border-t border-line dark:border-line-dark')}
        >
          {row.map((stat, colIndex) => (
            <View
              key={stat.label}
              accessible
              accessibilityLabel={`${stat.label}: ${stat.value}`}
              className={cn(
                'flex-1 px-3.5 py-3',
                colIndex > 0 && 'border-l border-line dark:border-line-dark',
              )}
            >
              <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">{stat.label}</Text>
              <Text
                className={cn(
                  'mt-1 text-sm font-semibold text-ink dark:text-ink-dark',
                  stat.valueClassName,
                )}
              >
                {stat.value}
              </Text>
            </View>
          ))}
          {row.length === 1 ? (
            <View className="flex-1 border-l border-line dark:border-line-dark" />
          ) : null}
        </View>
      ))}
    </View>
  );
}
