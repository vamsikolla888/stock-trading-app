import ChevronRight from 'lucide-react-native/icons/chevron-right';
import React, { useEffect, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';

import { Skeleton } from '@/components/ui/Skeleton';
import { Toggle } from '@/components/ui/Toggle';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * The Settings kit's quiet pieces (web: features/settings/ui/kit.tsx — Row, PanelLink, the
 * panel flash), built on the app's own Panel. Type and hairlines do the work: a setting is a
 * title, one line saying what it does, and its value or control on the right. No icons.
 */

const NUM = { fontVariant: ['tabular-nums' as const] };

/** A setting's value on the right of its row ("₹1,00,000.00", "3"). */
export function SettingValue({ children }: { children: React.ReactNode }) {
  return (
    <Text
      className="text-[13px] font-semibold text-ink dark:text-ink-dark"
      style={NUM}
      numberOfLines={1}
    >
      {children}
    </Text>
  );
}

/**
 * One setting row, for a flush Panel. With `onPress` the whole row is the target and shows a
 * chevron; with `toggle` the row is a switch (it announces itself as one, and the switch moves
 * only when `value` does — callers pass the server's value for anything safety-related).
 */
export function SettingRow({
  title,
  detail,
  right,
  onPress,
  toggle,
  danger = false,
  accessibilityLabel,
  valueText,
}: {
  title: string;
  detail?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  toggle?: { value: boolean; onChange: (next: boolean) => void; disabled?: boolean };
  danger?: boolean;
  accessibilityLabel?: string;
  /** Read out as the row's value when `right` is a status (a pressable row groups its children). */
  valueText?: string;
}) {
  const { colors } = useTheme();
  const text = (
    <View className="flex-1">
      <Text
        className={cn(
          'text-sm font-semibold',
          danger ? 'text-danger-600 dark:text-danger-dark' : 'text-ink dark:text-ink-dark',
        )}
      >
        {title}
      </Text>
      {detail ? (
        <Text className="mt-0.5 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {detail}
        </Text>
      ) : null}
    </View>
  );
  const rowClass = 'min-h-[56px] flex-row items-center gap-3 px-4 py-3';

  if (toggle) {
    return (
      <Pressable
        accessibilityRole="switch"
        accessibilityLabel={accessibilityLabel ?? title}
        accessibilityHint={detail}
        accessibilityState={{ checked: toggle.value, disabled: toggle.disabled }}
        disabled={toggle.disabled}
        onPress={() => toggle.onChange(!toggle.value)}
        className={cn(rowClass, 'active:bg-surface-sunk dark:active:bg-surface-sunk-dark')}
      >
        {text}
        <Toggle value={toggle.value} disabled={toggle.disabled} />
      </Pressable>
    );
  }

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? (detail ? `${title}, ${detail}` : title)}
        accessibilityValue={valueText ? { text: valueText } : undefined}
        onPress={onPress}
        className={cn(rowClass, 'active:bg-surface-sunk dark:active:bg-surface-sunk-dark')}
      >
        {text}
        {right}
        <ChevronRight size={16} color={colors.textFaint} />
      </Pressable>
    );
  }

  // Not grouped: a reader reads the title, the detail and then the value (a status pill) itself.
  return (
    <View
      accessible={accessibilityLabel != null}
      accessibilityLabel={accessibilityLabel}
      className={rowClass}
    >
      {text}
      {right}
    </View>
  );
}

/** Placeholder rows while a flush panel loads — the panel keeps its shape, nothing jumps. */
export function RowsSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <View accessible accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <View key={index} className="gap-2 px-4 py-3.5">
          <Skeleton width="45%" height={13} />
          <Skeleton width="72%" height={11} />
        </View>
      ))}
    </View>
  );
}

/** The hairline between rows of a flush panel, inset to the text. */
export function SettingDivider() {
  return <View className="ml-4 h-px bg-line dark:bg-line-dark" />;
}

/** A link in a panel's header ("Manage", "Profile") — quiet text with a chevron. */
export function PanelLink({
  label,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={accessibilityLabel ?? label}
      hitSlop={10}
      onPress={onPress}
      className="flex-row items-center gap-0.5 active:opacity-60"
    >
      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
        {label}
      </Text>
      <ChevronRight size={14} color={colors.link} />
    </Pressable>
  );
}

/** A row of labelled figures (a wallet's balances) on the sunk ground. */
export function FigureStrip({ items }: { items: readonly { label: string; value: string }[] }) {
  return (
    <View className="flex-row rounded-field bg-surface-sunk px-3.5 py-3 dark:bg-surface-sunk-dark">
      {items.map((item) => (
        <View
          key={item.label}
          accessible
          accessibilityLabel={`${item.label} ${item.value}`}
          className="flex-1 gap-1"
        >
          <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {item.label}
          </Text>
          <Text
            className="text-[15px] font-semibold text-ink dark:text-ink-dark"
            style={NUM}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/**
 * Outlines its child briefly — where a deep link (`/settings?section=paper`) or a glance tile
 * landed. The outline fades on its own; nothing moves.
 */
export function FlashFrame({
  active,
  children,
  ref,
}: {
  active: boolean;
  children: React.ReactNode;
  ref?: React.Ref<View>;
}) {
  const { colors } = useTheme();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!active) return undefined;
    opacity.setValue(1);
    const fade = Animated.timing(opacity, {
      toValue: 0,
      duration: 900,
      delay: 900,
      useNativeDriver: true,
    });
    fade.start();
    return () => {
      fade.stop();
      opacity.setValue(0);
    };
  }, [active, opacity]);

  return (
    <View ref={ref} collapsable={false}>
      {children}
      {/* Drawn over the panel's own border (rounded-card), inside its bounds, so no parent clips it. */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          borderRadius: 14,
          borderWidth: 2,
          borderColor: colors.accent,
          opacity,
        }}
      />
    </View>
  );
}
