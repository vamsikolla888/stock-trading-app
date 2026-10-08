import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { navGroup } from '@/config/navigation';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/** The bar of a group pushed over the tabs (Settings): back · the group's name. */
function PushedHeader({ title }: { title: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <View className="min-h-[52px] flex-row items-center gap-2 px-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <ArrowLeft size={22} color={colors.text} />
      </Pressable>
      <Text
        accessibilityRole="header"
        className="flex-1 text-[17px] font-bold tracking-tight text-ink dark:text-ink-dark"
        numberOfLines={1}
      >
        {title}
      </Text>
    </View>
  );
}

/**
 * The top of every main-menu tab: the app bar, then the group's sub-tabs as a scrollable
 * row of text tabs with an underline under the active one — Groww's "Explore | Holdings |
 * Positions | Orders" pattern, and the mobile form of the web's second-tier nav row.
 *
 * ONE underline, sliding: under the swipeable navigator it rides the pager's `position`, so it
 * follows the finger and stretches to each label's width mid-swipe; without one (tap-only tabs)
 * it springs to the tapped tab. Both run on the native driver — no JS work per frame.
 */
export interface GroupTabBarProps {
  group?: string;
  state: BottomTabBarProps['state'];
  descriptors: Record<string, { options: { title?: string } } | undefined>;
  navigation: Pick<BottomTabBarProps['navigation'], 'emit' | 'navigate'>;
  /** The pager's index plus swipe progress — given by the swipeable navigator. */
  position?: Animated.AnimatedInterpolation<number>;
}

/** The tab's side padding (px-3.5): the underline spans the label, not the touch target. */
const TAB_PAD_X = 14;
/** The underline is drawn at this width and scaled to each label's. */
const INDICATOR_BASE = 100;

interface TabLayout {
  x: number;
  width: number;
}

export function GroupTabBar({ group, state, descriptors, navigation, position }: GroupTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const viewportWidth = useRef(0);
  const [layouts, setLayouts] = useState<Readonly<Record<string, TabLayout>>>({});
  // Tap-only tabs have no pager position: the underline springs on its own value instead.
  const [ownPosition] = useState(() => new Animated.Value(state.index));

  const { routes, index } = state;
  const activeKey = routes[index]?.key;

  useEffect(() => {
    if (position) return;
    Animated.spring(ownPosition, {
      toValue: index,
      useNativeDriver: true,
      speed: 18,
      bounciness: 0,
    }).start();
  }, [position, ownPosition, index]);

  // Keep the active tab in view — it may start off-screen after a deep link, or be swiped to.
  const activeLayout = activeKey ? layouts[activeKey] : undefined;
  useEffect(() => {
    if (!activeLayout || viewportWidth.current === 0) return;
    const target = Math.max(0, activeLayout.x - (viewportWidth.current - activeLayout.width) / 2);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [activeLayout]);

  const onTabLayout = useCallback((key: string, x: number, width: number) => {
    setLayouts((current) => {
      const known = current[key];
      return known && known.x === x && known.width === width
        ? current
        : { ...current, [key]: { x, width } };
    });
  }, []);

  const measured = routes.map((route) => layouts[route.key]);
  const ready = measured.length > 0 && measured.every(Boolean);

  let indicator: React.ReactNode = null;
  if (ready) {
    const spans = (measured as TabLayout[]).map((layout) => ({
      x: layout.x + TAB_PAD_X,
      scale: Math.max(0, layout.width - TAB_PAD_X * 2) / INDICATOR_BASE,
    }));
    const progress = position ?? ownPosition;
    // interpolate needs two stops; a group of one has a still underline.
    const inputRange = spans.length > 1 ? spans.map((_, i) => i) : [0, 1];
    const at = (pick: (span: (typeof spans)[number]) => number) =>
      progress.interpolate({
        inputRange,
        outputRange: spans.length > 1 ? spans.map(pick) : [pick(spans[0]!), pick(spans[0]!)],
        extrapolate: 'clamp',
      });
    indicator = (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: 0,
          bottom: 0,
          height: 3,
          width: INDICATOR_BASE,
          borderTopLeftRadius: 2,
          borderTopRightRadius: 2,
          backgroundColor: colors.accent,
          transformOrigin: 'left',
          transform: [{ translateX: at((span) => span.x) }, { scaleX: at((span) => span.scale) }],
        }}
      />
    );
  }

  return (
    <View
      style={{
        paddingTop: insets.top,
        paddingLeft: insets.left,
        paddingRight: insets.right,
        backgroundColor: colors.background,
      }}
      className="border-b border-line dark:border-line-dark"
    >
      {group && navGroup(group).placement === 'header' ? (
        <PushedHeader title={navGroup(group).label} />
      ) : (
        <AppHeader group={group} />
      )}
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        accessibilityRole="tablist"
        onLayout={(event) => {
          viewportWidth.current = event.nativeEvent.layout.width;
        }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 7, paddingBottom: 0 }}
      >
        {routes.map((route) => {
          const options = descriptors[route.key]?.options;
          const label = options?.title ?? route.name;
          const focused = route.key === activeKey;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              void Haptics.selectionAsync();
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={onPress}
              onLayout={(event) => {
                const { x, width } = event.nativeEvent.layout;
                onTabLayout(route.key, x, width);
              }}
              className="mr-1.5 px-3.5 pt-2.5 pb-0"
            >
              <Text
                className={cn(
                  'pb-1.5 text-[14px]',
                  focused
                    ? 'font-bold text-ink dark:text-ink-dark'
                    : 'font-medium text-ink-muted dark:text-ink-dark-muted',
                )}
              >
                {label}
              </Text>
              {/* Until every tab is measured, the active one draws its own underline. */}
              <View
                className={cn(
                  'h-[3px] rounded-t-full',
                  !ready && focused ? 'bg-brand' : 'bg-transparent',
                )}
              />
            </Pressable>
          );
        })}
        {indicator}
      </ScrollView>
    </View>
  );
}
