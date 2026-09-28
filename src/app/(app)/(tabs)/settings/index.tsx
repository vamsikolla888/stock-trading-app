import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import CircleQuestionMark from 'lucide-react-native/icons/circle-question-mark';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FingerprintPattern from 'lucide-react-native/icons/fingerprint-pattern';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import Link from 'lucide-react-native/icons/link';
import LogOut from 'lucide-react-native/icons/log-out';
import Palette from 'lucide-react-native/icons/palette';
import ServerCog from 'lucide-react-native/icons/server-cog';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Workflow from 'lucide-react-native/icons/workflow';
import React from 'react';
import { Appearance, Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { IconTile } from '@/components/ui/IconTile';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { appConfig } from '@/config/app';
import { appVersion } from '@/config/env';
import { useNotifications } from '@/features/alerts/hooks';
import { useLogout } from '@/features/auth/hooks/useAuth';
import { useBiometricAuth } from '@/features/auth/hooks/useBiometricAuth';
import { ProfileCard } from '@/features/settings/components/ProfileCard';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { brokerSummary } from '@/features/settings/lib/brokers';
import { confirmAction } from '@/features/settings/lib/confirm';
import {
  useBrokerCatalog,
  useBrokerConnections,
  useLiveTradingAvailability,
} from '@/features/trading/hooks';
import { toast } from '@/lib/utils/toast';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import { type ThemePreference, useThemeStore } from '@/store/themeStore';
import { applyColorScheme } from '@/theme/ThemeProvider';

const THEME_OPTIONS: readonly { key: ThemePreference; label: string }[] = [
  { key: 'system', label: 'System' },
  { key: 'light', label: 'Light' },
  { key: 'dark', label: 'Dark' },
];

const THEME_HINT: Record<ThemePreference, string> = {
  system: 'Follows your phone’s setting',
  light: 'Always light',
  dark: 'Always dark — easier on the eyes at night',
};

function AppearanceRow() {
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);

  // Call applyColorScheme on the same tick as the store update so dark: classes and
  // JS colours never disagree — the ThemeProvider's useEffect catches it one frame
  // later otherwise, causing a brief flash on every mode switch.
  const handlePreferenceChange = React.useCallback(
    (next: ThemePreference) => {
      // Read the OS dark-mode state via React Native's Appearance API (works on all platforms).
      const systemIsDark = Appearance.getColorScheme() === 'dark';
      applyColorScheme(next, systemIsDark);
      setPreference(next);
    },
    [setPreference],
  );

  return (
    <View className="gap-3 px-3.5 py-3">
      <View className="flex-row items-center gap-3">
        <IconTile Icon={Palette} tone="blue" size="sm" />
        <View className="flex-1">
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Appearance</Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {THEME_HINT[preference]}
          </Text>
        </View>
      </View>
      <SegmentedControl
        items={THEME_OPTIONS}
        value={preference}
        onChange={handlePreferenceChange}
      />
    </View>
  );
}

/**
 * Settings home (web: Settings → Preferences plus the profile menu). One list, Groww
 * style: who you are, trading setup, app preferences, operations, help, sign out.
 */
