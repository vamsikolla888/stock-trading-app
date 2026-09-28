import React from 'react';
import { Text, View } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

const badgeStyle = tv({
  slots: {
    container: 'items-center justify-center self-center rounded-full px-2.5 py-1',
    text: 'text-xs font-semibold leading-4',
  },
  variants: {
    variant: {
      neutral: {
        container: 'bg-surface-sunk dark:bg-surface-sunk-dark',
        text: 'text-ink-muted dark:text-ink-dark-muted',
      },
      success: {
        container: 'bg-success-wash dark:bg-success-wash-dark',
        text: 'text-brand-text dark:text-brand-text-dark',
      },
      danger: {
        container: 'bg-danger-wash dark:bg-danger-wash-dark',
        text: 'text-danger-600 dark:text-danger-dark',
      },
      warning: {
        container: 'bg-warning-wash dark:bg-warning-wash-dark',
        text: 'text-warning-600 dark:text-warning-dark',
      },
      primary: {
        container: 'bg-brand-wash dark:bg-brand-wash-dark',
        text: 'text-brand-text dark:text-brand-text-dark',
      },
    },
  },
  defaultVariants: {
    variant: 'neutral',
  },
});

type BadgeVariant = NonNullable<VariantProps<typeof badgeStyle>['variant']>;

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
}

export function Badge({ label, variant = 'neutral' }: BadgeProps) {
  const { container, text } = badgeStyle({ variant });
  return (
    <View className={container()}>
      <Text className={text()}>{label}</Text>
    </View>
  );
}
