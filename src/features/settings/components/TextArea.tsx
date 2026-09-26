import React, { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface TextAreaProps extends Omit<TextInputProps, 'multiline' | 'style'> {
  label: string;
  helperText?: string;
  minHeight?: number;
}

/** Multi-line field styled like Input (which is single-line by design). */
export function TextArea({ label, helperText, minHeight = 96, ...rest }: TextAreaProps) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View className="w-full gap-1.5">
      <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
        {label}
      </Text>
      <TextInput
        multiline
        textAlignVertical="top"
        accessibilityLabel={label}
        placeholderTextColor={colors.textFaint}
        keyboardAppearance={isDark ? 'dark' : 'light'}
        selectionColor={colors.accent}
        cursorColor={colors.accent}
        className="rounded-field bg-canvas px-3.5 py-3 text-[15px] leading-[21px] text-ink dark:bg-canvas-dark dark:text-ink-dark"
        style={{
          minHeight,
          borderWidth: focused ? 1.5 : 1,
          borderColor: focused ? colors.accent : colors.borderStrong,
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {helperText ? (
        <Text className="text-[13px] text-ink-faint dark:text-ink-dark-faint">{helperText}</Text>
      ) : null}
    </View>
  );
}
