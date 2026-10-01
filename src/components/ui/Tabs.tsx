import React, { useCallback, useEffect, useRef, useState } from 'react';
import { type LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';
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

const SLIDE = { duration: 220, easing: Easing.out(Easing.cubic) };

/**
 * The selected marker's slide — an underline or a pill moving between options instead of
 * jumping. Placed without motion the first time it is measured (nothing to slide from), then
 * every change of `x`/`width` eases there on the UI thread.
 */
function useSlide(x: number | null, width: number) {
  const left = useSharedValue(0);
  const size = useSharedValue(0);
  const placed = useRef(false);

  useEffect(() => {
    if (x === null || width <= 0) return;
    if (placed.current) {
      left.set(withTiming(x, SLIDE));
      size.set(withTiming(width, SLIDE));
    } else {
      left.set(x);
      size.set(width);
      placed.current = true;
    }
  }, [x, width, left, size]);

  return useAnimatedStyle(() => ({
    width: size.get(),
    transform: [{ translateX: left.get() }],
  }));
}

/** Width of a row of options, from its layout (0 until laid out). */
function useRowWidth(): [number, (event: LayoutChangeEvent) => void] {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  return [width, onLayout];
}

/** Underlined, equal-width tabs (Holdings / Positions / Orders); the underline slides. */
export function Tabs<K extends string>({ items, value, onChange, className }: SelectorProps<K>) {
  const { colors } = useTheme();
  const [rowWidth, onLayout] = useRowWidth();
  const index = items.findIndex((item) => item.key === value);
  const slot = items.length > 0 ? rowWidth / items.length : 0;
  const underline = useSlide(index >= 0 ? index * slot : null, slot);
  const measured = rowWidth > 0;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
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
              selected && !measured ? 'border-brand dark:border-brand' : 'border-transparent',
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
      {measured && index >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              left: 0,
              bottom: -1,
              height: 2,
              backgroundColor: colors.accent,
            },
            underline,
          ]}
        />
      ) : null}
    </View>
  );
}

/**
 * Underlined tabs that scroll sideways — for a broker-style book with more tabs than fit
 * (Holdings · Positions · Orders · Funds · Analytics). Bleeds to the screen edge like Chips.
 */
export function ScrollTabs<K extends string>({
  items,
  value,
  onChange,
  className,
  badges,
}: SelectorProps<K> & { badges?: Partial<Record<K, number>> }) {
  const { colors } = useTheme();
  const [layouts, setLayouts] = useState<
    Readonly<Record<string, { x: number; width: number } | undefined>>
  >({});
  const active = layouts[value];
  const underline = useSlide(active ? active.x : null, active?.width ?? 0);

  const onItemLayout = (key: K, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    setLayouts((current) => {
      const known = current[key];
      return known && known.x === x && known.width === width
        ? current
        : { ...current, [key]: { x, width } };
    });
  };

  return (
    <View className={cn('-mx-5 border-b border-line dark:border-line-dark', className)}>
      <ScrollView
        horizontal
        accessibilityRole="tablist"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 12 }}
      >
        {items.map((item) => {
          const selected = item.key === value;
          const badge = badges?.[item.key] ?? 0;
          return (
            <Pressable
              key={item.key}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={badge > 0 ? `${item.label}, ${badge}` : item.label}
              onPress={() => onChange(item.key)}
              onLayout={(event) => onItemLayout(item.key, event)}
              className={cn(
                '-mb-px flex-row items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-3',
                selected && !active ? 'border-brand dark:border-brand' : 'border-transparent',
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
              {badge > 0 ? (
                <View className="min-w-[18px] items-center rounded-full bg-warning-wash px-1.5 dark:bg-warning-wash-dark">
                  <Text className="text-[10px] font-bold text-warning-600 dark:text-warning-dark">
                    {badge}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        {active ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                left: 0,
                bottom: 0,
                height: 2,
                backgroundColor: colors.accent,
              },
              underline,
            ]}
          />
        ) : null}
      </ScrollView>
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
 *
 * The raised pill is one view sliding between the options, under transparent buttons.
 */
export function SegmentedControl<K extends string>({
  items,
  value,
  onChange,
  className,
}: SelectorProps<K>) {
  const { colors } = useTheme();
  const [rowWidth, onLayout] = useRowWidth();
  const index = items.findIndex((item) => item.key === value);
  const count = Math.max(items.length, 1);
  const slot = rowWidth > 0 ? (rowWidth - SEGMENT_PAD * 2 - SEGMENT_GAP * (count - 1)) / count : 0;
  const thumb = useSlide(index >= 0 ? index * (slot + SEGMENT_GAP) : null, slot);
  const measured = slot > 0;

  return (
    <View
      accessibilityRole="tablist"
      onLayout={onLayout}
      className={cn(
        'flex-row gap-1 rounded-[11px] bg-surface-sunk p-1 dark:bg-surface-sunk-dark',
        className,
      )}
    >
      {measured && index >= 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              top: SEGMENT_PAD,
              bottom: SEGMENT_PAD,
              left: SEGMENT_PAD,
              borderRadius: 8,
              backgroundColor: colors.surface,
            },
            shadows.sm,
            thumb,
          ]}
        />
      ) : null}
      {items.map((item) => {
        const selected = item.key === value;
        // Until the row is measured, the selected button draws its own pill.
        const ownPill = selected && !measured;
        return (
          <Pressable
            key={item.key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(item.key)}
            style={ownPill ? shadows.sm : undefined}
            className={cn(
              'h-9 flex-1 items-center justify-center rounded-lg',
              ownPill && 'bg-surface dark:bg-surface-dark',
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

/** SegmentedControl's inset (p-1) and spacing (gap-1). */
const SEGMENT_PAD = 4;
const SEGMENT_GAP = 4;

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
