import { useRouter } from 'expo-router';
import Link2 from 'lucide-react-native/icons/link-2';
import PlugZap from 'lucide-react-native/icons/plug-zap';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { IconTile } from '@/components/ui/IconTile';
import { cn } from '@/lib/utils/cn';
import { getErrorMessage } from '@/types/api';

import type { BrokerState } from '../lib/overview';

interface BrokerStatusCardProps {
  state: Exclude<BrokerState, 'connected' | 'loading'>;
  brokerLabel: string;
  /** What connecting unlocks, in one line. */
  notConnectedMessage: string;
  sessionMessage?: string;
  error?: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
}

/**
 * The state a broker book is in when it can't show figures: not connected, the day's
 * session lapsed, or the broker read failed — each with the one action that fixes it.
 */
export function BrokerStatusCard({
  state,
  brokerLabel,
  notConnectedMessage,
  sessionMessage,
  error,
  onRetry,
  retrying,
  className,
}: BrokerStatusCardProps) {
  const router = useRouter();
  const copy =
    state === 'not-connected'
      ? {
          Icon: Link2,
          tone: 'blue' as const,
          title: `Connect your ${brokerLabel} account`,
          message: notConnectedMessage,
          action: `Connect ${brokerLabel}`,
        }
      : state === 'session-expired'
        ? {
            Icon: PlugZap,
            tone: 'amber' as const,
            title: `${brokerLabel} needs to be reconnected`,
            message:
              sessionMessage ??
              `Broker sessions reset every night. Reconnect ${brokerLabel} to keep your book in sync.`,
            action: 'Reconnect',
          }
        : {
            Icon: TriangleAlert,
            tone: 'rose' as const,
            title: `Couldn't read your ${brokerLabel} account`,
            message: getErrorMessage(error, 'Please try again in a moment.'),
            action: 'Open connections',
          };

  return (
    <View
      accessibilityRole={state === 'error' ? 'alert' : undefined}
      className={cn(
        'rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      <View className="flex-row items-start gap-3">
        <IconTile Icon={copy.Icon} tone={copy.tone} />
        <View className="flex-1">
          <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">{copy.title}</Text>
          <Text className="mt-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
            {copy.message}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2.5">
        <Button label={copy.action} className="flex-1" onPress={() => router.push('/brokers')} />
        {state !== 'not-connected' && onRetry ? (
          <Button
            label={retrying ? 'Checking…' : 'Try again'}
            variant="outline"
            className="flex-1"
            disabled={retrying}
            onPress={onRetry}
          />
        ) : null}
      </View>
    </View>
  );
}

/** "● Connected · synced 2:05 PM" — the live dot beside a broker book's intro line. */
export function ConnectionDot({ state }: { state: BrokerState }) {
  const dot =
    state === 'connected'
      ? 'bg-brand dark:bg-brand'
      : state === 'session-expired' || state === 'error'
        ? 'bg-danger-500 dark:bg-danger-dark'
        : 'bg-ink-faint dark:bg-ink-dark-faint';
  const label =
    state === 'connected'
      ? 'Connected'
      : state === 'loading'
        ? 'Connecting…'
        : state === 'session-expired'
          ? 'Session expired'
          : state === 'error'
            ? 'Unavailable'
            : 'Not connected';
  return (
    <View className="flex-row items-center gap-1.5" accessibilityLabel={label}>
      <View className={cn('h-2 w-2 rounded-full', dot)} />
      <Text className="text-xs font-medium text-ink-muted dark:text-ink-dark-muted">{label}</Text>
    </View>
  );
}
