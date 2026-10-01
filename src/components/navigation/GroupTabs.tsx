import { Tabs } from 'expo-router';
import React from 'react';
import { Platform, UIManager, useWindowDimensions } from 'react-native';

import { GroupTabBar, type GroupTabBarProps } from '@/components/navigation/GroupTabBar';
import { useTabSwipeHeld } from '@/components/navigation/swipeLock';
import { navGroup } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

type TopTabsModule = typeof import('expo-router/js-top-tabs');

/**
 * The swipeable navigator — a native pager (react-native-pager-view) under Expo Router's top
 * tabs — or null when this binary has no pager: a dev client built before it was added, or web.
 * Resolved once, at load, so the layout never switches navigator mid-session.
 */
const SwipeTabs: TopTabsModule['TopTabs'] | null = (() => {
  if (Platform.OS === 'web' || !UIManager.hasViewManagerConfig?.('RNCViewPager')) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-router/js-top-tabs') as TopTabsModule).TopTabs;
  } catch {
    return null;
  }
})();

/**
 * A main-menu group's layout: its sub-screens as tabs under the top row (GroupTabBar) — swiped
 * between like Groww's "Explore | Holdings | Positions | Orders", the underline following the
 * finger. Sub-screens mount on first visit and stay mounted, so hopping between them keeps
 * scroll position and data; unvisited ones are not built, so a group costs one screen to open.
 *
 * Admin-only screens are guarded out of the navigator for everyone else (Protected): not in the
 * tab row, not reachable by a swipe or a link.
 */
export function GroupTabs({ group }: { group: string }) {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  // A chart being scrubbed holds the swipe (swipeLock.ts).
  const swipeHeld = useTabSwipeHeld();
  const { items } = navGroup(group);
  const sceneStyle = { backgroundColor: colors.background };

  if (SwipeTabs) {
    return (
      <SwipeTabs
        // The pager's bar props: state, descriptors, navigation and the swipe `position`.
        tabBar={(props: Omit<GroupTabBarProps, 'group'>) => (
          <GroupTabBar group={group} {...props} />
        )}
        initialLayout={{ width }}
        screenOptions={{
          lazy: true,
          swipeEnabled: !swipeHeld,
          sceneStyle,
        }}
      >
        {items.map((item) =>
          item.adminOnly ? (
            <SwipeTabs.Protected key={item.name} guard={isAdmin}>
              <SwipeTabs.Screen name={item.name} options={{ title: item.label }} />
            </SwipeTabs.Protected>
          ) : (
            <SwipeTabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
          ),
        )}
      </SwipeTabs>
    );
  }

  // No pager in this binary: tap-only tabs, the screens sliding as they change.
  return (
    <Tabs
      tabBar={(props) => <GroupTabBar group={group} {...props} />}
      screenOptions={{
        tabBarPosition: 'top',
        headerShown: false,
        lazy: true,
        animation: 'shift',
        sceneStyle,
      }}
    >
      {items.map((item) =>
        item.adminOnly ? (
          <Tabs.Protected key={item.name} guard={isAdmin}>
            <Tabs.Screen name={item.name} options={{ title: item.label }} />
          </Tabs.Protected>
        ) : (
          <Tabs.Screen key={item.name} name={item.name} options={{ title: item.label }} />
        ),
      )}
    </Tabs>
  );
}
