import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

export interface ShareSegment {
  label: string;
  value: number;
  color: string;
}

/**
 * How a whole splits into parts, as one bar with a legend of counts (statuses, providers, token
 * directions). Counts, not percentages, sit in the legend — the bar already shows the share.
 */
export function ShareBar({
  segments,
  height = 8,
  format = (value: number) => value.toLocaleString('en-IN'),
  className,
}: {
  segments: readonly ShareSegment[];
  height?: number;
  format?: (value: number) => string;
  className?: string;
}) {
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);
  return (
    <View className={className}>
      <View
        accessible
        accessibilityLabel={segments.map((s) => `${s.label} ${format(s.value)}`).join(', ')}
        className="flex-row overflow-hidden rounded-full bg-line dark:bg-line-dark"
        style={{ height, columnGap: total > 0 ? 2 : 0 }}
      >
        {total > 0
          ? segments
              .filter((segment) => segment.value > 0)
              .map((segment) => (
                <View
                  key={segment.label}
                  style={{ flex: segment.value / total, backgroundColor: segment.color }}
                />
              ))
          : null}
      </View>
      <View className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1.5">
        {segments.map((segment) => (
          <View key={segment.label} className="flex-row items-center gap-1.5">
            <View className="h-2 w-2 rounded-[3px]" style={{ backgroundColor: segment.color }} />
            <Text className={cn('text-xs text-ink-muted dark:text-ink-dark-muted')}>
              {segment.label}{' '}
              <Text
                className="font-semibold text-ink dark:text-ink-dark"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {format(segment.value)}
              </Text>
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}
