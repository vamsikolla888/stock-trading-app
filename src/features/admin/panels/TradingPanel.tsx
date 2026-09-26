import { useRouter } from 'expo-router';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import OctagonX from 'lucide-react-native/icons/octagon-x';
import Power from 'lucide-react-native/icons/power';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { IconTile } from '@/components/ui/IconTile';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, Section } from '@/components/ui/Section';
import { AdminQueryError } from '@/features/admin/components/AdminState';
import {
  useKillSwitchControl,
  usePlatformUsers,
  useSetLiveTradingEnabled,
} from '@/features/admin/hooks';
import {
  actorLabel,
  KILL_REASON_MAX,
  killReasonError,
  liveOrderGate,
  stringField,
} from '@/features/admin/lib/trading';
import { StatusPill } from '@/features/settings/components/StatusPill';
import { SwitchRow } from '@/features/settings/components/SwitchRow';
import { TextArea } from '@/features/settings/components/TextArea';
import { confirmAction } from '@/features/settings/lib/confirm';
import { formatDateTime } from '@/features/settings/lib/time';
import { useKillSwitch, useLiveTradingSettings } from '@/features/trading/hooks';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

function GateCard({ enabled, engaged }: { enabled?: boolean; engaged?: boolean }) {
  const gate = liveOrderGate(enabled, engaged);
  const Icon = gate.tone === 'ok' ? CircleCheck : gate.tone === 'bad' ? OctagonX : TriangleAlert;
  const tone = gate.tone === 'ok' ? 'green' : gate.tone === 'bad' ? 'rose' : 'amber';
  return (
    <View
      accessible
      accessibilityLabel={`${gate.title}. ${gate.detail}`}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <IconTile Icon={Icon} tone={tone} size="lg" />
      <View className="flex-1">
        <Text
          accessibilityRole="header"
          className="text-base font-bold text-ink dark:text-ink-dark"
        >
          {gate.title}
        </Text>
        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {gate.detail}
        </Text>
      </View>
    </View>
  );
}

/**
 * The two global gates on real-money orders (web: Feature flags → Live trading; the web
 * shows the kill switch read-only). Both are Redis settings that fail closed on the server.
 */
