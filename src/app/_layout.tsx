import '../../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useState } from 'react';
import { Appearance } from 'react-native';

import { BrandSplash } from '@/components/brand/BrandSplash';
import { AppProviders } from '@/components/providers/AppProviders';
import { useAlertReadStore } from '@/features/alerts/hooks';
import { registerApiAuthHandlers, restoreSession } from '@/features/auth/bootstrapAuth';
import { initStorage } from '@/lib/storage/appStorage';
import { waitForStores } from '@/lib/storage/hydration';
import { secureTokens } from '@/lib/storage/secureTokens';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useThemeStore } from '@/store/themeStore';
import { applyColorScheme, useTheme } from '@/theme/ThemeProvider';

void SplashScreen.preventAutoHideAsync();
// BrandSplash's first frame is identical to the native splash, so the swap needs no fade.
SplashScreen.setOptions({ fade: false });

/**
 * Everything the first frame depends on, done behind the native splash with no
 * network I/O: the two Keychain reads run in parallel, then every persisted store
 * finishes hydrating so the first paint already has the right theme and the right
 * screen (welcome vs. sign-in vs. app) — no flash of the wrong one.
 */
async function bootstrap(): Promise<void> {
  registerApiAuthHandlers();
  await Promise.allSettled([initStorage(), secureTokens.preload()]);
  await Promise.all([
    restoreSession(),
    waitForStores([useThemeStore, usePreferencesStore, useAlertReadStore]),
  ]);
  // Before the first frame, so `dark:` classes and JS colours never disagree on screen.
  applyColorScheme(useThemeStore.getState().preference, Appearance.getColorScheme() === 'dark');
}

export default function RootLayout() {
  const [isReady, setIsReady] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const hideSplash = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    // Every step degrades on its own (see restoreSession / waitForHydration), so a
    // failure here still ends in a usable app — the sign-in screen at worst.
    void bootstrap().finally(() => setIsReady(true));
  }, []);

  if (!isReady) return null;

  return (
    <AppProviders>
      <RootNavigator />
      {/* Over the navigator, so the first screen mounts and starts fetching underneath. */}
      {showSplash ? <BrandSplash onFinish={hideSplash} /> : null}
    </AppProviders>
  );
}

function RootNavigator() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { colors } = useTheme();

  // Guards are the single source of truth for where a user may be. Signing in or out
  // just flips `isAuthenticated`; the router drops the now-forbidden group from
  // history and lands on the first allowed screen, so nothing navigates by hand.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: 'fade',
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="auth" />
      </Stack.Protected>
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}
