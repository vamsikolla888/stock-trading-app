import { useRouter } from 'expo-router';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import Wallet from 'lucide-react-native/icons/wallet';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { IconTile } from '@/components/ui/IconTile';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Skeleton } from '@/components/ui/Skeleton';
import { formatINR, MASKED_VALUE } from '@/lib/utils/formatters';
import { usePreferencesStore } from '@/store/preferencesStore';
import { isApiError } from '@/types/api';

import {
  useKillSwitch,
  useLiveTradingOptions,
  useLiveTradingSettings,
  useLiveWallet,
} from '../hooks';
import type { LiveBroker } from '../types';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

/**
 * The trade hub's status block: whether a real order can go out right now, each connected
 * broker's spendable balance, and the way to fix whatever is blocking it — checked before
 * the user picks a stock, not discovered on a rejected order.
 */
export function TradingStatusCard() {
  const router = useRouter();
  const live = useLiveTradingOptions();
  const settings = useLiveTradingSettings();
  const killSwitch = useKillSwitch();
  const paused = Boolean(killSwitch.data?.engaged) || settings.data?.enabled === false;

  const badge = live.isLoading ? null : live.available ? (
    <Badge label="Ready" variant="success" />
  ) : paused ? (
    <Badge label="Paused" variant="warning" />
  ) : (
    <Badge label="Set up" variant="warning" />
  );

  return (
    <ListCard>
      <View className="flex-row items-start gap-3 px-3.5 py-3.5">
        <IconTile Icon={ShieldCheck} tone="green" size="sm" />
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Live trading</Text>
            {badge}
          </View>
          {live.isLoading ? (
            <View className="mt-1.5">
              <Skeleton width="70%" height={12} />
            </View>
          ) : (
            <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
              {live.available
                ? `Real orders go to ${live.brokers.map(live.labelOf).join(' or ')}. Every order is risk-checked before it's sent.`
                : (live.reason ?? 'Live trading is unavailable right now.')}
            </Text>
          )}
          {!live.isLoading && !live.available ? (
            <Pressable
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => router.push(paused ? '/risk' : '/brokers')}
              className="mt-2 self-start active:opacity-60"
            >
              <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                {paused ? 'See risk controls' : 'Open broker connections'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {live.brokers.map((broker) => (
        <View key={broker}>
          <RowDivider />
          <BrokerFundsRow broker={broker} label={live.labelOf(broker)} />
        </View>
      ))}

      <RowDivider />
      <MenuRow
        Icon={ShieldCheck}
        iconTone="slate"
        title="Risk controls"
        subtitle="Kill switch, limits and the checks on every order"
        onPress={() => router.push('/risk')}
      />
      <RowDivider />
      <MenuRow
        Icon={FlaskConical}
        iconTone="violet"
        title="Paper trading"
        subtitle="Practise with virtual cash and real prices"
        onPress={() => router.push('/trade/paper')}
      />
    </ListCard>
  );
}

/** One broker's balances — null figures are "not reported", shown as a dash, never ₹0. */
function BrokerFundsRow({ broker, label }: { broker: LiveBroker; label: string }) {
  const router = useRouter();
  const hideValues = usePreferencesStore((state) => state.hideValues);
  const wallet = useLiveWallet(broker);
  const mask = (value: number | null | undefined) =>
    hideValues ? MASKED_VALUE : formatINR(value ?? null);
  const expired = isApiError(wallet.error) && wallet.error.code === 'BROKER_SESSION_EXPIRED';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} funds`}
      disabled={!wallet.error}
      onPress={() => router.push('/brokers')}
      className="flex-row items-center gap-3 px-3.5 py-3"
    >
      <IconTile Icon={Wallet} tone="blue" size="sm" />
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">{label} funds</Text>
        {wallet.isPending ? (
          <View className="mt-1.5">
            <Skeleton width="55%" height={12} />
          </View>
        ) : wallet.error && !wallet.data ? (
          <Text className="mt-0.5 text-xs text-danger-600 dark:text-danger-dark">
            {expired
              ? 'Session expired — tap to reconnect'
              : 'Balance unavailable — tap to check the connection'}
          </Text>
        ) : (
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            style={NUMBERS}
            numberOfLines={1}
          >
            Delivery {mask(wallet.data?.deliveryAvailable)} · Intraday{' '}
            {mask(wallet.data?.intradayAvailable)}
            {wallet.data?.stale ? ' · last known' : ''}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
