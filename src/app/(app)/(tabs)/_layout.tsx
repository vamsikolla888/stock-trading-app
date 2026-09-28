import { Tabs } from 'expo-router';
import React from 'react';

import { MainTabBar } from '@/components/navigation/MainTabBar';
import { NAV_GROUPS } from '@/config/navigation';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * The five main menus — Markets, Trade, F&O, Intelligence, Settings — mirroring the web's
 * top-level groups. Each tab is itself a navigator with its own sub-tabs at the top.
 */
export default function MainTabsLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      tabBar={(props) => <MainTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.background },
        // Unvisited tabs never render, so launch only pays for Markets.
        lazy: true,
      }}
    >
      {NAV_GROUPS.map(({ route, label, tabLabel }) => (
        <Tabs.Screen
          key={route}
          name={route}
          options={{
            title: label,
            tabBarLabel: tabLabel ?? label,
          }}
        />
      ))}
    </Tabs>
  );
}
