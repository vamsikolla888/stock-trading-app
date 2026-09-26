import Check from 'lucide-react-native/icons/check';
import React from 'react';
import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';
import { Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { passwordRequirement } from '@/lib/validators/auth';
import { useTheme } from '@/theme/ThemeProvider';

interface PasswordHintProps<T extends FieldValues> {
  control: Control<T>;
  name: Path<T>;
}

/**
 * Live requirement indicator under a new-password field; turns green once satisfied.
 * Subscribes to the one field itself (useWatch), so typing re-renders only this hint
 * rather than the whole form.
 */
export function PasswordHint<T extends FieldValues>({ control, name }: PasswordHintProps<T>) {
  const { colors } = useTheme();
  const value = (useWatch({ control, name }) as string | undefined) ?? '';
  const met = passwordRequirement.test(value);

  return (
    <View
      className="flex-row items-center gap-1.5"
      accessible
      accessibilityLabel={`${passwordRequirement.label}: ${met ? 'met' : 'not met yet'}`}
    >
      <View
        className={cn(
          'h-4 w-4 items-center justify-center rounded-full',
          met
            ? 'bg-brand-strong dark:bg-brand-strong-dark'
            : 'border border-line-strong dark:border-line-dark-strong',
        )}
      >
        {met ? <Check size={11} strokeWidth={3} color={colors.primaryText} /> : null}
      </View>
      <Text
        className={cn(
          'text-[13px]',
          met
            ? 'text-brand-text dark:text-brand-text-dark'
            : 'text-ink-faint dark:text-ink-dark-faint',
        )}
      >
        {passwordRequirement.label}
      </Text>
    </View>
  );
}
