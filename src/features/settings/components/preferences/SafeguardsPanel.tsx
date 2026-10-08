import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Panel } from '@/components/dashboard/Panel';
import { useSafeMode, useSetSafeMode } from '@/features/account/hooks';
import { PanelLink, SettingDivider, SettingRow } from '@/features/settings/components/SettingRow';
import { StatusDot, StatusPill } from '@/features/settings/components/StatusPill';
import { confirmAction } from '@/features/settings/lib/confirm';
import { liveOrderState } from '@/features/settings/lib/preferences';
import { useKillSwitch, useLiveTradingSettings } from '@/features/trading/hooks';
import { toast } from '@/lib/utils/toast';
import { isServerOutdated } from '@/services/api/contract';
import { useAuthStore } from '@/store/authStore';
import { getErrorMessage } from '@/types/api';

function Unknown() {
  return <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">—</Text>;
}

/**
 * Preferences › Trading safeguards (web: SafeguardsPanel) — the three switches a real order
 * passes through, and one line saying whether one can go out right now. Safe Mode is the one
 * this user controls: ON is one tap (it can only make things safer), OFF asks first, and the
 * switch moves only when the server confirms. The platform switch and the kill switch are an
 * administrator's; here they are read-only.
 */
export function SafeguardsPanel() {
  const router = useRouter();
  const isAdmin = useAuthStore((state) => state.user?.role === 'admin');
  const safeMode = useSafeMode();
  const setSafeMode = useSetSafeMode();
  const live = useLiveTradingSettings();
  const kill = useKillSwitch();

  // A server that predates Safe Mode has nothing to switch — and nothing it can block with.
  const safeOutdated = !safeMode.data && isServerOutdated(safeMode.error);
  const safeState = safeMode.data;
  const orders = liveOrderState({
    platformOn: live.data?.enabled,
    killEngaged: kill.data?.engaged,
    safeMode: safeState?.enabled ?? (safeOutdated ? false : undefined),
  });
  const failed =
    (!live.data && live.isError) ||
    (!kill.data && kill.isError) ||
    (!safeState && safeMode.isError && !safeOutdated);

  const retry = () => {
    if (!live.data) void live.refetch();
    if (!kill.data) void kill.refetch();
    if (!safeState) void safeMode.refetch();
  };

  const saveSafeMode = (next: boolean) =>
    setSafeMode.mutate(next, {
      onSuccess: (saved) =>
        toast.success(
          saved.enabled ? 'Safe Mode on' : 'Safe Mode off',
          saved.enabled
            ? 'Real orders are blocked on every broker.'
            : 'Real orders can be placed again.',
        ),
      onError: (error) => toast.error('Couldn’t change Safe Mode', getErrorMessage(error)),
    });

  const toggleSafeMode = (next: boolean) => {
    if (!safeState || setSafeMode.isPending) return;
    if (next) {
      saveSafeMode(true);
      return;
    }
    confirmAction({
      title: 'Turn Safe Mode off?',
      message: 'Real orders will be sent to your connected brokers again.',
      confirmLabel: 'Turn off',
      cancelLabel: 'Keep on',
      destructive: true,
      onConfirm: () => saveSafeMode(false),
    });
  };

  const headline = orders ? (orders.allowed ? 'Allowed' : 'Blocked') : '—';
  const because = orders
    ? orders.allowed
      ? 'Every switch is clear.'
      : `Because ${orders.reason}.`
    : failed
      ? 'Some switches couldn’t be checked.'
      : 'Checking the switches…';

  return (
    <Panel
      title="Trading safeguards"
      flush
      right={
        isAdmin ? (
          <PanelLink
            label="Platform controls"
            onPress={() =>
              router.push({ pathname: '/admin-panel/[section]', params: { section: 'trading' } })
            }
          />
        ) : undefined
      }
    >
      <View
        accessible
        accessibilityLabel={`Live orders: ${orders ? headline : 'unknown'}. ${because}`}
        className="mx-4 mb-2 mt-1 rounded-field bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark"
      >
        <View className="flex-row items-center gap-2">
          <StatusDot tone={orders ? (orders.allowed ? 'ok' : 'warn') : 'neutral'} />
          <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
            Live orders: {headline}
          </Text>
        </View>
        <Text className="mt-1 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {because}
        </Text>
        {failed ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Check the switches again"
            hitSlop={8}
            onPress={retry}
            className="mt-2 self-start active:opacity-60"
          >
            <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
              Try again
            </Text>
          </Pressable>
        ) : null}
      </View>

      {safeOutdated ? null : (
        <>
          <SettingRow
            title="Safe Mode"
            detail={
              !safeState
                ? safeMode.isError
                  ? 'Couldn’t check right now'
                  : 'Checking…'
                : setSafeMode.isPending
                  ? 'Saving…'
                  : safeState.enabled
                    ? 'Real orders refused; cancels still work'
                    : 'Blocks all your real orders'
            }
            toggle={{
              value: safeState?.enabled === true,
              onChange: toggleSafeMode,
              disabled: !safeState || setSafeMode.isPending,
            }}
          />
          <SettingDivider />
        </>
      )}
      <SettingRow
        title="Live trading"
        detail="Platform master switch"
        right={
          live.data ? (
            <StatusPill
              tone={live.data.enabled ? 'ok' : 'neutral'}
              label={live.data.enabled ? 'On' : 'Off'}
            />
          ) : (
            <Unknown />
          )
        }
      />
      <SettingDivider />
      <SettingRow
        title="Kill switch"
        detail={
          kill.data?.engaged
            ? kill.data.reason?.trim() || 'An administrator stopped live orders.'
            : 'Emergency stop for live orders'
        }
        right={
          kill.data ? (
            <StatusPill
              tone={kill.data.engaged ? 'bad' : 'ok'}
              label={kill.data.engaged ? 'Engaged' : 'Clear'}
            />
          ) : (
            <Unknown />
          )
        }
      />
      <SettingDivider />
      <SettingRow
        title="Paper trading"
        detail="Unaffected by these switches"
        right={<StatusPill tone="ok" label="Always on" />}
      />
      <SettingDivider />
      <SettingRow
        title="Pre-trade checks"
        detail="What the server checks before any real order goes out"
        onPress={() => router.push('/risk')}
      />
    </Panel>
  );
}
