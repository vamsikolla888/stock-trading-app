import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
  type Theme as NavigationTheme,
} from 'expo-router';
import * as SystemUI from 'expo-system-ui';
import { colorScheme as nativewindColorScheme } from 'nativewind';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Image,
  Platform,
  StyleSheet,
  useColorScheme as useSystemColorScheme,
  View,
} from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { captureRef, releaseCapture } from 'react-native-view-shot';

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
  setThemePreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

let appliedColorScheme: ThemePreference | null = null;

export const THEME_SELECTOR_DURATION = 90;
const CAPTURE_DELAY = THEME_SELECTOR_DURATION + 20;
const SNAPSHOT_FADE = {
  duration: 240,
  easing: Easing.out(Easing.cubic),
  reduceMotion: ReduceMotion.System,
} as const;

interface ThemeSnapshot {
  id: number;
  uri: string;
}

interface PendingTheme {
  id: number;
  preference: ThemePreference;
  uri: string;
}

/**
 * Points NativeWind (the `dark:` classes) at the user's choice. On native this drives the
 * app's Appearance override, so `useColorScheme()` — and with it ThemeProvider below —
 * follows too; 'system' clears the override. Web has no Appearance override and applies
 * `dark:` only via a class on <html>, so it needs the resolved light/dark instead.
 * Call it before the first frame (the root layout does) so classes and JS colours agree
 * from the start.
 */
export function applyColorScheme(preference: ThemePreference, systemIsDark: boolean): void {
  const next =
    Platform.OS === 'web' && preference === 'system'
      ? systemIsDark
        ? 'dark'
        : 'light'
      : preference;
  // The animated commit applies the scheme before updating the persisted preference. The effect
  // below sees the same change afterwards; avoid making NativeWind recalculate every dark: class
  // twice, which is the visible pause the theme picker used to have.
  if (appliedColorScheme === next) return;
  appliedColorScheme = next;
  nativewindColorScheme.set(next);
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
  const setStoredPreference = useThemeStore((state) => state.setPreference);

  const isDark = preference === 'system' ? systemScheme === 'dark' : preference === 'dark';
  const colors = isDark ? darkColors : lightColors;
  const captureTarget = useRef<View>(null);
  const captureTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const pendingTheme = useRef<PendingTheme | null>(null);
  const snapshotUri = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState<ThemeSnapshot | null>(null);
  const snapshotOpacity = useSharedValue(1);
  const snapshotStyle = useAnimatedStyle(() => ({ opacity: snapshotOpacity.get() }));

  const commitPreference = useCallback(
    (next: ThemePreference) => {
      applyColorScheme(next, systemScheme === 'dark');
      setStoredPreference(next);
    },
    [setStoredPreference, systemScheme],
  );

  const clearSnapshot = useCallback((uri: string) => {
    if (snapshotUri.current !== uri) return;
    snapshotUri.current = null;
    pendingTheme.current = null;
    setSnapshot(null);
    if (Platform.OS !== 'web') releaseCapture(uri);
  }, []);

  const captureCurrentTheme = useCallback(
    async (id: number, next: ThemePreference) => {
      const target = captureTarget.current;
      if (!target || id !== requestId.current) return;
      try {
        const uri = await captureRef(target, {
          format: 'png',
          quality: 1,
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        });
        if (id !== requestId.current) {
          if (Platform.OS !== 'web') releaseCapture(uri);
          return;
        }
        pendingTheme.current = { id, preference: next, uri };
        snapshotUri.current = uri;
        snapshotOpacity.set(1);
        setSnapshot({ id, uri });
      } catch {
        if (id === requestId.current) commitPreference(next);
      }
    },
    [commitPreference, snapshotOpacity],
  );

  const setThemePreference = useCallback(
    (next: ThemePreference) => {
      requestId.current += 1;
      const id = requestId.current;
      if (captureTimer.current) clearTimeout(captureTimer.current);
      captureTimer.current = null;
      const visibleSnapshot = snapshotUri.current;
      if (visibleSnapshot) clearSnapshot(visibleSnapshot);

      if (next === preference) {
        return;
      }
      const nextIsDark = next === 'system' ? systemScheme === 'dark' : next === 'dark';

      // A different preference can resolve to the same palette (System dark → Dark). There is no
      // repaint to hide in that case, so keep the selector responsive and commit immediately.
      if (nextIsDark === isDark) {
        commitPreference(next);
        return;
      }

      // Let the selected pill reach its destination, then capture that complete old-theme frame.
      // The real palette swap happens only after this bitmap is on top of the app.
      captureTimer.current = setTimeout(() => {
        captureTimer.current = null;
        void captureCurrentTheme(id, next);
      }, CAPTURE_DELAY);
    },
    [captureCurrentTheme, clearSnapshot, commitPreference, isDark, preference, systemScheme],
  );

  const revealTheme = useCallback(
    (frame: ThemeSnapshot) => {
      const pending = pendingTheme.current;
      if (!pending || pending.id !== frame.id || pending.uri !== frame.uri) return;
      commitPreference(pending.preference);

      // Two frames guarantee the new NativeWind palette has painted underneath the opaque
      // snapshot. Only then fade the old frame away, so the class recalculation is never visible.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (frame.id !== requestId.current) return;
          snapshotOpacity.set(
            withTiming(0, SNAPSHOT_FADE, (finished) => {
              if (finished) runOnJS(clearSnapshot)(frame.uri);
            }),
          );
        });
      });
    },
    [clearSnapshot, commitPreference, snapshotOpacity],
  );

  useEffect(
    () => () => {
      requestId.current += 1;
      if (captureTimer.current) clearTimeout(captureTimer.current);
      const uri = snapshotUri.current;
      if (uri && Platform.OS !== 'web') releaseCapture(uri);
    },
    [],
  );

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
      colors,
      palette,
      spacing,
      radii,
      typography,
      shadows,
      isDark,
      setThemePreference,
    }),
    [colors, isDark, setThemePreference],
  );

  const navigationTheme = useMemo(() => navigationThemeFor(isDark, colors), [colors, isDark]);

  return (
    <ThemeContext.Provider value={value}>
      <NavigationThemeProvider value={navigationTheme}>
        <View style={[styles.root, { backgroundColor: colors.background }]}>
          <View
            ref={captureTarget}
            collapsable={false}
            style={[styles.root, { backgroundColor: colors.background }]}
          >
            {children}
          </View>
          {snapshot ? (
            <Animated.View pointerEvents="none" style={[styles.snapshot, snapshotStyle]}>
              <Image
                source={{ uri: snapshot.uri }}
                resizeMode="stretch"
                onLoad={() => revealTheme(snapshot)}
                style={styles.snapshotImage}
              />
            </Animated.View>
          ) : null}
        </View>
      </NavigationThemeProvider>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  snapshot: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 10_000,
  },
  snapshotImage: { width: '100%', height: '100%' },
});
