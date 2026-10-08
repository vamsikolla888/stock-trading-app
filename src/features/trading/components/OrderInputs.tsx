import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

/** `lg` is the order ticket's: the quantity and price are what the screen is for. */
type InputSize = 'md' | 'lg';

const BOX: Record<InputSize, string> = { md: 'h-12', lg: 'h-14' };

interface QuantityStepperProps {
  value: string;
  onChange: (value: string) => void;
  max: number;
  size?: InputSize;
}

/** Whole-share quantity with −/+ — non-digits are stripped as you type. */
export function QuantityStepper({ value, onChange, max, size = 'md' }: QuantityStepperProps) {
  const { colors } = useTheme();
  const current = Number.parseInt(value, 10) || 0;
  const set = (next: number) => onChange(String(Math.min(max, Math.max(1, next))));
  const button = size === 'lg' ? 'w-14' : 'w-12';

  return (
    <View
      className={cn(
        'flex-row items-center rounded-field border border-line-strong dark:border-line-dark-strong',
        BOX[size],
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={current <= 1}
        onPress={() => set(current - 1)}
        className={cn(
          'h-full items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark',
          button,
        )}
      >
        <Minus size={18} color={colors.text} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 7))}
        keyboardType="number-pad"
        accessibilityLabel="Quantity"
        selectTextOnFocus
        className={cn(
          'h-full flex-1 text-center font-semibold text-ink dark:text-ink-dark',
          size === 'lg' ? 'text-xl font-bold' : 'text-base',
        )}
        style={{ fontVariant: ['tabular-nums'] }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={current >= max}
        onPress={() => set(current + 1)}
        className={cn(
          'h-full items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark',
          button,
        )}
      >
        <Plus size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

interface PriceInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  /** A short muted line under the field (what the level does), replaced by an error. */
  hint?: string | null;
  size?: InputSize;
}

export function PriceInput({
  label,
  value,
  onChange,
  placeholder,
  error,
  hint,
  size = 'md',
}: PriceInputProps) {
  const { colors } = useTheme();
  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <View
        className={cn('flex-row items-center rounded-field border px-3', BOX[size])}
        style={{ borderColor: error ? colors.danger : colors.borderStrong }}
      >
        <Text
          className={cn(
            'text-ink-muted dark:text-ink-dark-muted',
            size === 'lg' ? 'text-lg' : 'text-[15px]',
          )}
        >
          ₹
        </Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint ?? undefined}
          className={cn(
            'h-full flex-1 pl-1 font-semibold text-ink dark:text-ink-dark',
            size === 'lg' ? 'text-lg font-bold' : 'text-base',
          )}
          style={{ fontVariant: ['tabular-nums'] }}
        />
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger-600 dark:text-danger-dark">{error}</Text>
      ) : hint ? (
        <Text className="mt-1 text-xs leading-4 text-ink-faint dark:text-ink-dark-faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function SummaryRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <View className="flex-row justify-between gap-3 py-1.5">
      <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
      <Text
        className={
          strong
            ? 'text-right text-sm font-bold text-ink dark:text-ink-dark'
            : 'text-right text-[13px] font-semibold text-ink dark:text-ink-dark'
        }
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {value}
      </Text>
    </View>
  );
}
