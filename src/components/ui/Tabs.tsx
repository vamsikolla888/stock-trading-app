import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

export interface TabItem<K extends string> {
  key: K;
  label: string;
}

interface SelectorProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  className?: string;
}

/** Underlined, equal-width tabs (Holdings / Positions / Orders). */
export function Tabs<K extends string>({ items, value, onChange, className }: SelectorProps<K>) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn('flex-row border-b border-line dark:border-line-dark', className)}
    >
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            className={cn(
              '-mb-px flex-1 items-center border-b-2 pb-2.5 pt-3',
              selected ? 'border-brand dark:border-brand' : 'border-transparent',
            )}
          >
            <Text
              className={cn(
                'text-[13px] font-semibold',
                selected
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pill segmented control (Delivery / Intraday, chart ranges). */
export function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
  className,
}: SelectorProps<K>) {
  return (
    <View
      accessibilityRole="tablist"
      className={cn(
        'flex-row gap-1 rounded-[11px] bg-surface-sunk p-1 dark:bg-surface-sunk-dark',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            className={cn(
              'h-9 flex-1 items-center justify-center rounded-lg',
              selected && 'bg-surface shadow-sm dark:bg-surface-dark',
            )}
          >
            <Text
              className={cn(
                'text-[13px] font-semibold',
                selected
                  ? 'text-ink dark:text-ink-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Compact range buttons under a chart (1D 1W 1M 1Y 5Y). */
export function RangeSelector<K extends string>({
  items,
  value,
  onChange,
  className,
}: SelectorProps<K>) {
  return (
    <View accessibilityRole="tablist" className={cn('flex-row gap-1.5', className)}>
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${item.label} range`}
            hitSlop={4}
            onPress={() => onChange(item.key)}
            className={cn(
              'min-w-[40px] items-center rounded-lg px-2.5 py-1.5',
              selected && 'bg-brand-wash dark:bg-brand-wash-dark',
            )}
          >
            <Text
              className={cn(
                'text-xs font-semibold',
                selected
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Horizontally scrolling filter chips that bleed to the screen edge. */
export function Chips<K extends string>({ items, value, onChange, className }: SelectorProps<K>) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className={cn('-mx-5', className)}
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {items.map((item) => {
        const selected = item.key === value;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            className={cn(
              'rounded-full border px-3.5 py-2',
              selected
                ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
            )}
          >
            <Text
              className={cn(
                'text-[13px] font-semibold',
                selected
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
