import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronUp from 'lucide-react-native/icons/chevron-up';
import Minus from 'lucide-react-native/icons/minus';
import Plus from 'lucide-react-native/icons/plus';
import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import type { FnoSide } from '../types';

const NUM = { fontVariant: ['tabular-nums' as const] };

/** A tappable heading that shows or hides what is under it (caveats, contract details). */
export function Disclosure({
  title,
  meta,
  children,
  initiallyOpen = false,
  onToggle,
  className,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  initiallyOpen?: boolean;
  onToggle?: (open: boolean) => void;
  className?: string;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(initiallyOpen);
  const Icon = open ? ChevronUp : ChevronDown;
  return (
    <View className={className}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={meta ? `${title}, ${meta}` : title}
        onPress={() => {
          setOpen((value) => !value);
          onToggle?.(!open);
        }}
        hitSlop={6}
        className="min-h-[40px] flex-row items-center gap-2 active:opacity-70"
      >
        <View className="flex-1">
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{title}</Text>
          {meta ? (
            <Text className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {meta}
            </Text>
          ) : null}
        </View>
        <Icon size={18} color={colors.textMuted} />
      </Pressable>
      {open ? <View className="pt-1">{children}</View> : null}
    </View>
  );
}

/** Muted footnotes — the server's caveats, rendered verbatim, never summarised. */
export function Caveats({ items, className }: { items: readonly string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <View className={cn('gap-1.5', className)}>
      {items.map((item) => (
        <View key={item} className="flex-row gap-2">
          <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">•</Text>
          <Text className="flex-1 text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** One muted line of explanation under a control or a list. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={cn('text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted', className)}
    >
      {children}
    </Text>
  );
}

/** Buy / Sell tag at the start of an order row. */
export function SideTag({ side }: { side: FnoSide | null }) {
  if (!side) return null;
  const buy = side === 'BUY';
  return (
    <View
      className={
        buy
          ? 'rounded-md bg-brand-wash px-1.5 py-0.5 dark:bg-brand-wash-dark'
          : 'rounded-md bg-danger-wash px-1.5 py-0.5 dark:bg-danger-wash-dark'
      }
    >
      <Text
        className={
          buy
            ? 'text-[10px] font-bold text-brand-text dark:text-brand-text-dark'
            : 'text-[10px] font-bold text-danger-600 dark:text-danger-dark'
        }
      >
        {side}
      </Text>
    </View>
  );
}

/** A small neutral tag (MIS / NRML / CE / Index). */
export function Tag({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'warning' | 'info';
}) {
  const box =
    tone === 'warning'
      ? 'bg-warning-wash dark:bg-warning-wash-dark'
      : tone === 'info'
        ? 'bg-info-wash dark:bg-info-wash-dark'
        : 'bg-surface-sunk dark:bg-surface-sunk-dark';
  const text =
    tone === 'warning'
      ? 'text-warning-600 dark:text-warning-dark'
      : tone === 'info'
        ? 'text-info dark:text-info-dark'
        : 'text-ink-muted dark:text-ink-dark-muted';
  return (
    <View className={cn('rounded-md px-1.5 py-0.5', box)}>
      <Text className={cn('text-[10px] font-bold', text)}>{label}</Text>
    </View>
  );
}

/** Buy / Sell selector — green and red fills so the side reads without the label. */
export function SideToggle({
  value,
  onChange,
  disabled,
  buyDisabled,
  sellDisabled,
}: {
  value: FnoSide;
  onChange: (side: FnoSide) => void;
  disabled?: boolean;
  buyDisabled?: boolean;
  sellDisabled?: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      className="flex-row gap-1 rounded-[11px] bg-surface-sunk p-1 dark:bg-surface-sunk-dark"
    >
      {(['BUY', 'SELL'] as const).map((side) => {
        const selected = side === value;
        const off = disabled || (side === 'BUY' ? buyDisabled : sellDisabled);
        return (
          <Pressable
            key={side}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled: off }}
            disabled={off}
            onPress={() => onChange(side)}
            className={cn(
              'h-10 flex-1 items-center justify-center rounded-lg',
              selected &&
                (side === 'BUY' ? 'bg-brand-strong dark:bg-brand-strong-dark' : 'bg-danger-600'),
              off && 'opacity-40',
            )}
          >
            <Text
              className={cn(
                'text-sm font-bold',
                selected ? 'text-white' : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {side === 'BUY' ? 'Buy' : 'Sell'}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Whole lots with −/+; non-digits are stripped as you type. `0` means "empty". */
export function LotsStepper({
  value,
  onChange,
  max,
  disabled,
  label = 'Lots',
}: {
  value: number;
  onChange: (lots: number) => void;
  max?: number | null;
  disabled?: boolean;
  label?: string;
}) {
  const { colors } = useTheme();
  const upper = max != null && max > 0 ? max : 10_000;
  const current = Number.isInteger(value) && value > 0 ? value : 0;
  return (
    <View className="h-12 flex-row items-center rounded-field border border-line-strong dark:border-line-dark-strong">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="One lot fewer"
        disabled={disabled || current <= 1}
        onPress={() => onChange(Math.max(1, current - 1))}
        className="h-full w-12 items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark"
      >
        <Minus size={18} color={colors.text} />
      </Pressable>
      <TextInput
        value={current > 0 ? String(current) : ''}
        onChangeText={(text) => {
          const digits = text.replace(/\D/g, '').slice(0, 5);
          onChange(digits ? Number(digits) : 0);
        }}
        editable={!disabled}
        keyboardType="number-pad"
        accessibilityLabel={label}
        selectTextOnFocus
        placeholder="0"
        placeholderTextColor={colors.textFaint}
        className="h-full flex-1 text-center text-base font-semibold text-ink dark:text-ink-dark"
        style={NUM}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="One lot more"
        disabled={disabled || current >= upper}
        onPress={() => onChange(Math.min(upper, current + 1))}
        className="h-full w-12 items-center justify-center active:bg-surface-sunk disabled:opacity-40 dark:active:bg-surface-sunk-dark"
      >
        <Plus size={18} color={colors.text} />
      </Pressable>
    </View>
  );
}

/** A rupee price field; keeps digits and one decimal point. */
export function PriceField({
  label,
  value,
  onChange,
  placeholder,
  error,
  action,
}: {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder?: string;
  error?: string | null;
  /** A small action beside the label ("Use LTP"). */
  action?: { label: string; onPress: () => void };
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-1">
      <View className="mb-1.5 flex-row items-center justify-between">
        <Text className="text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
          {label}
        </Text>
        {action ? (
          <Pressable accessibilityRole="button" hitSlop={8} onPress={action.onPress}>
            <Text className="text-xs font-semibold text-brand-text dark:text-brand-text-dark">
              {action.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
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
          style={NUM}
        />
      </View>
      {error ? (
        <Text className="mt-1 text-xs text-danger-600 dark:text-danger-dark">{error}</Text>
      ) : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[13px] font-medium text-ink-muted dark:text-ink-dark-muted">
      {children}
    </Text>
  );
}

/** "Label ……… value" line inside a summary box. */
export function SummaryLine({
  label,
  value,
  strong,
  muted,
  valueClassName,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  valueClassName?: string;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3 py-1.5">
      <Text
        className={cn(
          'flex-shrink text-[13px]',
          muted
            ? 'text-ink-faint dark:text-ink-dark-faint'
            : 'text-ink-muted dark:text-ink-dark-muted',
        )}
      >
        {label}
      </Text>
      <Text
        className={cn(
          'text-right',
          strong
            ? 'text-sm font-bold text-ink dark:text-ink-dark'
            : 'text-[13px] font-semibold text-ink dark:text-ink-dark',
          valueClassName,
        )}
        style={NUM}
      >
        {value}
      </Text>
    </View>
  );
}

/** A soft box that groups summary lines. */
export function SummaryBox({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <View
      className={cn('rounded-xl bg-surface-sunk px-3.5 py-2 dark:bg-surface-sunk-dark', className)}
    >
      {children}
    </View>
  );
}

/** Rule issues under a ticket — every one listed, in the server's words. */
export function IssueList({ issues }: { issues: readonly { message: string }[] }) {
  if (!issues.length) return null;
  return (
    <View accessibilityRole="alert" className="gap-1">
      {issues.map((issue) => (
        <Text
          key={issue.message}
          className="text-xs leading-[17px] text-danger-600 dark:text-danger-dark"
        >
          • {issue.message}
        </Text>
      ))}
    </View>
  );
}

/** A compact pill button (Chain / Futures / Exit on rows). */
export function PillButton({
  label,
  onPress,
  tone = 'neutral',
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  tone?: 'neutral' | 'buy' | 'sell' | 'brand';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const box = {
    neutral:
      'border border-line-strong bg-surface active:bg-surface-sunk dark:border-line-dark-strong dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
    brand: 'bg-brand-wash active:opacity-80 dark:bg-brand-wash-dark',
    buy: 'bg-brand-strong active:opacity-90 dark:bg-brand-strong-dark',
    sell: 'bg-danger-600 active:opacity-90',
  }[tone];
  const text = {
    neutral: 'text-ink dark:text-ink-dark',
    brand: 'text-brand-text dark:text-brand-text-dark',
    buy: 'text-white',
    sell: 'text-white',
  }[tone];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      className={cn(
        'min-h-[32px] items-center justify-center rounded-lg px-3',
        box,
        disabled && 'opacity-40',
      )}
    >
      <Text className={cn('text-xs font-bold', text)}>{label}</Text>
    </Pressable>
  );
}
