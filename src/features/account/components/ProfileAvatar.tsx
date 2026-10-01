import React, { memo, useState } from 'react';
import { Image, Text, View } from 'react-native';

import { env } from '@/config/env';
import { cn } from '@/lib/utils/cn';

import { profileInitials } from '../lib/account';

const SIZES = {
  sm: { box: 36, text: 'text-xs' },
  md: { box: 48, text: 'text-base' },
  lg: { box: 88, text: 'text-[28px]' },
} as const;

interface ProfileAvatarProps {
  name: string;
  /** Server-relative photo path; null/undefined shows initials. */
  avatarUrl?: string | null;
  size?: keyof typeof SIZES;
  className?: string;
}

/**
 * The account's photo, or its initials on the brand wash. A photo that fails to load falls back
 * to the initials rather than leaving an empty circle.
 */
export const ProfileAvatar = memo(function ProfileAvatar({
  name,
  avatarUrl,
  size = 'md',
  className,
}: ProfileAvatarProps) {
  const { box, text } = SIZES[size];
  const src = avatarUrl ? `${env.serverOrigin}${avatarUrl}` : null;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showPhoto = src != null && failedSrc !== src;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className={cn(
        'items-center justify-center overflow-hidden rounded-full bg-brand-wash dark:bg-brand-wash-dark',
        className,
      )}
      style={{ width: box, height: box }}
    >
      {showPhoto ? (
        <Image
          // The file name is a fresh UUID per upload, so a cached copy can never be stale.
          source={{ uri: src, cache: 'force-cache' }}
          style={{ width: box, height: box }}
          resizeMode="cover"
          onError={() => setFailedSrc(src)}
        />
      ) : (
        <Text className={cn('font-bold text-brand-text dark:text-brand-text-dark', text)}>
          {profileInitials(name)}
        </Text>
      )}
    </View>
  );
});
