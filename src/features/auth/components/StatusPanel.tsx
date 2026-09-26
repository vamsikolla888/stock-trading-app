import React from 'react';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';

interface StatusPanelProps {
  icon: React.ReactNode;
  title: string;
  message: React.ReactNode;
  tone?: 'brand' | 'warning';
  children?: React.ReactNode;
}

/** Centered outcome state (request sent, link expired…) from the design's success-state pattern. */
export function StatusPanel({ icon, title, message, tone = 'brand', children }: StatusPanelProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-2 py-10">
      <View
        className={cn(
          'h-[72px] w-[72px] items-center justify-center rounded-full',
          tone === 'brand'
            ? 'bg-brand-wash dark:bg-brand-wash-dark'
            : 'bg-warning-wash dark:bg-warning-wash-dark',
        )}
      >
        {icon}
      </View>
      <Text
        accessibilityRole="header"
        className="text-center text-[22px] font-bold text-ink dark:text-ink-dark"
        style={{ letterSpacing: -0.5 }}
      >
        {title}
      </Text>
      <Text className="max-w-[320px] text-center text-[15px] leading-[22px] text-ink-muted dark:text-ink-dark-muted">
        {message}
      </Text>
      {children}
    </View>
  );
}
