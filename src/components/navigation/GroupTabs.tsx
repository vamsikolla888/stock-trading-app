import { Tabs } from 'expo-router';
import React from 'react';

import { GroupTabBar } from '@/components/navigation/GroupTabBar';
import { navGroup } from '@/config/navigation';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * A main-menu group's layout: its sub-screens as tabs switched from the top row
 * (GroupTabBar). Sub-screens mount on first visit and stay mounted, so hopping between
 * them keeps scroll position and data.
 */
export function GroupTabs({ group }: { group: string }) {
  const { colors } = useTheme();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const { items } = navGroup(group);

  return (
    <Tabs
      tabBar={(props) => <GroupTabBar {...props} />}
      screenOptions={{
        tabBarPosition: 'top',
        headerShown: false,
        lazy: true,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {items.map((item) => (
        <Tabs.Screen
          key={item.name}
          name={item.name}
          options={{ title: item.label, href: item.adminOnly && !isAdmin ? null : undefined }}
        />
      ))}
    </Tabs>
  );
}
