import React from 'react';
import { Text, View } from 'react-native';

import { ShareBar } from '@/components/dashboard/ShareBar';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import { trailCells, VERDICT, VERDICT_ORDER } from '../lib/view';
import type { HoldingHistoryEntry, ReviewAction, ReviewCounts } from '../types';

/**
 * A review label: a swatch in its categorical colour and the word in ink. Not a status pill — a
 * verdict is a category (add / hold / reduce / unsure), not a health state, so it takes the chart
 * palette, and "Under review" is an outlined neutral.
 */
export function Swatch({ action, size = 10 }: { action: ReviewAction | null; size?: number }) {
  const { colors } = useTheme();
  const verdict = action ? VERDICT[action] : null;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: size,
        height: size,
        borderRadius: 3,
        backgroundColor: verdict && !verdict.outlined ? colors[verdict.color] : 'transparent',
        borderWidth: !verdict || verdict.outlined ? 1.5 : 0,
        borderColor: verdict ? colors[verdict.color] : colors.borderStrong,
      }}
    />
  );
}

export function VerdictChip({ action, large = false }: { action: ReviewAction; large?: boolean }) {
  const label = VERDICT[action].label;
  return (
    <View
      accessible
      accessibilityLabel={`Verdict: ${label}`}
      className={cn(
        'flex-row items-center gap-1.5 self-start',
        large && 'rounded-full border border-line px-3 py-1.5 dark:border-line-dark',
      )}
    >
      <Swatch action={action} size={large ? 11 : 9} />
      <Text
        className={cn(
          'font-semibold text-ink dark:text-ink-dark',
          large ? 'text-sm' : 'text-[13px]',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** How the verdicts split, as one bar with counts. */
export function VerdictShare({ counts }: { counts: ReviewCounts }) {
  const { colors } = useTheme();
  return (
    <ShareBar
      segments={VERDICT_ORDER.map((action) => ({
        label: VERDICT[action].label,
        value: counts.byAction[action],
        color: action === 'NEEDS_REVIEW' ? colors.borderStrong : colors[VERDICT[action].color],
      }))}
    />
  );
}

/**
 * The last reviews of one holding, oldest → newest, one cell per hour. A failed or unfinished
 * review is an outlined gap — "no verdict that hour" — never a colour.
 */
export function VerdictTrail({ history }: { history: readonly HoldingHistoryEntry[] }) {
  const { colors } = useTheme();
  const cells = trailCells(history);
  if (cells.length === 0) return null;
  return (
    <View>
      <View
        accessible
        accessibilityLabel={`Verdicts, oldest first: ${cells.map((c) => c.label).join(', ')}`}
        className="h-[18px] flex-row"
        style={{ columnGap: 2 }}
      >
        {cells.map((cell) => {
          const verdict = cell.action ? VERDICT[cell.action] : null;
          const filled = verdict && !verdict.outlined;
          return (
            <View
              key={cell.key}
              style={{
                flex: 1,
                maxWidth: 22,
                borderRadius: 2,
                backgroundColor: filled ? colors[verdict.color] : 'transparent',
                borderWidth: filled ? 0 : 1,
                borderColor: verdict ? colors[verdict.color] : colors.borderStrong,
              }}
            />
          );
        })}
      </View>
      <View
        className="mt-2.5 flex-row flex-wrap gap-x-4 gap-y-1.5"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {VERDICT_ORDER.map((action) => (
          <View key={action} className="flex-row items-center gap-1.5">
            <Swatch action={action} size={9} />
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
              {VERDICT[action].label}
            </Text>
          </View>
        ))}
        <View className="flex-row items-center gap-1.5">
          <Swatch action={null} size={9} />
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">No verdict</Text>
        </View>
      </View>
    </View>
  );
}
