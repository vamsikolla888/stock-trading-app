import * as LocalAuthentication from 'expo-local-authentication';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Logo } from '@/components/brand/Logo';
import { Button } from '@/components/ui/Button';
import { appConfig } from '@/config/app';
import { useLogout } from '@/features/auth/hooks/useAuth';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Background time after which the app asks to unlock again. */
const RELOCK_AFTER_MS = 60_000;

/**
 * Biometric app lock. When enabled in App settings it covers the signed-in app on cold
 * start and after a minute in the background, so an unlocked phone doesn't mean an open
 * brokerage account. Session tokens are untouched — this only gates the UI.
 */
export function AppLock({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const enabled = usePreferencesStore((state) => state.biometricsEnabled);
  const logout = useLogout();
  const [locked, setLocked] = useState(enabled);
  const [prompting, setPrompting] = useState(false);
  const [failed, setFailed] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const unlock = useCallback(async () => {
    if (prompting) return;
    setPrompting(true);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: `Unlock ${appConfig.name}`,
        cancelLabel: 'Cancel',
        disableDeviceFallback: false,
      });
      setFailed(!result.success);
      if (result.success) setLocked(false);
    } catch {
      // The native prompt itself failed (no biometrics set up any more, a system error):
      // stay locked and offer the retry and sign-out buttons rather than an unhandled error.
      setFailed(true);
    } finally {
      setPrompting(false);
    }
  }, [prompting]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (status) => {
      if (status === 'background') {
        backgroundedAt.current = Date.now();
      } else if (status === 'active' && enabled && backgroundedAt.current !== null) {
        if (Date.now() - backgroundedAt.current > RELOCK_AFTER_MS) setLocked(true);
        backgroundedAt.current = null;
      }
    });
    return () => subscription.remove();
  }, [enabled]);

  // Prompt shortly after the lock appears (letting the lock screen paint under the system
  // sheet first); the button stays for retries. Turning the setting off hides the lock at
  // once — `showLock` derives from both, so no state needs resetting.
  const showLock = locked && enabled;
  useEffect(() => {
    if (!showLock) return undefined;
    const timer = setTimeout(() => void unlock(), 250);
    return () => clearTimeout(timer);
    // Only when the lock is raised, not on every unlock() identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showLock]);

  return (
    <View style={styles.fill}>
      {children}
      {showLock ? (
        <SafeAreaView style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          <View className="flex-1 items-center justify-center gap-5 px-8">
            <Logo size="lg" stacked />
            <Text className="text-center text-[15px] text-ink-muted dark:text-ink-dark-muted">
              {failed ? 'Couldn’t verify it’s you. Try again.' : 'Unlock to continue.'}
            </Text>
            <Button
              label="Unlock"
              size="lg"
              fullWidth
              loading={prompting}
              onPress={() => void unlock()}
            />
            <Button label="Sign out" variant="ghost" onPress={() => logout.mutate()} />
          </View>
        </SafeAreaView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
