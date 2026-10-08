import React, { useEffect, useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

import type { DayChip } from '../lib/picksView';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * The trading days across the top of Strong picks — today first, then every earlier day that
 * published, newest first. Each shows how many picks it had and, once any closed, the share that
 * closed in profit, with a hairline filled to that share. Scrolls sideways; the selected day is
 * kept in view.
 */
export function DayStrip({
  days,
  selected,
  onPick,
}: {
  days: readonly DayChip[];
  selected: string;
  onPick: (date: string) => void;
}) {
  const scroller = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  useEffect(() => {
    const x = offsets.current.get(selected);
    if (x !== undefined) scroller.current?.scrollTo({ x: Math.max(0, x - 20), animated: true });
  }, [selected]);

  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5"
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
      accessibilityLabel="Trading days"
    >
      {days.map((day) => {
        const on = day.date === selected;
        const rate = day.successRate == null ? null : Math.round(day.successRate);
        const picks = day.picks == null ? '—' : `${day.picks} pick${day.picks === 1 ? '' : 's'}`;
        const tail = rate != null ? `${rate}%` : day.isToday ? 'live' : day.picks ? 'open' : '';
        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${day.label}, ${picks}${rate != null ? `, ${rate}% of ${day.closed} closed in profit` : ''}`}
            onLayout={(event) => offsets.current.set(day.date, event.nativeEvent.layout.x)}
            onPress={() => onPick(day.date)}
            className={cn(
              'min-w-[112px] rounded-field border px-3 pb-2 pt-2.5',
              on
                ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                : 'border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
            )}
          >
            <Text
              className={cn(
                'text-xs font-semibold',
                on ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
              )}
              numberOfLines={1}
            >
              {day.label}
            </Text>
            <View className="mt-1 flex-row items-baseline justify-between gap-2">
              <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" style={NUM}>
                {picks}
              </Text>
              <Text
                className={cn(
                  'text-[11px]',
                  rate != null
                    ? 'font-semibold text-ink dark:text-ink-dark'
                    : 'text-ink-faint dark:text-ink-dark-faint',
                )}
                style={NUM}
              >
                {tail}
              </Text>
            </View>
            <View className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-line dark:bg-line-dark">
              {rate != null ? (
                <View
                  className="h-full rounded-full bg-brand-strong dark:bg-brand-strong-dark"
                  style={{ width: `${Math.max(0, Math.min(100, rate))}%` }}
                />
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
