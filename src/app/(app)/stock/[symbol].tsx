import { useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Star from 'lucide-react-native/icons/star';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { StackScreen } from '@/components/navigation/StackScreen';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { formatIstDateTime, formatIstTime, istDayKey } from '@/features/home/lib/istTime';
import { useTodayPicks } from '@/features/insights/api';
import {
  marketKeys,
  useCandles,
  useRecordStockView,
  useStockDetail,
} from '@/features/market/hooks';
import { AnalysisTab } from '@/features/stock/components/AnalysisTab';
import { NewsTab } from '@/features/stock/components/NewsTab';
import { OverviewTab } from '@/features/stock/components/OverviewTab';
import { PriceChartSection } from '@/features/stock/components/PriceChartSection';
import { StockHeader } from '@/features/stock/components/StockHeader';
import { newsSymbolFor, stockPriceView } from '@/features/stock/lib/priceView';
import { parseStockParams } from '@/features/stock/lib/routeParams';
import { useListsContaining } from '@/features/watchlists/hooks';
import { useNow } from '@/hooks/useNow';
import { orderHref } from '@/lib/navigation';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

type DetailTab = 'overview' | 'analysis' | 'news';

const TABS: readonly { key: DetailTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'analysis', label: 'Analysis' },
  { key: 'news', label: 'News' },
];

