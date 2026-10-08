import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { ProfileAvatar } from '@/features/account/components/ProfileAvatar';
import { useAccountProfile } from '@/features/account/hooks';
import { profileName } from '@/features/account/lib/account';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';
import type { AuthUser } from '@/types/auth';

/**
 * Groww-style account header: photo (or initials), name, email and role. Opens Profile &
 * security. Paints from the stored user at once, then fills in the name and photo. `bare` drops
 * the card around it, for the top of a panel that already draws one.
 */
export function ProfileCard({
  user,
  onPress,
  bare = false,
}: {
  user: AuthUser | null;
  onPress: () => void;
  bare?: boolean;
}) {
  const { colors } = useTheme();
  const profile = useAccountProfile();
  const name = profileName(profile.data, user?.email);
  const email = profile.data?.email ?? user?.email;
  const isAdmin = (profile.data?.role ?? user?.role) === 'admin';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${email ?? 'signed in'}, ${isAdmin ? 'administrator' : 'member'}`}
      accessibilityHint="Opens profile and security"
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
        bare
          ? 'px-4 py-3.5'
          : 'rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark',
      )}
    >
      <ProfileAvatar name={name} avatarUrl={profile.data?.avatarUrl} size="md" />
      <View className="flex-1 gap-0.5">
        <Text
          className="text-[17px] font-bold text-ink dark:text-ink-dark"
          style={{ letterSpacing: -0.3 }}
          numberOfLines={1}
        >
          {name}
        </Text>
        {email ? (
          <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {email}
          </Text>
        ) : null}
        <View className="mt-1.5 flex-row items-center gap-2">
          <Badge
            label={isAdmin ? 'Administrator' : 'Member'}
            variant={isAdmin ? 'primary' : 'neutral'}
          />
          <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
            Profile & security
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}
