import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockLogo } from '@/components/market/StockLogo';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { Chips } from '@/components/ui/Tabs';
import { ScoreRing } from '@/features/fundamentals/components/ScoreRing';
import { useFundamentalList } from '@/features/fundamentals/hooks';
import {
  crore,
  istDate,
  knockoutText,
  pct,
  times,
  VERDICT_SHORT,
  VERDICT_TONE,
} from '@/features/fundamentals/lib/format';
import type { AnalysisListItem, ListSort, Verdict } from '@/features/fundamentals/types';
import { stockLogoUrl } from '@/features/market/api';
import { useDebounce } from '@/hooks/useDebounce';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

const NUM = { fontVariant: ['tabular-nums' as const] };

type VerdictFilter = Verdict | 'all';

const VERDICTS: readonly Verdict[] = [
  'strong_bullish',
  'bullish',
  'neutral',
  'bearish',
  'strong_bearish',
];

/** The sort, and the direction that reads naturally for it. */
const SORTS: readonly { key: ListSort; label: string; dir: 'asc' | 'desc' }[] = [
  { key: 'rating', label: 'Best rated', dir: 'desc' },
  { key: 'change', label: 'Biggest rise', dir: 'desc' },
  { key: 'quality', label: 'Highest quality', dir: 'desc' },
  { key: 'valuation', label: 'Best valued', dir: 'desc' },
  { key: 'mos', label: 'Margin of safety', dir: 'desc' },
  { key: 'pe', label: 'Lowest P/E', dir: 'asc' },
  { key: 'marketCap', label: 'Largest', dir: 'desc' },
  { key: 'updated', label: 'Recently rated', dir: 'desc' },
  { key: 'name', label: 'A–Z', dir: 'asc' },
];

const ALL_INDICES = 'all';

/**
 * Intelligence › Stock analysis (web: /stock-analysis) — every stock's saved FUNDAMENTAL
 * rating in one list: the weekly batch over the index stocks, plus any stock page opened since.
 * Filtered, sorted and paged on the server; each row opens the stock on its Fundamentals tab.
 */
