import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import LayoutGrid from 'lucide-react-native/icons/layout-grid';
import React, { useCallback } from 'react';
import { Pressable, Text, View } from 'react-native';

import { GroupScreen } from '@/components/navigation/GroupScreen';
import { IconTile } from '@/components/ui/IconTile';
import { SearchTrigger } from '@/components/ui/SearchTrigger';
import {
  MostTradedShelf,
  MoversPreview,
  RecentlyViewedStrip,
  ScreensCard,
} from '@/features/home/explore/ExploreSections';
import { marketKeys } from '@/features/market/hooks';
import { useTheme } from '@/theme/ThemeProvider';

function HeatmapEntry() {
  const router = useRouter();
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Market heatmap. See an index’s stocks by size and move"
      onPress={() => router.navigate('/heatmap')}
      className="mt-7 flex-row items-center gap-3 rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <IconTile Icon={LayoutGrid} tone="teal" />
      <View className="flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark">Market heatmap</Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={2}>
          See an index’s stocks at a glance, sized by market cap
        </Text>
      </View>
      <ChevronRight size={18} color={colors.textFaint} />
    </Pressable>
  );
}

/**
 * Explore: search, the stocks you opened last, today's movers and most traded, and the
 * built-in screens — every shelf on a real endpoint (the web's Explore landing).
 */
export default function ExploreScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const onRefresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: marketKeys.all }),
    [queryClient],
  );

  return (
    <GroupScreen onRefresh={onRefresh}>
      <SearchTrigger placeholder="Search NSE / BSE stocks" onPress={() => router.push('/search')} />
      <RecentlyViewedStrip />
      <MoversPreview />
      <MostTradedShelf />
      <HeatmapEntry />
      <ScreensCard />
    </GroupScreen>
  );
}
