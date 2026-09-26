import { useRouter } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Search from 'lucide-react-native/icons/search';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { useNotifications } from '@/features/alerts/hooks';
import { initialsFromEmail } from '@/lib/utils/user';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Top bar shared by the signed-in tabs: brand · search · notifications · account. */
export function AppHeader() {
  const router = useRouter();
  const { colors } = useTheme();
  const email = useAuthStore((state) => state.user?.email);
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;

  return (
    <View className="flex-row items-center gap-1 border-b border-line bg-canvas px-4 pb-2.5 pt-1.5 dark:border-line-dark dark:bg-canvas-dark">
      <Logo size="sm" className="flex-1" />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Search"
        hitSlop={4}
        onPress={() => router.push('/search')}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <Search size={21} color={colors.text} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={hasUnread ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        hitSlop={4}
        onPress={() => router.push('/notifications')}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <Bell size={21} color={colors.text} />
        {hasUnread ? (
          <View className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full border-2 border-canvas bg-danger-500 dark:border-canvas-dark" />
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Account"
        onPress={() => router.navigate('/settings')}
        className="ml-1 h-9 w-9 items-center justify-center rounded-full bg-brand-wash active:opacity-80 dark:bg-brand-wash-dark"
      >
        <Text className="text-xs font-bold text-brand-text dark:text-brand-text-dark">
          {initialsFromEmail(email)}
        </Text>
      </Pressable>
    </View>
  );
}
