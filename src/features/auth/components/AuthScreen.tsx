import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import React from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LogoMark } from '@/components/brand/Logo';
import { useTheme } from '@/theme/ThemeProvider';

interface AuthScreenProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Pinned under the content, above the home indicator (primary CTA, switch-flow link). */
  footer?: React.ReactNode;
  /** Replaces the default back behaviour, e.g. to return to sign-in from a terminal state. */
  onBack?: () => void;
  showBack?: boolean;
}

/**
 * Shared scaffold for every signed-out screen: safe-area aware, keyboard-avoiding,
 * scrollable on small phones, and width-capped on tablets so forms never stretch
 * edge to edge.
 */
export function AuthScreen({
  title,
  subtitle,
  children,
  footer,
  onBack,
  showBack = true,
}: AuthScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const canGoBack = showBack && (onBack !== undefined || router.canGoBack());

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Edge-to-edge Android no longer resizes the window for the keyboard, so padding
          is correct on both platforms. */}
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <View className="h-14 flex-row items-center px-3">
          {canGoBack ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              hitSlop={8}
              onPress={onBack ?? (() => router.back())}
              className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
            >
              <ArrowLeft size={22} color={colors.text} />
            </Pressable>
          ) : (
            <View className="px-2">
              <LogoMark size={30} />
            </View>
          )}
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 20, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
          <View className="w-full max-w-[440px] flex-1 self-center">
            {title ? (
              <View className="mb-7 mt-2 gap-2">
                <Text
                  accessibilityRole="header"
                  className="text-[26px] font-bold leading-[32px] text-ink dark:text-ink-dark"
                  style={{ letterSpacing: -0.8 }}
                >
                  {title}
                </Text>
                {subtitle ? (
                  <Text className="text-[15px] leading-[22px] text-ink-muted dark:text-ink-dark-muted">
                    {subtitle}
                  </Text>
                ) : null}
              </View>
            ) : null}
            {children}
          </View>
        </ScrollView>

        {footer ? (
          <View className="w-full max-w-[440px] self-center px-5 pb-2 pt-3">{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** "New here? Create account"-style row used under the primary action. */
export function AuthSwitchPrompt({
  prompt,
  actionLabel,
  onPress,
}: {
  prompt: string;
  actionLabel: string;
  onPress: () => void;
}) {
  return (
    <View className="flex-row flex-wrap items-center justify-center gap-1 py-3">
      <Text className="text-sm text-ink-muted dark:text-ink-dark-muted">{prompt}</Text>
      <Pressable
        accessibilityRole="link"
        hitSlop={10}
        onPress={onPress}
        className="active:opacity-60"
      >
        <Text className="text-sm font-semibold text-brand-text dark:text-brand-text-dark">
          {actionLabel}
        </Text>
      </Pressable>
    </View>
  );
}
