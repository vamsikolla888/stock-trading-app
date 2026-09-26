import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import Info from 'lucide-react-native/icons/info';
import TriangleAlert from 'lucide-react-native/icons/triangle-alert';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

export type BannerTone = 'error' | 'warning' | 'info' | 'success';

const toneClasses: Record<BannerTone, { box: string; text: string }> = {
  error: {
    box: 'bg-danger-wash dark:bg-danger-wash-dark',
    text: 'text-danger-600 dark:text-danger-dark',
  },
  warning: {
    box: 'bg-warning-wash dark:bg-warning-wash-dark',
    text: 'text-warning-600 dark:text-warning-dark',
  },
  info: { box: 'bg-info-wash dark:bg-info-wash-dark', text: 'text-info dark:text-info-dark' },
  success: {
    box: 'bg-brand-wash dark:bg-brand-wash-dark',
    text: 'text-brand-text dark:text-brand-text-dark',
  },
};

const toneIcons = { error: CircleAlert, warning: TriangleAlert, info: Info, success: CircleCheck };

interface BannerProps {
  tone?: BannerTone;
  title?: string;
  message: string;
  action?: { label: string; onPress: () => void };
  className?: string;
}

/** Inline, non-dismissable status message — for server outcomes that belong next to the form, not in a toast. */
export function Banner({ tone = 'error', title, message, action, className }: BannerProps) {
  const { colors } = useTheme();
  const Icon = toneIcons[tone];
  const iconColor = {
    error: colors.danger,
    warning: colors.warning,
    info: colors.info,
    success: colors.success,
  }[tone];
  const { box, text } = toneClasses[tone];

  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      className={cn('flex-row gap-2.5 rounded-field p-3', box, className)}
    >
      <Icon size={18} color={iconColor} style={{ marginTop: 1 }} />
      <View className="flex-1 gap-0.5">
        {title ? <Text className={cn('text-sm font-semibold', text)}>{title}</Text> : null}
        <Text className="text-[13px] leading-[19px] text-ink dark:text-ink-dark">{message}</Text>
        {action ? (
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={action.onPress}
            className="mt-1 self-start active:opacity-60"
          >
            <Text className={cn('text-[13px] font-semibold', text)}>{action.label}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