/** Today's published levels for this listing, shown under the chart as a reference. */
function RecommendationLevels({
  entryLow,
  entryHigh,
  target,
  stop,
}: {
  entryLow: number | null;
  entryHigh: number | null;
  target: number | null;
  stop: number | null;
}) {
  const entry =
    entryLow !== null && entryHigh !== null
      ? `${formatINR(entryLow, 0)}–${formatINR(entryHigh, 0)}`
      : formatINR(entryLow ?? entryHigh);
  const chips = [
    { label: 'Entry', value: entry, bar: 'bg-ink-faint dark:bg-ink-dark-faint' },
    { label: 'Target', value: formatINR(target), bar: 'bg-brand-strong dark:bg-brand-strong-dark' },
    { label: 'Stop', value: formatINR(stop), bar: 'bg-danger-500 dark:bg-danger-dark' },
  ];
  return (
    <View className="mt-3">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">
        From today’s recommendation
      </Text>
      <View className="mt-1.5 flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <View
            key={chip.label}
            accessible
            accessibilityLabel={`${chip.label} ${chip.value}`}
            className="flex-row overflow-hidden rounded-lg bg-surface-sunk dark:bg-surface-sunk-dark"
          >
            <View className={cn('w-1 self-stretch', chip.bar)} />
            <Text
              className="px-2.5 py-1.5 text-[11px] font-medium text-ink dark:text-ink-dark"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {chip.label} {chip.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One stock, Groww-style: identity and exchange switch, live price and chart, then
 * Overview (performance, our view, about, alerts), Analysis (technicals, indicators, the
 * full case, news sentiment) and News. Buy / Sell stay pinned to the bottom.
 */
export default function StockDetailScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{
    symbol?: string | string[];
    exchange?: string | string[];
  }>();
  const { symbol, exchange } = parseStockParams(params);

  const detail = useStockDetail(symbol, exchange);
  // `mutate` is stable across renders, so this records once per stock opened.
  const { mutate: recordView } = useRecordStockView();
  const watch = useListsContaining(exchange, symbol);
  const picks = useTodayPicks();
  const [tab, setTab] = useState<DetailTab>('overview');
  // Re-read each minute so the page flips to "closed" at 15:30 and "today" rolls over at
  // midnight without a manual refresh.
  const now = useNow();
  const marketOpen = isMarketOpen(new Date(now));
  const todayIst = istDayKey(now) ?? '';

  const data = detail.data;

  // Recorded once the stock is known to exist, under its catalogue key: the server rejects
  // an unknown symbol, so recording from the raw link would fail for every mistyped one.
  const viewedExchange = data?.exchange;
  const viewedSymbol = data?.symbol;
  useEffect(() => {
    if (viewedExchange && viewedSymbol)
      recordView({ exchange: viewedExchange, symbol: viewedSymbol });
  }, [recordView, viewedExchange, viewedSymbol]);

  // The latest daily bar is only needed when the snapshot's volume isn't today's.
  const needDailyVolume = Boolean(data) && istDayKey(data?.volumeAsOf) !== todayIst;
  const daily = useCandles(symbol, exchange, '1Y', needDailyVolume || tab === 'analysis');
  const lastBar = daily.data?.[daily.data.length - 1] ?? null;
  const view = useMemo(() => stockPriceView(data, lastBar, todayIst), [data, lastBar, todayIst]);

  const pick = picks.data?.recommendations.find(
    (rec) => rec.sym === symbol && rec.exch === exchange,
  );
  const displaySymbol =
    data?.listings?.find((listing) => listing.exchange === exchange)?.displaySymbol ?? symbol;
  const watched = watch.containing.size > 0;
  // No symbol in the link, no such stock (404), or one the API refuses to look up (422).
  const notFound =
    !symbol ||
    (!data &&
      isApiError(detail.error) &&
      (detail.error.status === 404 || detail.error.status === 422));

  const priceNote = !data
    ? null
    : view.ltp === null
      ? 'No price is available for this listing.'
      : data.priceSource === 'snapshot'
        ? `The broker didn’t answer — last saved price${
            data.priceAsOf ? `, from ${formatIstDateTime(data.priceAsOf)} IST` : ''
          }.`
        : data.priceSource === 'broker' && data.priceAsOf
          ? `Broker price as of ${formatIstTime(data.priceAsOf)} IST`
          : null;

  const onRefresh = useCallback(
    () =>
      Promise.all([
        detail.refetch(),
        queryClient.invalidateQueries({
          queryKey: [...marketKeys.all, 'candles', exchange, symbol],
        }),
      ]),
    [detail, queryClient, exchange, symbol],
  );

  const footer = data ? (
    <View className="flex-row gap-2.5 border-t border-line bg-surface px-5 py-3 dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Buy ${displaySymbol}`}
        onPress={() => router.push(orderHref(symbol, exchange, 'BUY'))}
        className="h-12 flex-1 items-center justify-center rounded-field bg-brand-strong active:opacity-90 dark:bg-brand-strong-dark"
      >
        <Text className="text-[15px] font-bold text-white">Buy</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Sell ${displaySymbol}`}
        onPress={() => router.push(orderHref(symbol, exchange, 'SELL'))}
        className="h-12 flex-1 items-center justify-center rounded-field bg-danger-600 active:opacity-90"
      >
        <Text className="text-[15px] font-bold text-white">Sell</Text>
      </Pressable>
    </View>
  ) : undefined;

  return (
    <StackScreen
      title={displaySymbol || 'Stock'}
      subtitle={exchange}
      onRefresh={symbol ? onRefresh : undefined}
      footer={footer}
      right={
        notFound ? undefined : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={watched ? 'In your watchlist — manage lists' : 'Add to watchlist'}
            hitSlop={8}
            onPress={() =>
              router.push({ pathname: '/watchlist-picker', params: { symbol, exchange } })
            }
            className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <Star
              size={22}
              color={watched ? colors.accent : colors.text}
              fill={watched ? colors.accent : 'none'}
            />
          </Pressable>
        )
      }
    >
      {notFound ? (
        <View className="gap-4">
          <Banner
            tone="info"
            title="Stock not found"
            message={
              symbol
                ? `${exchange}:${symbol} isn’t in our stock catalogue. Check the symbol, or search for the company instead.`
                : 'This link doesn’t name a stock. Search for the company instead.'
            }
          />
          <Button
            label="Search stocks"
            variant="outline"
            onPress={() => router.replace('/search')}
          />
        </View>
      ) : (
        <>
          <StockHeader symbol={symbol} exchange={exchange} detail={data} marketOpen={marketOpen} />
          {detail.error && !data ? (
            <InlineError
              className="mt-6"
              what="this stock"
              error={detail.error}
              onRetry={() => void detail.refetch()}
            />
          ) : (
            <>
              <PriceChartSection
                symbol={symbol}
                exchange={exchange}
                ltp={view.ltp}
                prevClose={view.prevClose}
                marketOpen={marketOpen}
                note={priceNote}
              />
              {pick ? (
                <RecommendationLevels
                  entryLow={pick.lo}
                  entryHigh={pick.hi}
                  target={pick.target}
                  stop={pick.stop}
                />
              ) : null}
              <Tabs items={TABS} value={tab} onChange={setTab} className="mt-4" />
              {data ? (
                tab === 'overview' ? (
                  <OverviewTab
                    detail={data}
                    view={view}
                    marketOpen={marketOpen}
                    pick={pick}
                    batchDate={picks.data?.date}
                    picksLoading={picks.isPending}
                    onReadCase={() => setTab('analysis')}
                  />
                ) : tab === 'analysis' ? (
                  <AnalysisTab
                    detail={data}
                    ltp={view.ltp}
                    pick={pick}
                    batchDate={picks.data?.date}
                  />
                ) : (
                  <NewsTab
                    newsSymbol={newsSymbolFor(data.symbol, exchange, data.listings)}
                    displaySymbol={displaySymbol}
                  />
                )
              ) : (
                <View className="mt-6 gap-3" accessibilityLabel="Loading stock details">
                  <View className="h-24 rounded-card bg-line dark:bg-line-dark" />
                  <View className="h-32 rounded-card bg-line dark:bg-line-dark" />
                </View>
              )}
            </>
          )}
        </>
      )}
    </StackScreen>
  );
}
