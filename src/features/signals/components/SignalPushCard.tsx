import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { Button } from '@/components/ui/Button';
import { appConfig } from '@/config/app';
import type { NotificationWord } from '@/features/settings/lib/preferences';
import type { PushState } from '@/features/settings/push';
import { useTheme } from '@/theme/ThemeProvider';

import { pushPreview, type Tone } from '../lib/signals';
import type { Signal } from '../types';

import { DotLabel } from './SignalParts';

const WORD: Record<NotificationWord, { label: string; tone: Tone }> = {
  On: { label: 'On for this phone', tone: 'success' },
  Blocked: { label: 'Blocked in phone settings', tone: 'warning' },
  Off: { label: 'Off for this phone', tone: 'neutral' },
  Unavailable: { label: 'Not available', tone: 'neutral' },
};

/**
 * Push alerts for market signals (web: the Signals page's "Push alerts" card): this phone's
 * state, what an alert would say, and the one action that matters — turn it on, or send a test.
 * The phone's push wiring is the Settings screen's own (features/settings/push.ts).
 */
export function SignalPushCard({ push, featured }: { push: PushState; featured: Signal | null }) {
  const router = useRouter();
  const { colors } = useTheme();
  const word = WORD[push.word];
  const devices = push.devices.data?.devices.length;
  const preview = pushPreview(featured);

  return (
    <Panel
      title="Push alerts"
      meta={devices == null ? undefined : `${devices} registered device${devices === 1 ? '' : 's'}`}
    >
      <DotLabel tone={word.tone} label={word.label} />

      <View
        accessible
        accessibilityLabel={`Notification preview: ${preview.title}. ${preview.body}`}
        className="mt-3 rounded-field bg-surface-sunk p-3 dark:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center justify-between">
          <Text className="text-[10px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
            {appConfig.name}
          </Text>
          <Text className="text-[10px] text-ink-faint dark:text-ink-dark-faint">now</Text>
        </View>
        <Text className="mt-1 text-[13px] font-semibold text-ink dark:text-ink-dark">
          {preview.title}
        </Text>
        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {preview.body}
        </Text>
      </View>

      <View className="mt-3 flex-row items-center gap-3">
        {push.enabledHere ? (
          <Button
            label={push.pending === 'test' ? 'Sending…' : 'Send test'}
            variant="outline"
            size="sm"
            disabled={push.pending != null}
            onPress={push.test}
          />
        ) : (
          <Button
            label={push.pending === 'enable' ? 'Turning on…' : 'Turn on for this phone'}
            variant="outline"
            size="sm"
            leftIcon={<Bell size={15} color={colors.text} />}
            disabled={!push.supported || push.permission === 'denied' || push.pending != null}
            onPress={push.enable}
          />
        )}
        <Pressable
          accessibilityRole="link"
          hitSlop={8}
          onPress={() =>
            router.push({ pathname: '/settings', params: { section: 'notifications' } })
          }
          className="active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Notification settings
          </Text>
        </Pressable>
      </View>
      {push.message ? (
        <Text
          accessibilityLiveRegion="polite"
          className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
        >
          {push.message}
        </Text>
      ) : null}
    </Panel>
  );
}
