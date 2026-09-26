import { useRouter } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import X from 'lucide-react-native/icons/x';
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { Chips, SegmentedControl } from '@/components/ui/Tabs';
import {
  HeatmapLegend,
  HeatmapOptionsSheet,
  HeatmapOverview,
  IndexPickerSheet,
} from '@/features/heatmap/components/HeatmapParts';
import { HeatmapTile } from '@/features/heatmap/components/HeatmapTile';
import { HeatmapTreemap } from '@/features/heatmap/components/HeatmapTreemap';
import { useHeatmapIndices, useMarketHeatmap } from '@/features/heatmap/hooks';
import {
  DEFAULT_INDEX,
  filterAndSortStocks,
  QUICK_INDICES,
  TIMEFRAMES,
  TREEMAP_MAX_TILES,
  treemapSubset,
  type HeatmapSort,
} from '@/features/heatmap/lib/heatmap';
import type { HeatmapProvider, HeatmapStock, HeatmapTimeframe } from '@/features/heatmap/types';
import { formatIstTime } from '@/features/home/lib/istTime';
import { stockHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatNumber } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

type ViewMode = 'treemap' | 'grid';

const VIEW_MODES: readonly { key: ViewMode; label: string }[] = [
  { key: 'treemap', label: 'Market cap' },
  { key: 'grid', label: 'Equal grid' },
];

const MORE = '__more';
const FALLBACK_LABELS: Record<string, string> = {
  nifty50: 'NIFTY 50',
  sensex: 'SENSEX',
  niftybank: 'NIFTY BANK',
  niftyit: 'NIFTY IT',
};

const MAX_CONTENT_WIDTH = 640;
const GRID_GAP = 4;
const GRID_TILE_HEIGHT = 64;

function sourceLabel(active: HeatmapProvider | 'snapshot', live: boolean): string {
  if (!live || active === 'snapshot') return 'Stored snapshot';
  return active === 'groww' ? 'Groww data' : 'mStock data';
}

/**
 * Index constituents as tiles: size = market cap, colour = move over the chosen window.
 * Index shortcuts and a full picker, timeframe, treemap/grid, search and options mirror the
 * web's toolbar; tapping a tile opens the stock.
 */
