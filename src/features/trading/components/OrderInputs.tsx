import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import React from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

interface QuantityStepperProps {
  value: string;
  onChange: (value: string) => void;
  max: number;
}

/** Whole-share quantity with −/+ — non-digits are stripped as you type. */
export function QuantityStepper({ value, onChange, max }: QuantityStepperProps) {
  const { colors } = useTheme();
  const current = Number.parseInt(value, 10) || 0;
  const set = (next: number) => onChange(String(Math.min(max, Math.max(1, next))));

  return (
    <View className="h-12 flex-row items-center rounded-field border border-line-strong dark:border-line-dark-strong">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease quantity"
        disabled={current <= 1}
        onPress={() => set(current - 1)}
        className="h-full w-12 items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark"
      >
        <Minus size={18} color={colors.text} />
      </Pressable>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 7))}
        keyboardType="number-pad"
        accessibilityLabel="Quantity"
        selectTextOnFocus
        className="h-full flex-1 text-center text-base font-semibold text-ink dark:text-ink-dark"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase quantity"
        disabled={current >= max}
        onPress={() => set(current + 1)}
        className="h-full w-12 items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark"
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
}

export function PriceInput({ label, value, onChange, placeholder, error }: PriceInputProps) {
  const { colors } = useTheme();
  return (
    <View className="flex-1">
      <FieldLabel>{label}</FieldLabel>
      <View
        className="h-12 flex-row items-center rounded-field border px-3"
        style={{ borderColor: error ? colors.danger : colors.borderStrong }}
      >
        <Text className="text-[15px] text-ink-muted dark:text-ink-dark-muted">₹</Text>
        <TextInput
          value={value}
          onChangeText={(text) => onChange(text.replace(/[^\d.]/g, '').replace(/(\..*)\./g, '$1'))}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          accessibilityLabel={label}
          accessibilityHint={error ?? undefined}
          className="h-full flex-1 pl-1 text-base font-semibold text-ink dark:text-ink-dark"
        />
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger-600 dark:text-danger-dark">{error}</Text>
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
      >
        {value}
      </Text>
    </View>
  );
}
