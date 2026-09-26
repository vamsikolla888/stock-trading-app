import RotateCw from 'lucide-react-native/icons/rotate-cw';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

interface InlineErrorProps {
  error: unknown;
  onRetry?: () => void;
  /** What failed, e.g. "indices" → "Couldn't load indices". */
  what?: string;
  className?: string;
}

/**
 * Section-level failure state. One failing section (say, indices) must not blank the
 * whole screen, so each section renders its own compact error with a retry.
 */
export function InlineError({ error, onRetry, what, className }: InlineErrorProps) {
  const { colors } = useTheme();

  return (
    <View
      accessibilityRole="alert"
      className={cn(
        'items-center gap-2 rounded-card border border-line bg-surface px-4 py-5 dark:border-line-dark dark:bg-surface-dark',
        className,
      )}
    >
      <Text className="text-center text-sm font-semibold text-ink dark:text-ink-dark">
        {what ? `Couldn't load ${what}` : "Couldn't load this"}
      </Text>
      <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
        {getErrorMessage(error)}
      </Text>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          hitSlop={8}
          className="mt-1 flex-row items-center gap-1.5 active:opacity-60"
        >
          <RotateCw size={14} color={colors.link} />
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Try again
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Compact empty state inside a section card. */
export function InlineEmpty({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View className="items-center gap-1.5 rounded-card border border-dashed border-line-strong px-4 py-6 dark:border-line-dark-strong">
      <Text className="text-center text-sm font-semibold text-ink dark:text-ink-dark">{title}</Text>
      {message ? (
        <Text className="text-center text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {message}
        </Text>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          hitSlop={8}
          className="mt-1 active:opacity-60"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            {action.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
