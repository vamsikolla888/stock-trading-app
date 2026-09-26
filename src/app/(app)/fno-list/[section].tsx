import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Input } from '@/components/ui/Input';
import { RowDivider } from '@/components/ui/Section';
import { RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { InstrumentRow } from '@/features/fno/components/ExploreCards';
import { Freshness, sourceLabel } from '@/features/fno/components/FnoChrome';
import { InstrumentMark } from '@/features/fno/components/Glyphs';
import { useExploreSection } from '@/features/fno/hooks';
import {
  chainHref,
  filterExploreRows,
  isChainExchange,
  isExploreSection,
  liveMove,
  periodBase,
  PERIODS,
  SECTION_META,
  type ListOrder,
} from '@/features/fno/lib/explore';
import {
  daysUntil,
  dteLabel,
  expiryLabel,
  futureTitle,
  level,
  venueOf,
} from '@/features/fno/lib/format';
import type {
  ExploreFuture,
  ExplorePeriod,
  ExploreSection,
  ExploreUnderlying,
} from '@/features/fno/types';
import { cn } from '@/lib/utils/cn';
import { formatCompactNumber, formatINR, formatINRCompact } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

const ORDERS: readonly { key: ListOrder; label: string }[] = [
  { key: 'rank', label: 'Most traded' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
];

type Row = ExploreUnderlying | ExploreFuture;
const isFuture = (row: Row): row is ExploreFuture => 'tradingSymbol' in row;

/**
 * /fno-list/[section] — one Explore shelf in full ("See more"). Same server dataset as the
 * landing page, so a row here is the row that was ranked there. Filtering is local; F&O stocks
 * can be re-ordered by the chosen period's move.
 */
export default function FnoListScreen() {
  const params = useLocalSearchParams<{ section?: string; q?: string }>();
  const section = isExploreSection(params.section) ? params.section : null;
  if (!section) return <Redirect href="/fno" />;
  // A new `q` (search → "commodity futures filtered to GOLD") is a new list: keyed, so the
  // filter starts from it instead of being synced into state after the first render.
  return (
    <FnoList
      key={`${section}:${params.q ?? ''}`}
      section={section}
      initialFilter={params.q ?? ''}
    />
  );
}

function FnoList({ section, initialFilter }: { section: ExploreSection; initialFilter: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const meta = SECTION_META[section];
  const query = useExploreSection(section);
  const [filter, setFilter] = useState(initialFilter);
  const [period, setPeriod] = useState<ExplorePeriod>('d1');
  const [order, setOrder] = useState<ListOrder>('rank');
  const [refreshing, setRefreshing] = useState(false);

  const allRows = useMemo<Row[]>(() => query.data?.rows ?? [], [query.data]);
  const rows = useMemo(
    () =>
      filterExploreRows(allRows, {
        query: filter,
        order: section === 'stocks' ? order : 'rank',
        period,
      }),
    [allRows, filter, section, order, period],
  );
  const shownPeriod: ExplorePeriod = section === 'stocks' ? period : 'd1';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [query]);

  const renderItem = useCallback(
    ({ item, index }: { item: Row; index: number }) => {
      const first = index === 0;
      const last = index === rows.length - 1;
      const frame = cn(
        'border-x border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
        first && 'rounded-t-card border-t',
        last && 'rounded-b-card border-b',
      );
      if (isFuture(item)) {
        const move = liveMove(item.ltp, item.prevClose);
        const commodity = meta.kind === 'commodities';
        const exchange = item.exchange;
        const value = item.ltp != null ? item.ltp * item.lotSize : null;
        return (
          <View className={cn(frame, 'overflow-hidden')}>
            <InstrumentRow
              mark={
                <InstrumentMark
                  kind={commodity ? 'commodity' : item.logoSymbol ? 'stock' : 'index'}
                  underlying={item.underlying}
                  logoSymbol={item.logoSymbol}
                />
              }
              title={futureTitle(item.label, item.expiry)}
              meta={`${venueOf(item.exchange)} · lot ${item.lotSize.toLocaleString('en-IN')} · ${dteLabel(daysUntil(item.expiry))}`}
              price={item.ltp != null ? formatINR(item.ltp) : '—'}
              change={move.change ?? item.change}
              changePct={move.changePct ?? item.changePct}
              trailing={value != null ? `Value ${formatINRCompact(value)}` : null}
              onPress={
                !commodity && isChainExchange(exchange)
                  ? () => router.push(chainHref(exchange, item.underlying, { tab: 'futures' }))
                  : null
              }
            />
          </View>
        );
      }
      const move = liveMove(item.ltp, periodBase(item, shownPeriod));
      return (
        <View className={cn(frame, 'overflow-hidden')}>
          <InstrumentRow
            mark={
              <InstrumentMark
                kind={item.isIndex ? 'index' : 'stock'}
                underlying={item.underlying}
                logoSymbol={item.spotSymbol}
              />
            }
            title={item.label}
            meta={`${item.underlying} · ${venueOf(item.exchange)} · lot ${item.lotSize?.toLocaleString('en-IN') ?? '—'} · ${expiryLabel(item.nearestExpiry)}`}
            price={item.ltp == null ? '—' : item.isIndex ? level(item.ltp) : formatINR(item.ltp)}
            change={move.change}
            changePct={move.changePct}
            trailing={item.volume != null ? `Vol ${formatCompactNumber(item.volume)}` : null}
            onPress={() => router.push(chainHref(item.exchange, item.underlying))}
          />
        </View>
      );
    },
    [rows.length, meta.kind, router, shownPeriod],
  );

  const rankText = meta.rank && query.data ? query.data.ranking[meta.rank] : null;
  const source =
    meta.kind === 'commodities'
      ? query.data?.sources.commodities
      : meta.kind === 'futures'
        ? query.data?.sources.futures
        : query.data?.sources.equity;

  const listHeader = (
    <View className="gap-3 pb-3">
      {rankText ? (
        <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
          {rankText}
        </Text>
      ) : null}
      {meta.kind === 'commodities' && query.data?.commodityNote ? (
        <Text className="text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
          {query.data.commodityNote}
        </Text>
      ) : null}
      <Input
        value={filter}
        onChangeText={setFilter}
        placeholder={`Filter ${meta.title.toLowerCase()}`}
        autoCapitalize="characters"
        autoCorrect={false}
        accessibilityLabel={`Filter ${meta.title}`}
        leftIcon={<Search size={18} color={colors.textMuted} />}
      />
      {section === 'stocks' ? (
        <View className="gap-2">
          <SegmentedControl items={ORDERS} value={order} onChange={setOrder} />
          <View className="flex-row items-center justify-between">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Move over</Text>
            <RangeSelector items={PERIODS} value={period} onChange={setPeriod} />
          </View>
        </View>
      ) : null}
      <View className="flex-row items-start gap-3">
        <Freshness
          className="flex-1"
          asOf={query.data?.asOf}
          updatedAt={query.dataUpdatedAt}
          refreshFailed={query.isError && !!query.data}
        />
        {query.data ? (
          <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
            {rows.length.toLocaleString('en-IN')} of {allRows.length.toLocaleString('en-IN')}
          </Text>
        ) : null}
      </View>
    </View>
  );

  return (
    <StackScreen
      title={meta.title}
      subtitle={source ? `F&O · ${sourceLabel(source)}` : 'F&O'}
      scroll={false}
    >
      {query.isLoading ? (
        <View className="px-5 pt-4">
          {listHeader}
          <ListSkeleton rows={8} />
        </View>
      ) : query.isError && !query.data ? (
        <View className="px-5 pt-4">
          <InlineError
            what={meta.title.toLowerCase()}
            error={query.error}
            onRetry={() => void query.refetch()}
          />
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) =>
            isFuture(row)
              ? `${row.exchange}:${row.tradingSymbol}`
              : `${row.exchange}:${row.underlying}`
          }
          renderItem={renderItem}
          ItemSeparatorComponent={() => (
            <View className="border-x border-line bg-surface dark:border-line-dark dark:bg-surface-dark">
              <RowDivider />
            </View>
          )}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={
            <InlineEmpty
              title={filter ? `Nothing matches “${filter}”` : 'Nothing to show'}
              message={
                section === 'stocks' && order !== 'rank'
                  ? 'Stocks with no move for this period are not ranked.'
                  : undefined
              }
            />
          }
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={14}
          windowSize={9}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        />
      )}
    </StackScreen>
  );
}
