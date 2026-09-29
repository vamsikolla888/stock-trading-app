import { Stack } from 'expo-router';
import React from 'react';

import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * Signed-out stack. Paths deliberately mirror the web client (/auth/login,
 * /auth/reset-password…) so the server's password-reset email link maps 1:1 onto this
 * app once universal/app links are enabled for the domain.
 */
export default function AuthLayout() {
  const { colors } = useTheme();
  // Stores are hydrated before the first render (root layout), so this is stable.
  const hasSeenWelcome = usePreferencesStore((state) => state.hasSeenWelcome);

  return (
    <Stack
      initialRouteName={hasSeenWelcome ? 'login' : 'welcome'}
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
      <Stack.Screen name="login" />
      <Stack.Screen name="register" />
      <Stack.Screen name="forgot-password" />
      <Stack.Screen name="reset-password" />
      {/* Terminal state — no swipe back into a form that was already submitted. */}
      <Stack.Screen
        name="pending-approval"
        options={{ gestureEnabled: false, animation: 'fade' }}
      />
    </Stack>
  );
}
