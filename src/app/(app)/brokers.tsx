import { useRouter } from 'expo-router';
import React from 'react';
import { Alert, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  useBrokerCatalog,
  useBrokerConnections,
  useBrokerMutations,
} from '@/features/trading/hooks';
import type { BrokerCatalogEntry, BrokerConnectionSummary } from '@/features/trading/types';
import { toast } from '@/lib/utils/toast';
import { getErrorMessage } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

type Chip = { label: string; variant: 'success' | 'warning' | 'danger' | 'neutral' };

// Same mapping as the web's BrokerConnect cards.
function chipFor(connection: BrokerConnectionSummary | undefined): Chip {
  if (!connection) return { label: 'Not connected', variant: 'neutral' };
  switch (connection.status) {
    case 'connected':
      return { label: 'Connected', variant: 'success' };
    case 'pending_verification':
      return { label: 'Awaiting code', variant: 'warning' };
    case 'error':
      return { label: 'Needs attention', variant: 'danger' };
    default:
      return { label: 'Session expired', variant: 'warning' };
  }
}

function BrokerCard({
  broker,
  connection,
}: {
  broker: BrokerCatalogEntry;
  connection?: BrokerConnectionSummary;
}) {
  const router = useRouter();
  const { disconnect, reconnect: reconnectBroker } = useBrokerMutations();
  const chip = chipFor(connection);
  const isMstock = broker.auth === 'mstock-login';
  const capabilities = [
    broker.capabilities.portfolio && 'Portfolio',
    broker.capabilities.liveTrading && 'Live trading',
    broker.capabilities.marketData && 'Market data',
  ].filter(Boolean);

  const openConnect = (step?: 'verify') =>
    router.push({
      pathname: '/broker-connect',
      params: { broker: broker.id, ...(step ? { step } : {}) },
    });

  // Both reuse the stored credentials: mStock sends the day's code (verify next); an
  // API-key broker (Groww) re-mints its token and is connected straight away. If that
  // fails — a revoked key, a changed secret — the form takes new credentials.
  const reconnect = () =>
    reconnectBroker.mutate(broker.id, {
      onSuccess: (result) => {
        if (result.status === 'connected') toast.success(`${broker.label} reconnected`);
        else openConnect('verify');
      },
      onError: (error) => {
        toast.error('Couldn’t reconnect', getErrorMessage(error));
        if (!isMstock) openConnect();
      },
    });

  const confirmDisconnect = () =>
    Alert.alert(
      `Disconnect ${broker.label}?`,
      'Your stored credentials are deleted. You’ll need to connect again from scratch.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () =>
            disconnect.mutate(broker.id, {
              onSuccess: () => toast.success(`${broker.label} disconnected`),
              onError: (error) => toast.error('Couldn’t disconnect', getErrorMessage(error)),
            }),
        },
      ],
    );

  return (
    <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
      <View className="flex-row items-center gap-2">
        <Text className="flex-1 text-base font-bold text-ink dark:text-ink-dark">
          {broker.label}
        </Text>
        <Badge label={chip.label} variant={chip.variant} />
      </View>
      {connection?.accountLabel ? (
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
          {connection.accountLabel}
        </Text>
      ) : null}
      <Text className="mt-2 text-xs text-ink-muted dark:text-ink-dark-muted">
        {capabilities.join(' · ')}
      </Text>
      <Text className="mt-2 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
        {broker.sessionNote}
      </Text>
      {connection?.lastError ? (
        <Text className="mt-2 text-xs text-danger-600 dark:text-danger-dark">
          {connection.lastError}
        </Text>
      ) : null}

      <View className="mt-3 flex-row flex-wrap gap-2">
        {!connection ? (
          <Button label="Connect" size="sm" onPress={() => openConnect()} />
        ) : connection.status === 'pending_verification' && isMstock ? (
          <Button label="Enter code" size="sm" onPress={() => openConnect('verify')} />
        ) : connection.status !== 'connected' || isMstock ? (
          <Button
            label={connection.status === 'connected' ? 'Refresh session' : 'Reconnect'}
            size="sm"
            variant={connection.status === 'connected' ? 'outline' : 'primary'}
            loading={reconnectBroker.isPending}
            onPress={reconnect}
          />
        ) : null}
        {connection ? (
          <Button
            label="Disconnect"
            size="sm"
            variant="ghost"
            loading={disconnect.isPending}
            onPress={confirmDisconnect}
          />
        ) : null}
      </View>
    </View>
  );
}

export default function BrokersScreen() {
  const catalog = useBrokerCatalog();
  const connections = useBrokerConnections();

  return (
    <StackScreen
      title="Broker connections"
      subtitle="Accounts and access"
      onRefresh={() => Promise.all([catalog.refetch(), connections.refetch()])}
    >
      {catalog.isPending || connections.isPending ? (
        <ListSkeleton rows={2} />
      ) : catalog.error || connections.error ? (
        <InlineError
          what="brokers"
          error={catalog.error ?? connections.error}
          onRetry={() => void Promise.all([catalog.refetch(), connections.refetch()])}
        />
      ) : (
        <View className="gap-3">
          {(catalog.data ?? []).map((broker) => (
            <BrokerCard
              key={broker.id}
              broker={broker}
              connection={connections.data?.find((connection) => connection.broker === broker.id)}
            />
          ))}
        </View>
      )}
      <Text className="mt-5 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Your broker credentials are stored with your account so daily sessions can be renewed.
        Disconnecting deletes them.
      </Text>
    </StackScreen>
  );
}
