import { Tabs } from 'expo-router';
import React from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GroupIcon } from '@/components/navigation/GroupIcon';
import { NAV_GROUPS } from '@/config/navigation';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * The five main menus — Markets, Trade, F&O, Intelligence, Settings — mirroring the web's
 * top-level groups. Each tab is itself a navigator with its own sub-tabs at the top.
 */
export default function MainTabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  // An explicit height: the navigator's default (49pt) leaves the labels no room once the
  // bar has any top padding, and they get clipped to a sliver.
  const bottomPadding = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.link,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 58 + bottomPadding,
          paddingTop: 6,
          paddingBottom: bottomPadding,
          ...(Platform.OS === 'android' ? { elevation: 0 } : null),
        },
        sceneStyle: { backgroundColor: colors.background },
        // Unvisited tabs never render, so launch only pays for Markets.
        lazy: true,
      }}
    >
      {NAV_GROUPS.map(({ route, label, icon }) => (
        <Tabs.Screen
          key={route}
          name={route}
          options={{
            title: label,
            // Tints are the theme's hex strings (set above); ColorValue also admits
            // platform colour objects, which the SVG icons can't take.
            tabBarIcon: ({ color, focused }) => (
              <GroupIcon
                name={icon}
                focused={focused}
                color={typeof color === 'string' ? color : colors.textMuted}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
