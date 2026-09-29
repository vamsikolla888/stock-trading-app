import X from 'lucide-react-native/icons/x';
import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Beside the title, before the close button (e.g. the last price). */
  headerRight?: React.ReactNode;
  /** Above the scrolling body, under the title (e.g. Buy/Sell toggle). */
  header?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the scrolling body — the sheet's actions. */
  footer?: React.ReactNode;
  /** Blocks every way of dismissing (backdrop, back button, close) while an order is in flight. */
  busy?: boolean;
  /** Share of the screen height the sheet may take. */
  maxHeight?: number;
  /** iOS only (RN's Modal `onDismiss`): the sheet has finished animating away. */
  onDismissed?: () => void;
}

/**
 * The F&O order tickets and detail sheets: RN's Modal (back button and screen-reader focus
 * for free, opens from inside any scroll view), capped in height, lifting over the keyboard.
 * While `busy` it cannot be dismissed — closing a ticket mid-order would hide its answer.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  headerRight,
  header,
  children,
  footer,
  busy = false,
  maxHeight = 0.92,
  onDismissed,
}: SheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const close = () => {
    if (!busy) onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
      onDismiss={onDismissed}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'flex-end' }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          accessibilityState={{ disabled: busy }}
          onPress={close}
          className="absolute inset-0"
          style={{ backgroundColor: colors.overlay }}
        />
        <View
          accessibilityViewIsModal
          className="rounded-t-3xl bg-surface dark:bg-surface-dark"
          style={{
            maxHeight: height * maxHeight,
            paddingBottom: Math.max(insets.bottom, 12),
          }}
        >
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
            {headerRight}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityState={{ disabled: busy }}
              hitSlop={10}
              disabled={busy}
              onPress={close}
              className="h-8 w-8 items-center justify-center rounded-full bg-surface-sunk disabled:opacity-40 dark:bg-surface-sunk-dark"
            >
              <X size={16} color={colors.text} />
            </Pressable>
          </View>
          {header ? <View className="px-5 pb-2">{header}</View> : null}
          <ScrollView
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 12 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer ? (
            <View className="gap-2 border-t border-line px-5 pt-3 dark:border-line-dark">
              {footer}
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
