import { useRouter, useSegments } from 'expo-router';
import Bell from 'lucide-react-native/icons/bell';
import Search from 'lucide-react-native/icons/search';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Logo } from '@/components/brand/Logo';
import { ProfileAvatar } from '@/features/account/components/ProfileAvatar';
import { useAccountProfile } from '@/features/account/hooks';
import { profileName } from '@/features/account/lib/account';
import { useNotifications } from '@/features/alerts/hooks';
import { getHeaderTitle } from '@/lib/navigation/headerTitle';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Top bar shared by the signed-in tabs: brand · search · notifications · account. */
export function AppHeader({ group }: { group?: string }) {
  const router = useRouter();
  const segments = useSegments();
  const { colors } = useTheme();
  const email = useAuthStore((state) => state.user?.email);
  const profile = useAccountProfile();
  const { unreadCount } = useNotifications();
  const hasUnread = unreadCount > 0;
  const title = getHeaderTitle(group, segments);

  return (
    <View className="flex-row items-center gap-1 border-b border-line bg-canvas px-4 pt-2.5 pb-1 dark:border-line-dark dark:bg-canvas-dark">
      <View className="flex-1 flex-row items-center gap-2 ml-1.5">
        <Logo size="sm" showText={false} />
        <Text className="text-[17px] font-bold tracking-tight text-ink dark:text-ink-dark">
          {title}
        </Text>
      </View>
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
          <View
            className="absolute right-1.5 top-1.5 min-w-[16px] items-center justify-center rounded-full border-2 border-canvas bg-danger-500 px-[3px] dark:border-canvas-dark"
            style={{ height: 16 }}
          >
            <Text
              style={{
                color: '#ffffff',
                fontSize: 9,
                fontWeight: '700',
                lineHeight: 12,
              }}
            >
              {unreadCount > 9 ? '9+' : String(unreadCount)}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Profile and security"
        hitSlop={4}
        onPress={() => router.push('/profile')}
        className="ml-1 rounded-full active:opacity-80"
      >
        <ProfileAvatar
          name={profileName(profile.data, email)}
          avatarUrl={profile.data?.avatarUrl}
          size="sm"
        />
      </Pressable>
    </View>
  );
}
