import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, SectionList, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { Chips } from '@/components/ui/Tabs';
import { CommodityGlyph, IndexGlyph } from '@/features/fno/components/Glyphs';
import { useExpiryCalendar } from '@/features/fno/hooks';
import { calendarEntryHref, isChainExchange } from '@/features/fno/lib/explore';
import { dayHeading, dteLabel, venueOf } from '@/features/fno/lib/format';
import type { ExpiryEntry } from '@/features/fno/types';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'index', label: 'Indices' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'commodity', label: 'Commodities' },
] as const;
type Filter = (typeof FILTERS)[number]['key'];

function contracts(e: ExpiryEntry): string {
  if (e.hasOptions && e.hasFutures) return 'Futures & options';
  return e.hasFutures ? 'Futures' : 'Options';
}

/**
 * /fno-expiries — every contract expiry in the next ~45 days, from Groww's instrument master:
 * Groww's commodity expiry calendar widened to index and stock F&O. Stock F&O shares one
 * monthly expiry, so it is ONE line per date with a count; indices and commodities are listed
 * individually, and an index opens its option chain at that expiry.
 */
export default function FnoExpiriesScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const cal = useExpiryCalendar();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const sections = useMemo(
    () =>
      (cal.data?.days ?? [])
        .map((d) => ({
          key: d.date,
          date: d.date,
          daysToExpiry: d.daysToExpiry,
          data: d.entries.filter((e) => filter === 'all' || e.kind === filter),
        }))
        .filter((d) => d.data.length > 0),
    [cal.data, filter],
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await cal.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [cal]);

  const header = (
    <View className="gap-3 pb-2">
      <Text className="text-xs leading-[17px] text-ink-muted dark:text-ink-dark-muted">
        Every index, stock and MCX commodity expiry in the next {cal.data?.windowDays ?? 45} days,
        as Groww’s instrument master lists them. Stock F&amp;O shares one expiry and is counted on a
        single line.
      </Text>
      <Chips items={FILTERS} value={filter} onChange={setFilter} />
    </View>
  );

  return (
    <StackScreen title="Expiry calendar" subtitle="F&O · next 45 days" scroll={false}>
      {cal.isLoading ? (
        <View className="px-5 pt-4">
          {header}
          <ListSkeleton rows={6} />
        </View>
      ) : cal.isError && !cal.data ? (
        <View className="px-5 pt-4">
          <InlineError
            what="the expiry calendar"
            error={cal.error}
            onRetry={() => void cal.refetch()}
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(e) => `${e.kind}:${e.exchange}:${e.underlying ?? 'stocks'}`}
          stickySectionHeadersEnabled
          ListHeaderComponent={header}
          ListEmptyComponent={<InlineEmpty title="No expiries in this window" />}
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 }}
          renderSectionHeader={({ section }) => (
            <View className="flex-row items-center justify-between bg-canvas pb-2 pt-4 dark:bg-canvas-dark">
              <Text
                accessibilityRole="header"
                className="text-[15px] font-bold text-ink dark:text-ink-dark"
              >
                {dayHeading(section.date)}
              </Text>
              <Badge
                label={dteLabel(section.daysToExpiry)}
                variant={section.daysToExpiry <= 1 ? 'warning' : 'neutral'}
              />
            </View>
          )}
          renderItem={({ item, index, section }) => {
            const opens =
              item.kind === 'index' && item.underlying != null && isChainExchange(item.exchange);
            const exchange = item.exchange;
            const underlying = item.underlying;
            const first = index === 0;
            const last = index === section.data.length - 1;
            const sub = `${item.kind === 'stocks' ? `${item.count} stock${item.count === 1 ? '' : 's'} · ` : ''}${contracts(item)} · ${venueOf(item.exchange)}`;
            return (
              <Pressable
                accessibilityRole={opens ? 'button' : undefined}
                accessibilityLabel={`${item.label}, ${sub}${
                  opens
                    ? item.hasOptions
                      ? ', opens the option chain'
                      : ', opens its futures'
                    : ''
                }`}
                disabled={!opens}
                onPress={
                  opens && underlying && isChainExchange(exchange)
                    ? () =>
                        router.push(
                          calendarEntryHref(exchange, underlying, section.date, item.hasOptions),
                        )
                    : undefined
                }
                className={[
                  'flex-row items-center gap-3 border-x border-line bg-surface px-3.5 py-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark',
                  first ? 'rounded-t-card border-t' : 'border-t',
                  last ? 'rounded-b-card border-b' : '',
                ].join(' ')}
              >
                {item.kind === 'commodity' ? (
                  <CommodityGlyph underlying={item.underlying ?? ''} size={32} />
                ) : item.kind === 'index' ? (
                  <IndexGlyph underlying={item.underlying ?? ''} size={32} />
                ) : (
                  <View
                    className="items-center justify-center bg-surface-sunk dark:bg-surface-sunk-dark"
                    style={{ width: 32, height: 32, borderRadius: 10 }}
                  >
                    <Text className="text-[10px] font-extrabold text-ink-muted dark:text-ink-dark-muted">
                      STK
                    </Text>
                  </View>
                )}
                <View className="min-w-0 flex-1">
                  <Text
                    className={
                      opens
                        ? 'text-sm font-semibold text-brand-text dark:text-brand-text-dark'
                        : 'text-sm font-semibold text-ink dark:text-ink-dark'
                    }
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {sub}
                  </Text>
                </View>
              </Pressable>
            );
          }}
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