export default function MarketHeatmapScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  const [indexKey, setIndexKey] = useState<string>(DEFAULT_INDEX);
  const [timeframe, setTimeframe] = useState<HeatmapTimeframe>('1D');
  const [provider, setProvider] = useState<HeatmapProvider>('groww');
  const [viewMode, setViewMode] = useState<ViewMode>('treemap');
  const [groupBySector, setGroupBySector] = useState(true);
  const [sort, setSort] = useState<HeatmapSort>('marketCap');
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const indices = useHeatmapIndices();
  const heatmap = useMarketHeatmap(indexKey, timeframe, provider);
  const data = heatmap.data;

  const displayed = useMemo(
    () => filterAndSortStocks(data?.stocks ?? [], search, sort),
    [data?.stocks, search, sort],
  );
  const treemapStocks = useMemo(() => treemapSubset(displayed), [displayed]);

  const indexChips = useMemo(() => {
    const catalogue = indices.data ?? [];
    const label = (key: string) =>
      catalogue.find((index) => index.key === key)?.shortLabel ?? FALLBACK_LABELS[key] ?? key;
    const keys: string[] = QUICK_INDICES.filter(
      (key) => catalogue.length === 0 || catalogue.some((index) => index.key === key),
    );
    if (!keys.includes(indexKey)) keys.unshift(indexKey);
    return [
      ...keys.map((key) => ({ key, label: label(key) })),
      { key: MORE, label: 'More indices' },
    ];
  }, [indices.data, indexKey]);

  const onChipChange = useCallback((key: string) => {
    if (key === MORE) setPickerOpen(true);
    else setIndexKey(key);
  }, []);

  const openStock = useCallback(
    (stock: HeatmapStock) => router.push(stockHref(stock.symbol, stock.exchange)),
    [router],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([heatmap.refetch(), indices.refetch()]);
    } finally {
      setRefreshing(false);
    }
  }, [heatmap, indices]);

  const contentWidth = Math.min(windowWidth, MAX_CONTENT_WIDTH) - 40;
  const tileWidth = Math.max(60, Math.floor((contentWidth - GRID_GAP * 2) / 3));
  const updated = data ? formatIstTime(data.asOf, true) : null;
  const live = Boolean(data?.provider.live && data.marketOpen);

  let body: React.ReactNode = null;
  if (heatmap.isPending) {
    body = (
      <View
        accessibilityLabel="Loading heatmap"
        className="h-[380px] items-center justify-center rounded-card bg-surface-sunk dark:bg-surface-sunk-dark"
      >
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  } else if (heatmap.error && !data) {
    body = (
      <InlineError
        what="the heatmap"
        error={heatmap.error}
        onRetry={() => void heatmap.refetch()}
      />
    );
  } else if (data && data.stocks.length === 0) {
    body = (
      <InlineEmpty
        title={`Membership unavailable for ${data.index.label}`}
        message={data.index.caveat ?? 'This index’s constituents haven’t been imported yet.'}
        action={{ label: 'Choose another index', onPress: () => setPickerOpen(true) }}
      />
    );
  } else if (data && displayed.length === 0) {
    body = (
      <InlineEmpty
        title="No matching stocks"
        message={`Nothing in ${data.index.label} matches “${search.trim()}”.`}
        action={{ label: 'Clear search', onPress: () => setSearch('') }}
      />
    );
  } else if (viewMode === 'treemap') {
    body = (
      <View>
        <HeatmapTreemap stocks={treemapStocks} groupBySector={groupBySector} onOpen={openStock} />
        {displayed.length > TREEMAP_MAX_TILES ? (
          <Text className="mt-2 text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
            Showing the {TREEMAP_MAX_TILES} largest of {formatNumber(displayed.length, 0)} by market
            cap. Switch to the equal grid to see every stock.
          </Text>
        ) : null}
      </View>
    );
  }

  const header = (
    <View>
      <Chips items={indexChips} value={indexKey} onChange={onChipChange} />

      <View className="mt-4" style={{ opacity: heatmap.isPlaceholderData ? 0.6 : 1 }}>
        {data ? <HeatmapOverview data={data} /> : null}
      </View>

      <SegmentedControl
        items={TIMEFRAMES}
        value={timeframe}
        onChange={setTimeframe}
        className="mt-4"
      />

      <View className="mt-3 flex-row items-center gap-2.5">
        <SegmentedControl
          items={VIEW_MODES}
          value={viewMode}
          onChange={setViewMode}
          className="flex-1"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Heatmap options"
          onPress={() => setOptionsOpen(true)}
          className="h-11 w-11 items-center justify-center rounded-[11px] border border-line bg-surface active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
        >
          <SlidersHorizontal size={18} color={colors.text} />
        </Pressable>
      </View>

      <View className="mt-3 h-11 flex-row items-center gap-2 rounded-[11px] bg-surface-sunk px-3 dark:bg-surface-sunk-dark">
        <Search size={16} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search symbol or company"
          placeholderTextColor={colors.textFaint}
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          accessibilityLabel="Search stocks in this heatmap"
          className="h-full flex-1 text-[14px] text-ink dark:text-ink-dark"
        />
        {search ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            hitSlop={10}
            onPress={() => setSearch('')}
          >
            <X size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {data ? (
        <View
          accessibilityRole="text"
          className="mt-3 flex-row flex-wrap items-center gap-x-1.5 gap-y-0.5"
        >
          <View
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              live ? 'bg-brand' : 'bg-ink-faint dark:bg-ink-dark-faint',
            )}
          />
          <Text className="text-[11px] font-semibold text-ink-muted dark:text-ink-dark-muted">
            {sourceLabel(data.provider.active, data.provider.live)}
          </Text>
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            · {data.marketOpen ? 'Market open' : 'Market closed'}
            {updated ? ` · Updated ${updated} IST` : ''}
          </Text>
          {heatmap.isFetching && !heatmap.isPending ? (
            <ActivityIndicator
              size="small"
              color={colors.textFaint}
              style={{ transform: [{ scale: 0.6 }] }}
            />
          ) : null}
          {data.provider.fallbackUsed ? (
            <Text className="w-full text-[11px] text-warning-600 dark:text-warning-dark">
              Groww answered partly — mStock filled the gaps.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="mt-3" style={{ opacity: heatmap.isPlaceholderData ? 0.6 : 1 }}>
        {body}
      </View>
    </View>
  );

  const footer = data ? (
    <View className="mt-4 gap-3">
      <HeatmapLegend />
      <Text className="text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        {formatNumber(displayed.length, 0)} of {formatNumber(data.stocks.length, 0)} constituents ·
        size = market cap · colour = {timeframe} price change. Colours show past movement only — not
        a buy or sell call. Data may be delayed.
      </Text>
    </View>
  ) : null;

  const gridMode = viewMode === 'grid' && displayed.length > 0;

  return (
    <GroupScreen scroll={false}>
      <FlatList
        key={viewMode}
        data={gridMode ? displayed : []}
        numColumns={3}
        keyExtractor={(stock) => `${stock.exchange}:${stock.symbol}`}
        renderItem={({ item }) => (
          <HeatmapTile
            stock={item}
            width={tileWidth}
            height={GRID_TILE_HEIGHT}
            onPress={openStock}
          />
        )}
        columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
        ListHeaderComponent={
          <View style={{ marginBottom: gridMode ? GRID_GAP * 2 : 0 }}>{header}</View>
        }
        ListFooterComponent={footer}
        // Capped like every GroupScreen body, so the grid's tile width (from the same cap)
        // fills the row on a tablet too.
        contentContainerStyle={{
          width: '100%',
          maxWidth: MAX_CONTENT_WIDTH,
          alignSelf: 'center',
          paddingHorizontal: 20,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={30}
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

      <IndexPickerSheet
        visible={pickerOpen}
        indices={indices.data ?? []}
        value={indexKey}
        onSelect={setIndexKey}
        onClose={() => setPickerOpen(false)}
      />
      <HeatmapOptionsSheet
        visible={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        groupBySector={groupBySector}
        onGroupBySector={setGroupBySector}
        groupingEnabled={viewMode === 'treemap'}
        sort={sort}
        onSort={setSort}
        provider={provider}
        onProvider={setProvider}
      />
    </GroupScreen>
  );
}
