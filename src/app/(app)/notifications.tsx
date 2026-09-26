import { useRouter } from 'expo-router';
import BellOff from 'lucide-react-native/icons/bell-off';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import Info from 'lucide-react-native/icons/info';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React, { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';

import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider } from '@/components/ui/Section';
import type { DerivedAlert } from '@/features/alerts/deriveAlerts';
import { useNotifications } from '@/features/alerts/hooks';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/** Opening the list marks everything read after a moment — like the web bell's panel. */
const MARK_READ_DELAY_MS = 1200;

export default function NotificationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { alerts, isRead, markAllRead, isLoading, refetch } = useNotifications();

  useEffect(() => {
    const timer = setTimeout(markAllRead, MARK_READ_DELAY_MS);
    return () => clearTimeout(timer);
  }, [markAllRead]);

  const openAlert = (alert: DerivedAlert) => {
    if (alert.target === 'stock' && alert.symbol)
      router.push(stockHref(alert.symbol, alert.exchange));
    else if (alert.target === 'broker') router.push('/brokers');
    else if (alert.target === 'paper') router.push('/trade/paper');
    else router.push('/intel');
  };

  const icon = (alert: DerivedAlert) => {
    if (alert.severity === 'action') return <CircleAlert size={18} color={colors.danger} />;
    if (alert.severity === 'warning') return <TriangleAlert size={18} color={colors.warning} />;
    return <Info size={18} color={colors.info} />;
  };

  return (
    <StackScreen title="Notifications" onRefresh={refetch}>
      {isLoading ? (
        <ListSkeleton rows={3} />
      ) : alerts.length === 0 ? (
        <View className="items-center gap-3 py-16">
          <BellOff size={32} color={colors.textFaint} />
          <Text className="text-base font-semibold text-ink dark:text-ink-dark">
            You're all caught up
          </Text>
          <Text className="max-w-[280px] text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Stop and target alerts on today's picks, broker session reminders and auto-trade halts
            show up here.
          </Text>
        </View>
      ) : (
        <ListCard>
          {alerts.map((alert, index) => (
            <View key={alert.id}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                onPress={() => openAlert(alert)}
                className="flex-row gap-3 px-3.5 py-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <View className="pt-0.5">{icon(alert)}</View>
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark">
                      {alert.title}
                    </Text>
                    {!isRead(alert.id) && alert.severity !== 'info' ? (
                      <View
                        accessibilityLabel="Unread"
                        className="h-2 w-2 rounded-full bg-danger-500"
                      />
                    ) : null}
                  </View>
                  <Text
                    className={cn(
                      'mt-0.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted',
                    )}
                  >
                    {alert.detail}
                  </Text>
                </View>
              </Pressable>
            </View>
          ))}
        </ListCard>
      )}
      <Text className="mt-4 text-center text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Alerts are worked out from live data each time you open the app.
      </Text>
    </StackScreen>
  );
}