export default function StockAnalysisScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [search, setSearch] = useState('');
  const q = useDebounce(search, 300);
  const [verdict, setVerdict] = useState<VerdictFilter>('all');
  const [sort, setSort] = useState<ListSort>('rating');
  const [index, setIndex] = useState<string>(ALL_INDICES);
  const [sortOpen, setSortOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const sortDef = SORTS.find((s) => s.key === sort) ?? SORTS[0]!;
  const list = useFundamentalList({
    q,
    verdict: verdict === 'all' ? undefined : [verdict],
    sort,
    dir: sortDef.dir,
    index: index === ALL_INDICES ? null : index,
  });
  const pages = list.data?.pages;
  const first = pages?.[0];
  const items = useMemo(() => pages?.flatMap((page) => page.items) ?? [], [pages]);

  const verdictChips = useMemo(
    () => [
      { key: 'all' as const, label: 'All' },
      ...VERDICTS.map((v) => ({
        key: v,
        label: `${VERDICT_SHORT[v]}${first ? ` ${first.facets.verdict[v] ?? 0}` : ''}`,
      })),
    ],
    [first],
  );
  const indexOptions = useMemo(
    () => [
      { key: ALL_INDICES, label: 'All indices' },
      ...(first?.facets.indices ?? []).map((i) => ({
        key: i.key,
        label: `${i.label} (${i.count})`,
      })),
    ],
    [first],
  );
  const indexLabel =
    index === ALL_INDICES
      ? 'All indices'
      : (first?.facets.indices.find((i) => i.key === index)?.label ?? index);

  const open = useCallback(
    (item: AnalysisListItem) =>
      router.push({
        pathname: '/stock/[symbol]',
        params: { symbol: item.symbol, exchange: item.exchange, tab: 'fundamentals' },
      }),
    [router],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [list]);

  const onEndReached = useCallback(() => {
    if (list.hasNextPage && !list.isFetchingNextPage) void list.fetchNextPage();
  }, [list]);

  const renderItem = useCallback(
    ({ item }: { item: AnalysisListItem }) => <AnalysisRow item={item} onPress={open} />,
    [open],
  );

  const header = (
    <View className="pb-3">
      <Input
        placeholder="Search a stock, company or ISIN"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="characters"
        autoCorrect={false}
        returnKeyType="search"
        leftIcon={<Search size={18} color={colors.textMuted} />}
        accessibilityLabel="Search analysed stocks"
      />
      <Chips items={verdictChips} value={verdict} onChange={setVerdict} className="mt-3" />
      <View className="mt-3 flex-row gap-2">
        <Pill label={sortDef.label} onPress={() => setSortOpen(true)} />
        <Pill label={indexLabel} onPress={() => setIndexOpen(true)} />
      </View>
      {first ? (
        <Text className="mt-3 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {formatNumber(first.total, 0)} shown · {formatNumber(first.totals.analysed, 0)} of{' '}
          {formatNumber(first.totals.universe, 0)} stocks analysed in the last {first.windowDays}{' '}
          days
          {first.schedule?.nextRunAt ? ` · next batch ${istDate(first.schedule.nextRunAt)}` : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <GroupScreen
      scroll={false}
      intro="Every stock’s fundamental rating — financials scored weekly against one framework"
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          list.isPending ? (
            <ListSkeleton rows={6} />
          ) : list.isError ? (
            <InlineError
              what="the stock analysis"
              error={list.error}
              onRetry={() => void list.refetch()}
            />
          ) : (
            <InlineEmpty
              title="No analysed stocks match"
              message={
                q || verdict !== 'all' || index !== ALL_INDICES
                  ? 'Try a wider filter.'
                  : 'The weekly batch has not produced any analyses yet.'
              }
            />
          )
        }
        ListFooterComponent={
          items.length > 0 ? (
            <View className="items-center py-5">
              {list.isFetchingNextPage ? (
                <ActivityIndicator color={colors.accent} />
              ) : !list.hasNextPage && first ? (
                <Text className="text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
                  {first.disclaimer}
                </Text>
              ) : null}
            </View>
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        style={{ opacity: list.isPlaceholderData ? 0.55 : 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
      <OptionSheet
        visible={sortOpen}
        title="Sort by"
        options={SORTS}
        value={sort}
        onSelect={(key) => {
          setSort(key);
          setSortOpen(false);
        }}
        onClose={() => setSortOpen(false)}
      />
      <OptionSheet
        visible={indexOpen}
        title="Index"
        options={indexOptions}
        value={index}
        onSelect={(key) => {
          setIndex(key);
          setIndexOpen(false);
        }}
        onClose={() => setIndexOpen(false)}
      />
    </GroupScreen>
  );
}

function Separator() {
  return <View className="h-2.5" />;
}

function Pill({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      hitSlop={6}
      className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
    >
      <Text className="text-xs font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
        {label}
      </Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}

const AnalysisRow = memo(function AnalysisRow({
  item,
  onPress,
}: {
  item: AnalysisListItem;
  onPress: (item: AnalysisListItem) => void;
}) {
  const tone = VERDICT_TONE[item.verdict];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.symbol}, ${item.companyName}. ${VERDICT_SHORT[item.verdict]}, rating ${item.ratingPct == null ? 'unavailable' : `${Math.round(item.ratingPct)} percent`}`}
      onPress={() => onPress(item)}
      className="rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-3">
        <StockLogo symbol={item.symbol} uri={stockLogoUrl(item.symbol)} size="sm" />
        <View className="min-w-0 flex-1">
          <Text className="text-sm font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
            {item.symbol}
          </Text>
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
            {item.companyName}
            {item.sector ? ` · ${item.sector}` : ''}
          </Text>
          <View className="mt-1.5 flex-row flex-wrap items-center gap-1.5">
            <Badge label={VERDICT_SHORT[item.verdict]} variant={tone} />
            {item.ratingDelta != null && item.ratingDelta !== 0 ? (
              <Text
                className={
                  item.ratingDelta > 0
                    ? 'text-[11px] font-semibold text-brand-text dark:text-brand-text-dark'
                    : 'text-[11px] font-semibold text-danger-600 dark:text-danger-dark'
                }
                style={NUM}
              >
                {item.ratingDelta > 0 ? '▲' : '▼'} {Math.abs(item.ratingDelta).toFixed(1)}
              </Text>
            ) : null}
            {item.isStale ? <Badge label="Stale" variant="warning" /> : null}
          </View>
        </View>
        <ScoreRing value={item.ratingPct} tone={tone} size={48} label="" />
      </View>
      <Text
        className="mt-2.5 text-[11px] text-ink-muted dark:text-ink-dark-muted"
        style={NUM}
        numberOfLines={1}
      >
        Quality {pct(item.qualityPct, 0)} · Valuation {pct(item.valuationPct, 0)} · P/E{' '}
        {times(item.pe, 1)} · MoS {pct(item.marginOfSafetyPct, 0)} · {crore(item.marketCapCr)}
      </Text>
      {item.knockouts.length > 0 ? (
        <Text className="mt-1 text-[11px] text-danger-600 dark:text-danger-dark" numberOfLines={1}>
          Red flag: {knockoutText(item.knockouts[0]!)}
          {item.knockouts.length > 1 ? ` +${item.knockouts.length - 1}` : ''}
        </Text>
      ) : null}
    </Pressable>
  );
});
