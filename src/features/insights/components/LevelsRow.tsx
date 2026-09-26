import React from 'react';
import { Text, View } from 'react-native';

import { formatINR } from '@/lib/utils/formatters';

/** Entry band · target · stop, as three compact columns. */
export function LevelsRow({
  entryLow,
  entryHigh,
  target,
  stop,
}: {
  entryLow: number | null;
  entryHigh: number | null;
  target: number | null;
  stop: number | null;
}) {
  const entry =
    entryLow != null && entryHigh != null
      ? `${formatINR(entryLow)} – ${formatINR(entryHigh)}`
      : formatINR(entryLow ?? entryHigh);
  const cells = [
    { label: 'Entry', value: entry, className: 'text-ink dark:text-ink-dark' },
    {
      label: 'Target',
      value: formatINR(target),
      className: 'text-brand-text dark:text-brand-text-dark',
    },
    { label: 'Stop', value: formatINR(stop), className: 'text-danger-600 dark:text-danger-dark' },
  ];
  return (
    <View className="mt-3 flex-row gap-2 rounded-lg bg-surface-sunk p-2.5 dark:bg-surface-sunk-dark">
      {cells.map((cell) => (
        <View
          key={cell.label}
          className="flex-1"
          accessible
          accessibilityLabel={`${cell.label} ${cell.value}`}
        >
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{cell.label}</Text>
          <Text className={`mt-0.5 text-xs font-semibold ${cell.className}`} numberOfLines={2}>
            {cell.value}
          </Text>
        </View>
      ))}
    </View>
  );
}