export function TradingPanel() {
  const router = useRouter();
  const settings = useLiveTradingSettings();
  const killSwitch = useKillSwitch();
  const users = usePlatformUsers();
  const setEnabled = useSetLiveTradingEnabled();
  const { engage, disengage } = useKillSwitchControl();
  const [reason, setReason] = useState('');
  const [reasonTouched, setReasonTouched] = useState(false);

  const emails = useMemo(
    () => new Map((users.data ?? []).map((user) => [user.id, user.email])),
    [users.data],
  );

  const enabled = settings.data?.enabled;
  const engaged = killSwitch.data?.engaged;
  const settingsBy = actorLabel(stringField(settings.data, 'updatedBy'), emails);
  const engagedBy = actorLabel(stringField(killSwitch.data, 'engagedBy'), emails);
  const reasonError = killReasonError(reason);

  const onRefresh = () => Promise.all([settings.refetch(), killSwitch.refetch(), users.refetch()]);

  const toggleLive = (next: boolean) =>
    confirmAction({
      title: next ? 'Switch live trading on?' : 'Switch live trading off?',
      message: next
        ? 'Real orders will reach connected brokers for every user, subject to the per-order risk checks and the kill switch.'
        : 'Every new real order is refused until it’s switched on again. Orders already at the broker are not cancelled.',
      confirmLabel: next ? 'Switch on' : 'Switch off',
      destructive: !next,
      onConfirm: () =>
        setEnabled.mutate(next, {
          onSuccess: (saved) =>
            toast.success(saved.enabled ? 'Live trading on' : 'Live trading off'),
          onError: (error) => toast.error('Couldn’t change it', getErrorMessage(error)),
        }),
    });

  const engageNow = () => {
    setReasonTouched(true);
    if (reasonError) return;
    const text = reason.trim();
    confirmAction({
      title: 'Engage the kill switch?',
      message:
        'Every new live order is refused for every user until an administrator clears it. Orders already at the broker are not cancelled.',
      confirmLabel: 'Engage',
      destructive: true,
      onConfirm: () =>
        engage.mutate(text, {
          onSuccess: () => {
            setReason('');
            setReasonTouched(false);
            toast.success('Kill switch engaged', 'New live orders are refused.');
          },
          onError: (error) => toast.error('Couldn’t engage it', getErrorMessage(error)),
        }),
    });
  };

  const disengageNow = () =>
    confirmAction({
      title: 'Clear the kill switch?',
      message: enabled
        ? 'Live orders are accepted again straight away.'
        : 'Live trading is still switched off, so orders stay refused until it’s switched on.',
      confirmLabel: 'Clear',
      onConfirm: () =>
        disengage.mutate(undefined, {
          onSuccess: () => toast.success('Kill switch cleared'),
          onError: (error) => toast.error('Couldn’t clear it', getErrorMessage(error)),
        }),
    });

  const loading = settings.isPending || killSwitch.isPending;
  const failed = !settings.data || !killSwitch.data;

  return (
    <StackScreen
      title="Trading controls"
      subtitle="Global gates on real orders"
      onRefresh={onRefresh}
    >
      {loading ? (
        <ListSkeleton rows={3} />
      ) : failed ? (
        <AdminQueryError
          what="trading controls"
          error={settings.error ?? killSwitch.error}
          onRetry={() => void onRefresh()}
        />
      ) : (
        <>
          <GateCard enabled={enabled} engaged={engaged} />

          <Section title="Live trading">
            <ListCard>
              <SwitchRow
                Icon={Power}
                iconTone="green"
                title="Accept live orders"
                subtitle={enabled ? 'On for every user' : 'Off — real orders are refused'}
                value={Boolean(enabled)}
                disabled={setEnabled.isPending}
                onValueChange={toggleLive}
              />
            </ListCard>
            <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {settings.data?.updatedAt
                ? `Last changed ${formatDateTime(settings.data.updatedAt)} IST${settingsBy ? ` by ${settingsBy}` : ''}.`
                : 'Never switched on — off by default.'}
            </Text>
          </Section>

          <Section title="Kill switch">
            <Card className="gap-1">
              <View className="flex-row items-center gap-3">
                <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                  {engaged ? 'Engaged' : 'Clear'}
                </Text>
                <StatusPill
                  tone={engaged ? 'bad' : 'ok'}
                  label={engaged ? 'Orders blocked' : 'Not blocking'}
                />
              </View>
              {engaged ? (
                <>
                  <Text
                    selectable
                    className="mt-1 text-[13px] leading-[19px] text-ink dark:text-ink-dark"
                  >
                    {killSwitch.data?.reason ?? 'No reason recorded.'}
                  </Text>
                  <KeyValueRow
                    label="Engaged"
                    value={
                      killSwitch.data?.engagedAt
                        ? `${formatDateTime(killSwitch.data.engagedAt)} IST`
                        : '—'
                    }
                    divider
                    className="mt-2"
                  />
                  {engagedBy ? <KeyValueRow label="By" value={engagedBy} divider /> : null}
                  <Button
                    label="Clear kill switch"
                    variant="outline"
                    fullWidth
                    className="mt-3"
                    loading={disengage.isPending}
                    onPress={disengageNow}
                  />
                </>
              ) : (
                <View className="mt-2 gap-3">
                  <Text className="text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
                    Stops every new live order for every user at once — for a broker outage, a bad
                    feed or anything that needs trading paused now.
                  </Text>
                  <TextArea
                    label="Reason"
                    value={reason}
                    onChangeText={setReason}
                    onBlur={() => setReasonTouched(true)}
                    maxLength={KILL_REASON_MAX}
                    minHeight={72}
                    placeholder="e.g. mStock order API returning errors"
                    helperText="Shown to traders whose orders are refused."
                  />
                  {reasonTouched && reasonError ? (
                    <Text
                      accessibilityRole="alert"
                      className="text-[13px] text-danger-600 dark:text-danger-dark"
                    >
                      {reasonError}
                    </Text>
                  ) : null}
                  <Button
                    label="Engage kill switch"
                    variant="danger"
                    fullWidth
                    loading={engage.isPending}
                    onPress={engageNow}
                  />
                </View>
              )}
            </Card>
          </Section>

          <Section title="Also checked on every order">
            <ListCard>
              <MenuRow
                Icon={ShieldCheck}
                iconTone="amber"
                title="Risk controls"
                subtitle="Market hours, funds, order and daily limits"
                onPress={() => router.push('/risk')}
              />
            </ListCard>
          </Section>

          <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            Both switches fail safe: if the server can’t read them, live trading reads as off and
            the kill switch as engaged. Paper trading is never affected.
          </Text>
        </>
      )}
    </StackScreen>
  );
}
