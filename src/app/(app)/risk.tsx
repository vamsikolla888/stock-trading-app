import React from 'react';
import { Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import {
  useKillSwitch,
  useLiveTradingAvailability,
  useLiveTradingSettings,
} from '@/features/trading/hooks';

// The server's pre-trade checks (live-risk-rules.ts), in the order they run.
const CHECKS: { title: string; detail: string }[] = [
  { title: 'Kill switch', detail: 'Every live order stops while it is engaged.' },
  {
    title: 'Live trading enabled',
    detail: 'Real orders are accepted only while live trading is switched on.',
  },
  {
    title: 'Allowed product',
    detail: 'Only permitted categories (delivery, intraday) are accepted.',
  },
  { title: 'Market session', detail: 'Orders outside exchange hours are refused, not queued.' },
  {
    title: 'Quantity and price',
    detail: 'Whole shares, and price fields that match the order type.',
  },
  { title: 'Order value cap', detail: 'A single order can’t exceed the per-order limit.' },
  { title: 'Funds available', detail: 'Margin must cover the order with headroom to spare.' },
  { title: 'Per-stock daily cap', detail: 'Limits how many orders one stock can take in a day.' },
  { title: 'Open positions cap', detail: 'Limits how many positions can be open at once.' },
  { title: 'Daily loss halt', detail: 'New orders stop once the day’s loss limit is hit.' },
];

export default function RiskControlsScreen() {
  const settings = useLiveTradingSettings();
  const killSwitch = useKillSwitch();
  const live = useLiveTradingAvailability();
  const loading = settings.isPending || killSwitch.isPending;

  return (
    <StackScreen
      title="Risk controls"
      subtitle="Safeguards on every real order"
      onRefresh={() => Promise.all([settings.refetch(), killSwitch.refetch()])}
    >
      {loading ? (
        <ListSkeleton rows={2} />
      ) : settings.error || killSwitch.error ? (
        <InlineError
          what="risk status"
          error={settings.error ?? killSwitch.error}
          onRetry={() => void Promise.all([settings.refetch(), killSwitch.refetch()])}
        />
      ) : (
        <ListCard>
          <View className="flex-row items-center gap-3 px-3.5 py-3.5">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                Live trading
              </Text>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                {live.available
                  ? `Orders go to ${live.brokerLabel}`
                  : (live.reason ?? 'Unavailable')}
              </Text>
            </View>
            <Badge
              label={settings.data?.enabled ? 'On' : 'Off'}
              variant={settings.data?.enabled ? 'success' : 'neutral'}
            />
          </View>
          <RowDivider />
          <View className="flex-row items-center gap-3 px-3.5 py-3.5">
            <View className="flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Kill switch</Text>
              <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                {killSwitch.data?.engaged
                  ? (killSwitch.data.reason ?? 'Engaged by an administrator')
                  : 'Not engaged'}
              </Text>
            </View>
            <Badge
              label={killSwitch.data?.engaged ? 'Engaged' : 'Clear'}
              variant={killSwitch.data?.engaged ? 'danger' : 'success'}
            />
          </View>
        </ListCard>
      )}

      <Section title="Checked on every live order">
        <ListCard>
          {CHECKS.map((check, index) => (
            <View key={check.title}>
              {index > 0 ? <RowDivider /> : null}
              <View className="px-3.5 py-3">
                <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
                  {check.title}
                </Text>
                <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
                  {check.detail}
                </Text>
              </View>
            </View>
          ))}
        </ListCard>
      </Section>

      <Text className="mt-4 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Limits are set by your administrator and enforced on the server — an order that breaks one
        is blocked before it reaches the broker, and the reason is shown on its status.
      </Text>
    </StackScreen>
  );
}
