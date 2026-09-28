import * as Haptics from 'expo-haptics';
import type { BottomTabBarProps } from 'expo-router/tabs';
import React, { useEffect, useRef } from 'react';
import { type LayoutRectangle, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeader } from '@/components/navigation/AppHeader';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The top of every main-menu tab: the app bar, then the group's sub-tabs as a scrollable
 * row of text tabs with an underline on the active one — Groww's "Explore | Holdings |
 * Positions | Orders" pattern, and the mobile form of the web's second-tier nav row.
 * Rendered as the inner tab navigator's tab bar, so every sub-screen stays mounted after
 * its first visit and switching back is instant.
 */
export interface GroupTabBarProps extends BottomTabBarProps {
  group?: string;
}

export function GroupTabBar({ group, state, descriptors, navigation }: GroupTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const scrollRef = useRef<ScrollView>(null);
  const layouts = useRef<Record<string, LayoutRectangle>>({});
  const viewportWidth = useRef(0);

  // `href: null` on a Tabs.Screen (e.g. Admin for non-admins) arrives as display: none.
  const visible = state.routes.filter(
    (route) =>
      StyleSheet.flatten(descriptors[route.key]?.options.tabBarItemStyle)?.display !== 'none',
  );
  const activeKey = state.routes[state.index]?.key;

  // Keep the active tab in view — it may start off-screen after a deep link.
  useEffect(() => {
    const layout = activeKey ? layouts.current[activeKey] : undefined;
    if (!layout || viewportWidth.current === 0) return;
    const target = Math.max(0, layout.x - (viewportWidth.current - layout.width) / 2);
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [activeKey]);

  return (
    <View
      style={{ paddingTop: insets.top, backgroundColor: colors.background }}
      className="border-b border-line dark:border-line-dark"
    >
      <AppHeader group={group} />
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
        {visible.map((route) => {
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
                layouts.current[route.key] = event.nativeEvent.layout;
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
              <View
                className={cn('h-[3px] rounded-t-full', focused ? 'bg-brand' : 'bg-transparent')}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
