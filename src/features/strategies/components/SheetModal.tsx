import ArrowLeft from 'lucide-react-native/icons/arrow-left';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

interface SheetModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Shows a back arrow instead of the close button (a sub-step inside the sheet). */
  onBack?: () => void;
  children: React.ReactNode;
  /** Pinned under the scroll area — the sheet's one primary action. */
  footer?: React.ReactNode;
  /** Fill most of the screen even when the content is short (long pickers). */
  tall?: boolean;
  /** Content above the scroll area that must stay put (a search field). */
  header?: React.ReactNode;
}

/**
 * A bottom sheet for editors and pickers: grabber, title, close, scrollable body, pinned
 * footer. Built on RN's Modal (like OptionSheet) so it works in Expo Go and never nests
 * inside another sheet — sub-steps swap the content instead (see `onBack`).
 */
export function SheetModal({
  visible,
  title,
  subtitle,
  onClose,
  onBack,
  children,
  footer,
  tall = false,
  header,
}: SheetModalProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onBack ?? onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <View className="flex-1 justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            className="absolute inset-0"
            style={{ backgroundColor: colors.overlay }}
          />
          <View
            accessibilityViewIsModal
            className="rounded-t-3xl bg-surface dark:bg-surface-dark"
            style={{
              maxHeight: '92%',
              height: tall ? '92%' : undefined,
              paddingBottom: footer ? 0 : Math.max(insets.bottom, 16),
            }}
          >
            <View className="mb-1 mt-3 h-1 w-10 self-center rounded-full bg-line-strong dark:bg-line-dark-strong" />
            <View className="flex-row items-center gap-2 px-3 pb-2 pt-1">
              {onBack ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                  hitSlop={8}
                  onPress={onBack}
                  className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                >
                  <ArrowLeft size={20} color={colors.text} />
                </Pressable>
              ) : (
                <View className="w-2" />
              )}
              <View className="flex-1">
                <Text
                  accessibilityRole="header"
                  className="text-[17px] font-bold text-ink dark:text-ink-dark"
                  numberOfLines={1}
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
                hitSlop={8}
                onPress={onClose}
                className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <X size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            {header ? <View className="px-5 pb-2">{header}</View> : null}
            <ScrollView
              style={tall ? { flex: 1 } : undefined}
              contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View
                className="border-t border-line px-5 pt-3 dark:border-line-dark"
                style={{ paddingBottom: Math.max(insets.bottom, 12) }}
              >
                {footer}
              </View>
            ) : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
