import { Tabs } from 'expo-router';
import React from 'react';

import { MainTabBar } from '@/components/navigation/MainTabBar';
import { TAB_GROUPS } from '@/config/navigation';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * The five bottom menus — Markets, F&O, Trade, Intelligence, Agents — mirroring the web's
 * top-level groups (Settings, the sixth, opens from the app bar). Each tab is itself a navigator
 * with its own sub-tabs at the top.
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
        // A short cross-fade between menus — the bar stays put, the content dissolves.
        animation: 'fade',
        // Unvisited tabs never render, so launch only pays for Markets.
        lazy: true,
        // A tab out of sight stops re-rendering (its queries still refresh) until it is back.
        freezeOnBlur: true,
      }}
    >
      {TAB_GROUPS.map(({ route, label, tabLabel }) => (
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
