import { Stack } from 'expo-router';
import React from 'react';

import { AppLock } from '@/features/auth/components/AppLock';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Signed-in stack: the tab bar plus every screen pushed over it. The whole group sits
 * behind the root layout's Stack.Protected guard, so nothing here re-checks auth.
 */
export default function AppLayout() {
  const { colors } = useTheme();

  return (
    <AppLock>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="search" />
        <Stack.Screen name="order" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="watchlist-picker" options={{ presentation: 'modal' }} />
        <Stack.Screen name="broker-connect" options={{ presentation: 'modal' }} />
      </Stack>
    </AppLock>
  );
}
