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
          // Screens under the top one stop re-rendering while covered, so a push or a swipe
          // back never competes with background refreshes for the frame.
          freezeOnBlur: true,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="search" />
        {/* Straight into full screen (`?full=1`) fades in; the chart screen itself slides. */}
        <Stack.Screen
          name="chart/[symbol]"
          options={({ route }) => ({
            animation:
              (route.params as { full?: string } | undefined)?.full === '1'
                ? 'fade'
                : 'slide_from_right',
          })}
        />
        {/* Modals rise from the bottom on both platforms (Android would otherwise slide in). */}
        <Stack.Screen
          name="order"
          options={{
            presentation: 'modal',
            animation: 'slide_from_bottom',
            gestureEnabled: false,
          }}
        />
        <Stack.Screen
          name="watchlist-picker"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="broker-connect"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
      </Stack>
    </AppLock>
  );
}
