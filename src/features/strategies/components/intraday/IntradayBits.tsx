import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * A labelled bar: the label, a track filled to `pct` (0–100) — green for a gain, red for a
 * loss, quiet grey when it is a share rather than a return — and the figure.
 */
export function BarRow({
  label,
  pct,
  sign,
  value,
  valueTone,
  a11y,
  labelWidth = 48,
}: {
  label: string;
  pct: number;
  /** Colours the fill; omitted = a neutral share. */
  sign?: number | null;
  value: string;
  /** Colours the figure by this number's sign. */
  valueTone?: number | null;
  a11y: string;
  labelWidth?: number;
}) {
  const fill =
    sign == null
      ? 'bg-ink-faint dark:bg-ink-dark-faint'
      : sign < 0
        ? 'bg-danger-500 dark:bg-danger-dark'
        : 'bg-brand-strong dark:bg-brand-strong-dark';
  return (
    <View accessible accessibilityLabel={a11y} className="flex-row items-center gap-2.5">
      <Text
        className="text-xs text-ink-muted dark:text-ink-dark-muted"
        style={[NUM, { width: labelWidth }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-line dark:bg-line-dark">
        <View
          className={cn('h-full rounded-full', fill)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </View>
      {valueTone !== undefined ? (
        <ChangeText value={valueTone} className="w-[72px] text-right text-xs" style={NUM}>
          {value}
        </ChangeText>
      ) : (
        <Text
          className="w-[72px] text-right text-xs font-semibold text-ink dark:text-ink-dark"
          style={NUM}
        >
          {value}
        </Text>
      )}
    </View>
  );
}

/** A symbol filter: upper-case, no autocorrect. */
export function SymbolSearch({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (text: string) => void;
  label: string;
}) {
  const { colors } = useTheme();
  return (
    <Input
      value={value}
      onChangeText={onChange}
      placeholder="Symbol"
      accessibilityLabel={label}
      autoCapitalize="characters"
      autoCorrect={false}
      returnKeyType="search"
      clearButtonMode="while-editing"
      leftIcon={<Search size={16} color={colors.textMuted} />}
    />
  );
}

/** A compact "label ▾" control that opens a picker sheet (sort order, exit reason). */
export function PickerPill({
  label,
  a11y,
  onPress,
  active = false,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  active?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className={cn(
        'flex-row items-center gap-1 self-start rounded-full border px-3 py-1.5',
        active
          ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
          : 'border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
      )}
    >
      <Text
        className={cn(
          'text-[13px] font-semibold',
          active
            ? 'text-brand-text dark:text-brand-text-dark'
            : 'text-ink-muted dark:text-ink-dark-muted',
        )}
        numberOfLines={1}
      >
        {label}
      </Text>
      <ChevronDown size={14} color={active ? colors.link : colors.textMuted} />
    </Pressable>
  );
}

/** A small caption over a switch ("Universe", "Rules"). */
export function Caption({ children }: { children: string }) {
  return (
    <Text className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
      {children}
    </Text>
  );
}
