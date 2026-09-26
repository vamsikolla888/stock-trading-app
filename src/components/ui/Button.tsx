import * as Haptics from 'expo-haptics';
import { useColorScheme } from 'nativewind';
import React from 'react';
import { ActivityIndicator, Pressable, Text, type PressableProps } from 'react-native';
import { tv, type VariantProps } from 'tailwind-variants';

import { darkColors, lightColors } from '@/theme/tokens';

const buttonStyle = tv({
  base: 'flex-row items-center justify-center gap-2 rounded-field',
  variants: {
    variant: {
      primary: 'bg-brand-strong active:opacity-90 dark:bg-brand-strong-dark',
      secondary: 'bg-brand-wash active:opacity-80 dark:bg-brand-wash-dark',
      outline:
        'border border-line-strong bg-canvas active:bg-surface-sunk dark:border-line-dark-strong dark:bg-canvas-dark dark:active:bg-surface-sunk-dark',
      ghost: 'bg-transparent active:bg-surface-sunk dark:active:bg-surface-sunk-dark',
      danger: 'bg-danger-600 active:opacity-90',
      link: 'bg-transparent active:opacity-60',
    },
    size: {
      sm: 'h-9 px-3',
      md: 'h-12 px-4',
      lg: 'h-[52px] px-5',
    },
    fullWidth: {
      true: 'w-full',
    },
    disabled: {
      true: 'opacity-50',
    },
  },
  compoundVariants: [{ variant: 'link', class: 'h-auto px-0 py-1' }],
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

const buttonTextStyle = tv({
  base: 'font-semibold',
  variants: {
    variant: {
      primary: 'text-white',
      secondary: 'text-brand-text dark:text-brand-text-dark',
      outline: 'text-ink dark:text-ink-dark',
      ghost: 'text-ink dark:text-ink-dark',
      danger: 'text-white',
      link: 'text-brand-text dark:text-brand-text-dark',
    },
    size: {
      sm: 'text-sm',
      md: 'text-[15px]',
      lg: 'text-base',
    },
  },
  defaultVariants: {
    variant: 'primary',
    size: 'md',
  },
});

export type ButtonVariant = NonNullable<VariantProps<typeof buttonStyle>['variant']>;
export type ButtonSize = NonNullable<VariantProps<typeof buttonStyle>['size']>;

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  hapticFeedback?: boolean;
  className?: string;
}

export function Button({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  fullWidth = false,
  leftIcon,
  rightIcon,
  hapticFeedback = true,
  className,
  onPress,
  accessibilityLabel,
  ...rest
}: ButtonProps) {
  // NativeWind's hook, not useTheme(): Button also renders in ErrorBoundary's fallback,
  // which sits above ThemeProvider and must never itself throw.
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? darkColors : lightColors;
  const isDisabled = disabled || loading;
  const onFill = variant === 'primary' || variant === 'danger';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      hitSlop={variant === 'link' ? 8 : undefined}
      onPress={(event) => {
        if (hapticFeedback) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(event);
      }}
      className={buttonStyle({ variant, size, fullWidth, disabled: isDisabled, className })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={onFill ? colors.primaryText : colors.link} />
      ) : (
        <>
          {leftIcon}
          <Text className={buttonTextStyle({ variant, size })}>{label}</Text>
          {rightIcon}
        </>
      )}
    </Pressable>
  );
}
