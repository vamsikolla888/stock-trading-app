import { useRouter } from 'expo-router';
import React from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { useAccountSecurity } from '@/features/account/hooks';
import { useLogout } from '@/features/auth/hooks/useAuth';
import { useBiometricAuth } from '@/features/auth/hooks/useBiometricAuth';
import { ProfileCard } from '@/features/settings/components/ProfileCard';
import { PanelLink, SettingDivider, SettingRow } from '@/features/settings/components/SettingRow';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { toast } from '@/lib/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Preferences › Account (web: the Account panel). Who you are, how the account is protected
 * — two-step sign-in, password and devices on the profile, this phone's app lock — and sign out.
 */
export function AccountPanel() {
  const router = useRouter();
  const { colors } = useTheme();
  const user = useAuthStore((state) => state.user);
  const security = useAccountSecurity();
  const logout = useLogout();
  const biometricsEnabled = usePreferencesStore((state) => state.biometricsEnabled);
  const setBiometricsEnabled = usePreferencesStore((state) => state.setBiometricsEnabled);
  const { isAvailable, authenticate } = useBiometricAuth();
  const mfa = security.data?.mfa;

  const onToggleAppLock = async (value: boolean) => {
    if (!value) {
      setBiometricsEnabled(false);
      return;
    }
    if (!(await isAvailable())) {
      toast.error(
        'Biometrics unavailable',
        'Set up Face ID, fingerprint or a screen lock on this phone first.',
      );
      return;
    }
    // Prove the unlock works before turning it on, so nobody locks themselves out.
    const result = await authenticate('Turn on app lock');
    if (result.success) {
      setBiometricsEnabled(true);
      toast.success('App lock on', 'You’ll unlock the app with biometrics.');
    }
  };

  const confirmSignOut = () =>
    confirmAction({
      title: 'Sign out?',
      message: 'You’ll need your email and password to sign in again.',
      confirmLabel: 'Sign out',
      destructive: true,
      onConfirm: () => logout.mutate(),
    });

  return (
    <Panel
      title="Account"
      flush
      right={<PanelLink label="Profile" onPress={() => router.push('/profile')} />}
    >
      <ProfileCard bare user={user} onPress={() => router.push('/profile')} />
      <SettingDivider />
      <SettingRow
        title="Two-step sign-in"
        detail={
          !mfa
            ? security.isError
              ? 'Couldn’t check right now'
              : 'Checking…'
            : mfa.enabled
              ? 'An authenticator code at every sign-in'
              : 'Off — add an authenticator app'
        }
        right={
          mfa ? (
            <StatusPill tone={mfa.enabled ? 'ok' : 'warn'} label={mfa.enabled ? 'On' : 'Off'} />
          ) : (
            <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">—</Text>
          )
        }
        valueText={mfa ? (mfa.enabled ? 'On' : 'Off') : undefined}
        onPress={() => router.push('/profile/two-factor')}
      />
      <SettingDivider />
      <SettingRow
        title="Password and devices"
        detail="Change your password, see where you’re signed in"
        onPress={() => router.push('/profile')}
      />
      <SettingDivider />
      <SettingRow
        title="App lock"
        detail="Biometrics on open and after a minute away"
        toggle={{ value: biometricsEnabled, onChange: (value) => void onToggleAppLock(value) }}
      />
      <SettingDivider />
      <SettingRow
        title="Sign out"
        detail="End the session on this phone"
        danger
        right={logout.isPending ? <ActivityIndicator color={colors.danger} /> : undefined}
        onPress={() => {
          if (!logout.isPending) confirmSignOut();
        }}
      />
    </Panel>
  );
}
