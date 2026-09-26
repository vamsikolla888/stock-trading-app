import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import BellRing from 'lucide-react-native/icons/bell-ring';
import X from 'lucide-react-native/icons/x';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { MenuRow } from '@/components/ui/MenuRow';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { useDeletePriceAlert, useNotifications, usePriceAlerts } from '@/features/alerts/hooks';
import { stockHref } from '@/lib/navigation';
import { formatINR } from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

export default function AlertsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const alerts = usePriceAlerts();
  const remove = useDeletePriceAlert();
  const { unreadCount } = useNotifications();

  return (
    <StackScreen title="Alerts & notifications" onRefresh={alerts.refetch}>
      <ListCard>
        <MenuRow
          Icon={Bell}
          title="Account alerts"
          subtitle={
            unreadCount > 0
              ? `${unreadCount} need your attention`
              : 'Picks, broker sessions and auto-trade'
          }
          onPress={() => router.push('/notifications')}
        />
      </ListCard>

      <Section title="Price alerts">
        {alerts.isPending ? (
          <ListSkeleton rows={3} />
        ) : alerts.error ? (
          <InlineError
            what="price alerts"
            error={alerts.error}
            onRetry={() => void alerts.refetch()}
          />
        ) : !alerts.data || alerts.data.length === 0 ? (
          <InlineEmpty
            title="No price alerts"
            message="Open any stock and set a price — you'll be notified each time it crosses."
            action={{ label: 'Find a stock', onPress: () => router.push('/search') }}
          />
        ) : (
          <ListCard>
            {alerts.data.map((alert, index) => (
              <View key={alert.id}>
                {index > 0 ? <RowDivider /> : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push(stockHref(alert.symbol, alert.exchange))}
                  className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                >
                  <BellRing size={18} color={alert.armed ? colors.link : colors.textFaint} />
                  <View className="flex-1">
                    <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                      {alert.symbol}
                    </Text>
                    <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                      {alert.direction === 'ABOVE' ? 'Rises above' : 'Falls below'}{' '}
                      {formatINR(alert.targetPrice)}
                      {alert.triggerCount > 0
                        ? ` · triggered ${alert.triggerCount}×`
                        : alert.armed
                          ? ' · armed'
                          : ''}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${alert.symbol} alert`}
                    hitSlop={10}
                    disabled={remove.isPending}
                    onPress={() =>
                      remove.mutate(alert.id, {
                        onError: (error) => toast.error('Couldn’t delete', getErrorMessage(error)),
                      })
                    }
                  >
                    <X size={18} color={colors.textMuted} />
                  </Pressable>
                </Pressable>
              </View>
            ))}
          </ListCard>
        )}
      </Section>
    </StackScreen>
  );
}