export default function PreferencesScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const logout = useLogout();

  const connections = useBrokerConnections();
  const catalog = useBrokerCatalog();
  const live = useLiveTradingAvailability();
  const { unreadCount, refetch: refetchAlerts } = useNotifications();

  const biometricsEnabled = usePreferencesStore((state) => state.biometricsEnabled);
  const setBiometricsEnabled = usePreferencesStore((state) => state.setBiometricsEnabled);
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const toggleHideValues = usePreferencesStore((state) => state.toggleHideValues);
  const { isAvailable, authenticate } = useBiometricAuth();

  const onRefresh = () =>
    Promise.all([
      connections.refetch(),
      catalog.refetch(),
      refetchAlerts(),
      queryClient.invalidateQueries({ queryKey: ['live-trading'] }),
    ]);

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

  const riskSubtitle = live.isLoading
    ? 'Limits and safeguards'
    : live.available
      ? `Live trading on · via ${live.brokerLabel}`
      : 'Live trading unavailable · paper works';

  return (
    <GroupScreen onRefresh={onRefresh}>
      <ProfileCard user={user} />

      <Section title="Trading">
        <ListCard>
          <MenuRow
            Icon={Link}
            iconTone="green"
            title="Broker connections"
            subtitle={
              connections.isPending
                ? 'Checking connections…'
                : connections.error
                  ? 'Couldn’t check connections'
                  : brokerSummary(connections.data, catalog.data)
            }
            onPress={() => router.push('/brokers')}
          />
          <RowDivider />
          <MenuRow
            Icon={ShieldCheck}
            iconTone="amber"
            title="Risk controls"
            subtitle={riskSubtitle}
            onPress={() => router.push('/risk')}
          />
          <RowDivider />
          <MenuRow
            Icon={FlaskConical}
            iconTone="violet"
            title="Paper trading"
            subtitle="Practise with virtual cash"
            onPress={() => router.push('/trade/paper')}
          />
        </ListCard>
      </Section>

      <Section title="App">
        <ListCard>
          <AppearanceRow />
          <RowDivider />
          <MenuRow
            Icon={Bell}
            iconTone="rose"
            title="Alerts & notifications"
            subtitle={
              unreadCount > 0
                ? `${unreadCount} need${unreadCount === 1 ? 's' : ''} your attention`
                : 'Price alerts and account alerts'
            }
            onPress={() => router.push('/alerts')}
          />
          <RowDivider />
          <SwitchRow
            Icon={FingerprintPattern}
            iconTone="teal"
            title="App lock"
            subtitle="Unlock with biometrics on open and after a minute away"
            value={biometricsEnabled}
            onValueChange={(value) => void onToggleAppLock(value)}
          />
          <RowDivider />
          <SwitchRow
            Icon={EyeOff}
            iconTone="slate"
            title="Hide portfolio values"
            subtitle="Mask amounts on Home and Portfolio"
            value={hideValues}
            onValueChange={toggleHideValues}
          />
        </ListCard>
      </Section>

      <Section title="Operations">
        <ListCard>
          <MenuRow
            Icon={Workflow}
            iconTone="teal"
            title="Automations"
            subtitle="News intake, daily sync and scheduled jobs"
            onPress={() => router.push('/settings/automations')}
          />
        </ListCard>
      </Section>

      {isAdmin ? (
        <Section
          title="Administration"
          right={
            <View className="rounded-full bg-danger-100 px-2 py-0.5 dark:bg-danger-900">
              <Text className="text-[10px] font-bold uppercase tracking-wide text-danger-600 dark:text-danger-400">
                Admin
              </Text>
            </View>
          }
        >
          <ListCard>
            <MenuRow
              Icon={ServerCog}
              iconTone="violet"
              title="Admin console"
              subtitle="Platform health, logs, usage and users"
              onPress={() => router.push('/settings/admin')}
            />
            <RowDivider />
            <MenuRow
              Icon={Sparkles}
              iconTone="amber"
              title="Recommendations engine"
              subtitle="Data session and manual runs"
              onPress={() => router.push('/recommendations-admin')}
            />
          </ListCard>
        </Section>
      ) : null}

      <Section title="Support">
        <ListCard>
          <MenuRow
            Icon={CircleQuestionMark}
            iconTone="blue"
            title="Help & support"
            subtitle="Answers to common questions"
            onPress={() => router.push('/help')}
          />
        </ListCard>
      </Section>

      <ListCard className="mt-7">
        <MenuRow
          Icon={LogOut}
          title="Sign out"
          tone="danger"
          onPress={confirmSignOut}
          right={<View />}
        />
      </ListCard>

      <Text className="mt-6 text-center text-xs text-ink-faint dark:text-ink-dark-faint">
        {appConfig.name} · Version {appVersion}
      </Text>
    </GroupScreen>
  );
}
