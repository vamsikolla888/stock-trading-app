import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { shadows } from '@/theme/tokens';

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

/**
 * Pill segmented control (Delivery / Intraday, chart ranges, the Appearance picker).
 *
 * The selected pill's shadow is a style, never a `shadow-*` class: NativeWind compiles
 * shadow classes to CSS variables, and a component that gains variables after its first
 * render gets "upgraded" (remounted) — in development that path serialises every prop,
 * reaches React Navigation's context and throws "Couldn't find a navigation context",
 * which is exactly what tapping Light/Dark did in Settings.
 */
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
            style={selected ? shadows.sm : undefined}
            className={cn(
              'h-9 flex-1 items-center justify-center rounded-lg',
              selected && 'bg-surface dark:bg-surface-dark',
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
