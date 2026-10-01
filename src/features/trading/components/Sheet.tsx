import X from 'lucide-react-native/icons/x';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetFrame } from '@/components/ui/SheetFrame';
import { useTheme } from '@/theme/ThemeProvider';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the scrolling body — the sheet's actions. */
  footer?: React.ReactNode;
  /** Blocks dismissal (backdrop, back button, close) while something is in flight. */
  busy?: boolean;
}

/**
 * Bottom sheet — the Trade screens' detail and edit surface (a holding, an order, a list's
 * settings). On the shared SheetFrame (RN's Modal) rather than @gorhom's sheet because these
 * open from inside scrolling screens and nested lists, where an inline sheet would need to be
 * hoisted to the screen root. The body scrolls, capped at ~88% of the screen, and lifts over
 * the keyboard for the sheets that edit a value; a swipe down on the title closes it.
 */
export function Sheet({ visible, onClose, title, subtitle, children, footer, busy }: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <SheetFrame
      visible={visible}
      onRequestClose={onClose}
      locked={busy}
      maxHeight={0.88}
      avoidKeyboard
      style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      handle={
        <>
          <View className="mb-1 mt-3 h-1 w-10 self-center rounded-full bg-line-strong dark:bg-line-dark-strong" />
          <View className="flex-row items-start gap-3 px-5 pb-2 pt-2">
            <View className="min-w-0 flex-1">
              <Text
                accessibilityRole="header"
                className="text-[17px] font-bold text-ink dark:text-ink-dark"
                numberOfLines={2}
              >
                {title}
              </Text>
              {subtitle ? (
                <Text
                  className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                  numberOfLines={2}
                >
                  {subtitle}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={10}
              disabled={busy}
              onPress={close}
              className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark"
            >
              <X size={16} color={colors.text} />
            </Pressable>
          </View>
        </>
      }
    >
      <ScrollView
        style={{ flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </ScrollView>
      {footer ? <View className="gap-2 px-5 pt-2">{footer}</View> : null}
    </SheetFrame>
  );
}

/**
 * Runs `action` once a closing sheet has finished animating away (SheetFrame's slide is
 * 220 ms). Navigating to a modal route (the order ticket) while an RN Modal is still
 * dismissing is refused on iOS.
 */
export function afterSheetClose(action: () => void): void {
  setTimeout(action, Platform.OS === 'ios' ? 380 : 60);
}

/** Muted footnotes — the server's caveats, rendered verbatim, never summarised. */
export function Caveats({ items, className }: { items: readonly string[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <View className={className ?? 'mt-4 gap-1.5'}>
      {items.map((item) => (
        <Text key={item} className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
          {item}
        </Text>
      ))}
    </View>
  );
}

/** One muted line of explanation under a control or a list. */
export function Note({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Text
      className={className ?? 'mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted'}
    >
      {children}
    </Text>
  );
}

/** Older / Newer pager for lists paged on the server (order history by trading days). */
export function Pager({
  page,
  totalPages,
  onPage,
  busy,
  summary,
}: {
  page: number;
  totalPages: number;
  onPage: (page: number) => void;
  busy?: boolean;
  summary?: string;
}) {
  if (totalPages <= 1) {
    return summary ? <Note>{summary}</Note> : null;
  }
  return (
    <View className="mt-4 gap-2">
      <View className="flex-row items-center justify-between gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: page <= 1 || busy }}
          disabled={page <= 1 || busy}
          onPress={() => onPage(page - 1)}
          hitSlop={8}
          className="rounded-full border border-line px-3.5 py-2 active:bg-surface-sunk disabled:opacity-40 dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">Newer</Text>
        </Pressable>
        <Text
          className="text-xs text-ink-muted dark:text-ink-dark-muted"
          style={{ fontVariant: ['tabular-nums'] }}
        >
          Page {page} of {totalPages}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: page >= totalPages || busy }}
          disabled={page >= totalPages || busy}
          onPress={() => onPage(page + 1)}
          hitSlop={8}
          className="rounded-full border border-line px-3.5 py-2 active:bg-surface-sunk disabled:opacity-40 dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">Older</Text>
        </Pressable>
      </View>
      {summary ? (
        <Text className="text-center text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {summary}
        </Text>
      ) : null}
    </View>
  );
}

/** Buy / Sell tag at the start of an order row. */
export function SideTag({ side }: { side: 'BUY' | 'SELL' | null }) {
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
