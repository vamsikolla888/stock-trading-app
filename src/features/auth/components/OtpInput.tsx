import React, { forwardRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

interface OtpInputProps {
  value: string;
  onChangeText: (value: string) => void;
  length?: number;
  error?: boolean;
  editable?: boolean;
  autoFocus?: boolean;
  /** Fires once the last digit is in — callers use it to submit without a button press. */
  onComplete?: (value: string) => void;
  accessibilityLabel?: string;
}

/**
 * A six-box code field. One real TextInput sits invisibly over the boxes, so the system
 * keyboard, paste, and iOS's one-time-code autofill (which password managers use for TOTP)
 * all work exactly as on a plain field — the boxes are only a rendering of its value.
 */
export const OtpInput = forwardRef<TextInput, OtpInputProps>(function OtpInput(
  {
    value,
    onChangeText,
    length = 6,
    error = false,
    editable = true,
    autoFocus = false,
    onComplete,
    accessibilityLabel = 'Authentication code',
  },
  ref,
) {
  const { colors, isDark } = useTheme();
  const [focused, setFocused] = useState(false);
  const digits = value.split('');
  const activeIndex = Math.min(value.length, length - 1);

  const handleChange = (text: string) => {
    const next = text.replace(/\D/g, '').slice(0, length);
    onChangeText(next);
    if (next.length === length && value.length !== length) onComplete?.(next);
  };

  return (
    <View className="relative">
      <View className="flex-row justify-between gap-2" pointerEvents="none">
        {Array.from({ length }, (_, index) => {
          const filled = index < digits.length;
          const active = focused && index === activeIndex && value.length < length;
          const borderColor = error
            ? colors.danger
            : active
              ? colors.accent
              : filled
                ? colors.borderStrong
                : colors.border;
          return (
            <View
              key={index}
              className={cn(
                'h-14 flex-1 items-center justify-center rounded-field bg-canvas dark:bg-canvas-dark',
                !editable && 'opacity-60',
              )}
              style={{ borderColor, borderWidth: active || error ? 1.5 : 1, maxWidth: 56 }}
            >
              <Text
                className="text-[22px] font-bold text-ink dark:text-ink-dark"
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {digits[index] ?? ''}
              </Text>
              {active ? (
                <View
                  className="absolute bottom-3 h-0.5 w-4 rounded-full"
                  style={{ backgroundColor: colors.accent }}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      <TextInput
        ref={ref}
        value={value}
        onChangeText={handleChange}
        editable={editable}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType="number-pad"
        inputMode="numeric"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={length}
        caretHidden
        selectionColor="transparent"
        keyboardAppearance={isDark ? 'dark' : 'light'}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={`${length} digits`}
        // Invisible but hit-testable and focusable — opacity 0 can drop focus on Android.
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity: 0.02,
          color: 'transparent',
        }}
      />
    </View>
  );
});
