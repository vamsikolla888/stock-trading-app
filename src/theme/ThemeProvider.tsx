import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme,
} from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { Platform, useColorScheme as useSystemColorScheme } from 'react-native';

import { type ThemePreference, useThemeStore } from '@/store/themeStore';

import {
  darkColors,
  lightColors,
  palette,
  radii,
  shadows,
  spacing,
  typography,
  type ThemeColors,
} from './tokens';

interface ThemeContextValue {
  colors: ThemeColors;
  palette: typeof palette;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadows: typeof shadows;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Points NativeWind (the `dark:` classes) at the user's choice. On native this drives the
 * app's Appearance override, so `useColorScheme()` — and with it ThemeProvider below —
 * follows too; 'system' clears the override. Web has no Appearance override and applies
 * `dark:` only via a class on <html>, so it needs the resolved light/dark instead.
 * Call it before the first frame (the root layout does) so classes and JS colours agree
 * from the start.
 */
export function applyColorScheme(preference: ThemePreference, systemIsDark: boolean): void {
  if (Platform.OS === 'web' && preference === 'system') {
    nativewindColorScheme.set(systemIsDark ? 'dark' : 'light');
  } else {
    nativewindColorScheme.set(preference);
  }
}

/** React Navigation's theme, from ours — screen and card backgrounds during transitions,
 *  modals and overscroll, which would otherwise flash React Navigation's default white. */
function navigationThemeFor(isDark: boolean, colors: ThemeColors): NavigationTheme {
  const base = isDark ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: isDark,
    colors: {
      ...base.colors,
      primary: colors.link,
      background: colors.background,
      card: colors.surface,
      text: colors.text,
      border: colors.border,
      notification: colors.danger,
    },
  };
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useSystemColorScheme();
  const preference = useThemeStore((state) => state.preference);

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';

  useEffect(() => {
    applyColorScheme(preference, systemScheme === 'dark');
  }, [preference, systemScheme]);

  // The native root view shows through during screen transitions and keyboard
  // animations; match it to the theme so dark mode never flashes white.
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(isDark ? darkColors.background : lightColors.background);
  }, [isDark]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: isDark ? darkColors : lightColors,
      palette,
      spacing,
      radii,
      typography,
      shadows,
      isDark,
    }),
    [isDark],
  );

  const navigationTheme = useMemo(() => navigationThemeFor(isDark, value.colors), [isDark, value]);

  return (
    <ThemeContext.Provider value={value}>
      <NavigationThemeProvider value={navigationTheme}>{children}</NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
