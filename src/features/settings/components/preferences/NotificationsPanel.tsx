import { useRouter } from 'expo-router';
import React from 'react';
import { Linking, Platform, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { Button } from '@/components/ui/Button';
import { useNotifications } from '@/features/alerts/hooks';
import {
  SettingDivider,
  SettingRow,
  SettingValue,
} from '@/features/settings/components/SettingRow';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { NOTIFICATION_TONE, type NotificationWord } from '@/features/settings/lib/preferences';
import type { PushState } from '@/features/settings/push';

function deviceDetail(word: NotificationWord): string | undefined {
  switch (word) {
    case 'On':
    case 'Off':
      return undefined;
    case 'Blocked':
      return 'Blocked in your phone’s settings';
    default:
      return Platform.OS === 'ios'
        ? 'Not on iPhone yet — alerts still collect below'
        : Platform.OS === 'web'
          ? 'Needs the phone app — alerts still collect below'
          : 'Not supported in this build — alerts still collect below';
  }
}

/**
 * Preferences › Notifications (web: NotificationsPanel) — this phone's push state in one word,
 * the account's registered devices and the server's provider, the switch for this phone, and
 * the in-app list every alert also lands in. Push state is lifted to the screen (usePushState)
 * because the glance tile reads the same word.
 */
export function NotificationsPanel({ push }: { push: PushState }) {
  const router = useRouter();
  const { unreadCount } = useNotifications();
  const devices = push.devices.data;
  const busy = push.pending !== null;

  return (
    <Panel title="Notifications" meta="market and recommendation alerts" flush>
      <SettingRow
        title="This phone"
        detail={deviceDetail(push.word)}
        right={<StatusPill tone={NOTIFICATION_TONE[push.word]} label={push.word} />}
      />
      <SettingDivider />
      <SettingRow
        title="Registered devices"
        detail={!devices && push.devices.isError ? 'Couldn’t check right now' : undefined}
        right={<SettingValue>{devices ? devices.devices.length : '—'}</SettingValue>}
      />
      <SettingDivider />
      <SettingRow
        title="Push provider"
        right={
          devices ? (
            <StatusPill
              tone={devices.configured ? 'ok' : 'warn'}
              label={devices.configured ? 'Ready' : 'Not set up'}
            />
          ) : (
            <SettingValue>—</SettingValue>
          )
        }
      />

      {push.supported ? (
        <View className="gap-2.5 px-4 pb-3.5 pt-1">
          {push.message ? (
            <Text
              accessibilityLiveRegion="polite"
              className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted"
            >
              {push.message}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button
              size="sm"
              label={push.enabledHere ? 'Refresh this phone' : 'Turn on for this phone'}
              loading={push.pending === 'enable'}
              disabled={busy}
              onPress={push.enable}
            />
            {push.enabledHere ? (
              <Button
                size="sm"
                variant="outline"
                label="Turn off here"
                loading={push.pending === 'disable'}
                disabled={busy}
                onPress={push.disable}
              />
            ) : null}
            {push.enabledHere ? (
              <Button
                size="sm"
                variant="outline"
                label="Send a test"
                loading={push.pending === 'test'}
                disabled={busy || !devices?.configured}
                onPress={push.test}
              />
            ) : null}
            {push.permission === 'denied' ? (
              <Button
                size="sm"
                variant="ghost"
                label="Open phone settings"
                onPress={() => void Linking.openSettings()}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <SettingDivider />
      <SettingRow
        title="Alerts & notifications"
        detail={
          unreadCount > 0
            ? `${unreadCount} need${unreadCount === 1 ? 's' : ''} your attention`
            : 'Price alerts and account alerts'
        }
        valueText={unreadCount > 0 ? `${unreadCount} unread` : undefined}
        onPress={() => router.push('/alerts')}
      />
    </Panel>
  );
}
