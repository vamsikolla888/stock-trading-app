import React from 'react';
import { Image, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

interface AvatarProps {
  uri?: string;
  name: string;
  size?: AvatarSize;
  className?: string;
}

const sizeMap: Record<AvatarSize, { box: string; text: string; px: number }> = {
  sm: { box: 'h-8 w-8', text: 'text-xs', px: 32 },
  md: { box: 'h-12 w-12', text: 'text-base', px: 48 },
  lg: { box: 'h-16 w-16', text: 'text-xl', px: 64 },
  xl: { box: 'h-24 w-24', text: 'text-3xl', px: 96 },
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '');
  return initials.join('') || '?';
}

export function Avatar({ uri, name, size = 'md', className }: AvatarProps) {
  const { box, text, px } = sizeMap[size];

  if (uri) {
    return (
      <Image
        source={{ uri }}
        accessibilityLabel={name}
        style={{ width: px, height: px, borderRadius: px / 2 }}
        className={className}
      />
    );
  }

  return (
    <View
      className={cn(
        'items-center justify-center rounded-full bg-brand-wash dark:bg-brand-wash-dark',
        box,
        className,
      )}
    >
      <Text className={cn('font-bold text-brand-text dark:text-brand-text-dark', text)}>
        {getInitials(name)}
      </Text>
    </View>
  );
}
