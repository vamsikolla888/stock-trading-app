import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { SegmentedControl } from '@/components/ui/Tabs';
import { appConfig } from '@/config/app';
import { appVersion } from '@/config/env';
import {
  SettingDivider,
  SettingRow,
  SettingValue,
} from '@/features/settings/components/SettingRow';
import { formatINR } from '@/lib/utils/formatters';
import { usePreferencesStore } from '@/store/preferencesStore';
import { type ThemePreference, useThemeStore } from '@/store/themeStore';
import { THEME_SELECTOR_DURATION, useTheme } from '@/theme/ThemeProvider';

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

/**
 * Preferences › Appearance (web: AppearancePanel) — the theme and how values show, saved at once
 * on this phone. Numbers and times are fixed by the market (Indian grouping, IST) and are said
 * here so nobody hunts for a setting that does not exist.
 */
export function AppearancePanel() {
  const preference = useThemeStore((state) => state.preference);
  const { setThemePreference } = useTheme();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const toggleHideValues = usePreferencesStore((state) => state.toggleHideValues);
  const [shownPreference, setShownPreference] = useState(preference);

  // Move the selector immediately; ThemeProvider performs the palette cross-fade independently on
  // the UI thread, so NativeWind's class recalculation cannot make this control feel unresponsive.
  const onTheme = useCallback(
    (next: ThemePreference) => {
      setShownPreference(next);
      setThemePreference(next);
    },
    [setThemePreference],
  );

  return (
    <Panel title="Appearance" meta="this phone only" flush>
      <View className="gap-2.5 px-4 pb-3.5 pt-1">
        <View>
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Theme</Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            {THEME_HINT[shownPreference]}
          </Text>
        </View>
        <SegmentedControl
          items={THEME_OPTIONS}
          value={shownPreference}
          onChange={onTheme}
          motionDuration={THEME_SELECTOR_DURATION}
        />
      </View>
      <SettingDivider />
      <SettingRow
        title="Hide portfolio values"
        detail="Mask amounts on Home and Portfolio"
        toggle={{ value: hideValues, onChange: toggleHideValues }}
      />
      <SettingDivider />
      <SettingRow title="Numbers" right={<SettingValue>{formatINR(100_000)}</SettingValue>} />
      <SettingDivider />
      <SettingRow title="Dates and times" right={<SettingValue>IST (UTC+5:30)</SettingValue>} />
    </Panel>
  );
}

/** Preferences › About — help, and which version of the app this is. */
export function AboutPanel() {
  const router = useRouter();
  return (
    <Panel title="About" flush>
      <SettingRow
        title="Help & support"
        detail="Answers to common questions"
        onPress={() => router.push('/help')}
      />
      <SettingDivider />
      <SettingRow
        title="Version"
        detail={`${appConfig.name} app on this phone`}
        right={<SettingValue>{appVersion}</SettingValue>}
      />
    </Panel>
  );
}
