import React, { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

interface GroupScreenProps {
  /** Pull-to-refresh handler; resolve when the refetch settles. */
  onRefresh?: () => Promise<unknown>;
  /** One muted line under the sub-tabs saying what this screen is for. */
  intro?: string;
  /** A small action beside the intro line (e.g. "New list"). */
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Pinned under the scroll area (e.g. a Buy/Sell bar). */
  footer?: React.ReactNode;
  /** Render children without the built-in ScrollView (FlatList screens). */
  scroll?: boolean;
}

/**
 * Body scaffold for a sub-screen of a main-menu tab. The group's header and sub-tabs sit
 * above it (GroupTabBar), so this owns only the scroll area: pull-to-refresh, the page
 * gutter, and a width cap for tablets.
 */
export function GroupScreen({
  onRefresh,
  intro,
  right,
  children,
  footer,
  scroll = true,
}: GroupScreenProps) {
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

  const introText =
    intro || right ? (
      <View className="mb-4 flex-row items-center gap-3">
        <Text className="flex-1 text-[13px] leading-[19px] text-ink-muted dark:text-ink-dark-muted">
          {intro}
        </Text>
        {right}
      </View>
    ) : null;

  return (
    <View className="flex-1 bg-canvas dark:bg-canvas-dark">
      {scroll ? (
        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accent}
                colors={[colors.accent]}
                progressBackgroundColor={colors.surface}
              />
            ) : undefined
          }
        >
          <View className="w-full max-w-[640px] self-center">
            {introText}
            {children}
          </View>
        </ScrollView>
      ) : (
        <View className="flex-1">
          {introText ? <View className="px-5 pt-4">{introText}</View> : null}
          {children}
        </View>
      )}
      {footer}
    </View>
  );
}
