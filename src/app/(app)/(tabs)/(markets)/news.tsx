import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import { NewsRow } from '@/features/news/components/NewsRow';
import { useNewsFeed, useRetryAnalysis } from '@/features/news/hooks';
import {
  EMPTY_COPY,
  RANGE_OPTIONS,
  SENTIMENT_OPTIONS,
  SORT_OPTIONS,
  uniqueArticles,
  type SentimentFilter,
} from '@/features/news/lib/news';
import type { AnalyzedArticleListItem, NewsRange, NewsSort } from '@/features/news/types';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * News centre: every ingested article, read and scored for sentiment and impact. Range,
 * sentiment and sort mirror the web's filters; pages load as the list scrolls. Rows open
 * the in-app article, which links out to the original.
 */
export default function NewsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [range, setRange] = useState<NewsRange>('today');
  const [sentiment, setSentiment] = useState<SentimentFilter>('all');
  const [sortBy, setSortBy] = useState<NewsSort>('date');
  const [sortOpen, setSortOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const feed = useNewsFeed({
    range,
    sentiment: sentiment === 'all' ? undefined : sentiment,
    sortBy,
  });
  const retry = useRetryAnalysis();

  const items = useMemo(() => uniqueArticles(feed.data?.pages ?? []), [feed.data]);
  const total = feed.data?.pages[0]?.total ?? null;
  const rangeLabel = RANGE_OPTIONS.find((option) => option.key === range)?.label ?? '';
  const sortLabel = SORT_OPTIONS.find((option) => option.key === sortBy)?.label ?? '';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await feed.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [feed]);

  const onEndReached = useCallback(() => {
    if (feed.hasNextPage && !feed.isFetchingNextPage && !feed.isPlaceholderData) {
      void feed.fetchNextPage();
    }
  }, [feed]);

  const renderItem = useCallback(
    ({ item, index }: { item: AnalyzedArticleListItem; index: number }) => {
      const last = index === items.length - 1;
      return (
        <View
          className={cn(
            'border-x border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
            index === 0 && 'overflow-hidden rounded-t-card border-t',
            last && 'overflow-hidden rounded-b-card border-b',
            index > 0 && 'border-t',
          )}
        >
          <NewsRow
            item={item}
            onPress={() => router.push({ pathname: '/article/[id]', params: { id: item.newsId } })}
            onRetry={() => retry.mutate(item.newsId)}
            retrying={retry.isPending && retry.variables === item.newsId}
          />
        </View>
      );
    },
    [items.length, retry, router],
  );

  const header = (
    <View className="pb-4">
      <SegmentedControl items={RANGE_OPTIONS} value={range} onChange={setRange} />
      <Chips items={SENTIMENT_OPTIONS} value={sentiment} onChange={setSentiment} className="mt-3" />
    </View>
  );

  let empty: React.ReactElement | null = null;
  if (feed.isPending) empty = <ListSkeleton rows={6} />;
  else if (feed.error && items.length === 0)
    empty = <InlineError what="news" error={feed.error} onRetry={() => void feed.refetch()} />;
  else
    empty = (
      <InlineEmpty
        title="No news here"
        message={EMPTY_COPY[range]}
        action={
          sentiment !== 'all'
            ? { label: 'Show every sentiment', onPress: () => setSentiment('all') }
            : range !== 'last7days'
              ? { label: 'Show the last 7 days', onPress: () => setRange('last7days') }
              : undefined
        }
      />
    );

  return (
    <GroupScreen
      scroll={false}
      intro={
        total === null
          ? 'Every article is read and scored for impact'
          : `${formatNumber(total, 0)} analysed article${total === 1 ? '' : 's'} · ${rangeLabel.toLowerCase()}`
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortLabel}`}
          hitSlop={8}
          onPress={() => setSortOpen(true)}
          className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{sortLabel}</Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.newsId}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          items.length > 0 ? (
            <View className="items-center py-5">
              {feed.isFetchingNextPage ? (
                <ActivityIndicator color={colors.accent} />
              ) : !feed.hasNextPage ? (
                <Text className="text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
                  Sentiment and impact are an AI model’s reading of each article — informational
                  only, not investment advice.
                </Text>
              ) : null}
            </View>
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        style={{ opacity: feed.isPlaceholderData ? 0.55 : 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
      <OptionSheet
        visible={sortOpen}
        title="Sort news"
        options={SORT_OPTIONS}
        value={sortBy}
        onSelect={setSortBy}
        onClose={() => setSortOpen(false)}
      />
    </GroupScreen>
  );
}
