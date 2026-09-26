import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

interface StackScreenProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onRefresh?: () => Promise<unknown>;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Render children without the built-in ScrollView (for FlatList screens). */
  scroll?: boolean;
}

/** Scaffold for pushed screens: back · title · action, pull-to-refresh, width-capped body. */
export function StackScreen({
  title,
  subtitle,
  right,
  onRefresh,
  children,
  footer,
  scroll = true,
}: StackScreenProps) {
  const router = useRouter();
  const { colors } = useTheme();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.background }}>
      <View className="min-h-[56px] flex-row items-center gap-2 border-b border-line px-2 dark:border-line-dark">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Go back"
          hitSlop={8}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-[17px] font-bold text-ink dark:text-ink-dark"
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right ? <View className="pr-2">{right}</View> : null}
      </View>

      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
              />
            ) : undefined
          }
        >
          <View className="w-full max-w-[640px] self-center">{children}</View>
        </ScrollView>
      ) : (
        <View className="flex-1">{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

/** Stacked placeholder rows while a list loads. */
export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <View className="overflow-hidden rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
      {Array.from({ length: rows }, (_, index) => (
        <View
          key={index}
          className="flex-row items-center gap-3 border-b border-line px-3.5 py-3.5 dark:border-line-dark"
        >
          <View className="h-9 w-9 rounded-[11px] bg-line dark:bg-line-dark" />
          <View className="flex-1 gap-2">
            <View className="h-3 w-2/5 rounded bg-line dark:bg-line-dark" />
            <View className="h-2.5 w-1/4 rounded bg-line dark:bg-line-dark" />
          </View>
          <View className="h-3 w-16 rounded bg-line dark:bg-line-dark" />
        </View>
      ))}
    </View>
  );
}
