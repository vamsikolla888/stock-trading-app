import React from 'react';
import { Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { displayNameFromEmail, initialsFromEmail } from '@/lib/utils/user';
import type { AuthUser } from '@/types/auth';

/** Groww-style account header: initials avatar, name, email and role. */
export function ProfileCard({ user }: { user: AuthUser | null }) {
  const name = displayNameFromEmail(user?.email) || 'Your account';
  const isAdmin = user?.role === 'admin';

  return (
    <View
      accessible
      accessibilityLabel={`${name}, ${user?.email ?? 'signed in'}, ${isAdmin ? 'administrator' : 'investor account'}`}
      className="flex-row items-center gap-3.5 rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark"
    >
      <View className="h-14 w-14 items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark">
        <Text className="text-lg font-bold text-brand-text dark:text-brand-text-dark">
          {initialsFromEmail(user?.email)}
        </Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.3 }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {user?.email ? (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {user.email}
          </Text>
        ) : null}
        <View className="mt-1.5 self-start">
          <Badge
            label={isAdmin ? 'Administrator' : 'Investor account'}
            variant={isAdmin ? 'primary' : 'neutral'}
          />
        </View>
      </View>
    </View>
  );
}
