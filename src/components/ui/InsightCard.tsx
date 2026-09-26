import Sparkles from 'lucide-react-native/icons/sparkles';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface InsightCardProps {
  kicker: string;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  /** Small print under the body (disclaimers, "as of" time). */
  footnote?: string;
  className?: string;
}

/** The design's green-tinted AI insight card. */
export function InsightCard({
  kicker,
  title,
  body,
  action,
  footnote,
  className,
}: InsightCardProps) {
  const { colors } = useTheme();

  return (
    <View
      className={cn(
        'rounded-card border border-primary-200 bg-primary-50 p-4 dark:border-line-dark dark:bg-brand-wash-dark',
        className,
      )}
    >
      <View className="flex-row items-center gap-1.5">
        <Sparkles size={14} color={colors.link} />
        <Text className="text-[11px] font-bold uppercase tracking-wider text-brand-text dark:text-brand-text-dark">
          {kicker}
        </Text>
      </View>
      <Text className="mt-2 text-[15px] font-semibold leading-[21px] text-ink dark:text-ink-dark">
        {title}
      </Text>
      {body ? (
        <Text className="mt-1.5 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {body}
        </Text>
      ) : null}
      {footnote ? (
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">{footnote}</Text>
      ) : null}
      {action ? (
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={action.onPress}
          className="mt-2 self-start active:opacity-60"
        >
          <Text className="text-[13px] font-bold text-brand-text dark:text-brand-text-dark">
            {action.label} →
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
