import X from 'lucide-react-native/icons/x';
import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetFrame } from '@/components/ui/SheetFrame';
import { useTheme } from '@/theme/ThemeProvider';

interface ModalSheetProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the scrolling body, e.g. a primary action. */
  footer?: React.ReactNode;
}

/**
 * Bottom sheet for content longer than a single-choice list (OptionSheet's job): grouped
 * pickers, explanations, mixed controls. Scrolls when taller than 85% of the screen.
 * Same look as OptionSheet so the two read as one family.
 */
export function ModalSheet({ visible, title, onClose, children, footer }: ModalSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <SheetFrame
      visible={visible}
      onRequestClose={onClose}
      maxHeight={0.85}
      style={{ paddingTop: 12, paddingBottom: Math.max(insets.bottom, 16) }}
      handle={
        <>
          <View className="mb-3 h-1 w-10 self-center rounded-full bg-line-strong dark:bg-line-dark-strong" />
          <View className="flex-row items-center gap-3 px-5 pb-2">
            <Text
              accessibilityRole="header"
              className="flex-1 text-[17px] font-bold text-ink dark:text-ink-dark"
              numberOfLines={2}
            >
              {title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              onPress={onClose}
              className="h-8 w-8 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          </View>
        </>
      }
    >
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
      {footer ? <View className="px-5 pt-3">{footer}</View> : null}
    </SheetFrame>
  );
}

/** A selectable row inside a ModalSheet (radio semantics). */
export function SheetOption({
  label,
  detail,
  selected,
  disabled = false,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      disabled={disabled}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 py-2 active:opacity-70"
      style={{ opacity: disabled ? 0.45 : 1 }}
    >
      <View className="flex-1">
        <Text
          className={
            selected
              ? 'text-[15px] font-semibold text-brand-text dark:text-brand-text-dark'
              : 'text-[15px] text-ink dark:text-ink-dark'
          }
          numberOfLines={1}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
            numberOfLines={1}
          >
            {detail}
          </Text>
        ) : null}
      </View>
      <View
        className="h-5 w-5 items-center justify-center rounded-full border-2"
        style={{ borderColor: selected ? colors.link : colors.borderStrong }}
      >
        {selected ? (
          <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors.link }} />
        ) : null}
      </View>
    </Pressable>
  );
}
