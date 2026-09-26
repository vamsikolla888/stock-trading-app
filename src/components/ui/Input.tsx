import Eye from 'lucide-react-native/icons/eye';
import EyeOff from 'lucide-react-native/icons/eye-off';
import React, { forwardRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /** Renders a show/hide control and starts the value hidden. */
  secureToggle?: boolean;
  containerClassName?: string;
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      secureToggle = false,
      secureTextEntry,
      containerClassName,
      className,
      editable = true,
      onFocus,
      onBlur,
      accessibilityLabel,
      ...rest
    },
    ref,
  ) => {
    const { colors, isDark } = useTheme();
    const [isFocused, setIsFocused] = useState(false);
    const [isHidden, setIsHidden] = useState(true);

    const borderColor = error ? colors.danger : isFocused ? colors.accent : colors.borderStrong;
    const ToggleIcon = isHidden ? Eye : EyeOff;

    return (
      <View className={cn('w-full gap-1.5', containerClassName)}>
        {label ? (
          <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
            {label}
          </Text>
        ) : null}
        <View
          className={cn(
            'h-12 flex-row items-center gap-2 rounded-field border bg-canvas px-3.5 dark:bg-canvas-dark',
            !editable && 'bg-surface-sunk dark:bg-surface-sunk-dark',
          )}
          style={{ borderColor, borderWidth: isFocused || error ? 1.5 : 1 }}
        >
          {leftIcon}
          <TextInput
            ref={ref}
            editable={editable}
            accessibilityLabel={accessibilityLabel ?? label}
            accessibilityHint={error}
            className={cn('h-full flex-1 text-base text-ink dark:text-ink-dark', className)}
            placeholderTextColor={colors.textFaint}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            selectionColor={colors.accent}
            cursorColor={colors.accent}
            secureTextEntry={secureToggle ? isHidden : secureTextEntry}
            onFocus={(event) => {
              setIsFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setIsFocused(false);
              onBlur?.(event);
            }}
            {...rest}
          />
          {secureToggle ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={isHidden ? 'Show password' : 'Hide password'}
              hitSlop={12}
              onPress={() => setIsHidden((hidden) => !hidden)}
            >
              <ToggleIcon size={20} color={colors.textMuted} />
            </Pressable>
          ) : (
            rightIcon
          )}
        </View>
        {error ? (
          <Text
            accessibilityLiveRegion="polite"
            className="text-[13px] text-danger-600 dark:text-danger-dark"
          >
            {error}
          </Text>
        ) : helperText ? (
          <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">{helperText}</Text>
        ) : null}
      </View>
    );
  },
);

Input.displayName = 'Input';
