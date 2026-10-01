import { useLocalSearchParams, useRouter } from 'expo-router';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import Link2 from 'lucide-react-native/icons/link-2';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { StockLogo } from '@/components/market/StockLogo';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { KeyValueRow } from '@/components/ui/KeyValueRow';
import { Tabs } from '@/components/ui/Tabs';
import { useLiveCandles } from '@/features/charts/useLiveCandles';
import { FuturesList } from '@/features/fno/components/FuturesList';
import { OrderTicket, type TicketTarget } from '@/features/fno/components/OrderTicket';
import { SearchSheet } from '@/features/fno/components/SearchSheet';
import { UnderlyingChart, type ChartScrub } from '@/features/fno/components/UnderlyingChart';
import {
  useFnoFutures,
  useFnoUnderlyings,
  useOptionChain,
  useUnderlyingCandles,
} from '@/features/fno/hooks';
import { barTimeLabel, chartAnchor } from '@/features/fno/lib/candles';
import {
  chainHref,
  fnoChartHref,
  parseChainParams,
  underlyingHref,
} from '@/features/fno/lib/explore';
import { DASH, dteLabel, expiryLabel, formatStrike, venueOf } from '@/features/fno/lib/format';
import { lastSession, underlyingRange, type UnderlyingRange } from '@/features/fno/lib/underlying';
import type { FnoContract, FnoSide } from '@/features/fno/types';
import { stockLogoUrl } from '@/features/market/api';
import { liveKey, overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote, useLiveQuotes } from '@/features/market/live';
import { useNow } from '@/hooks/useNow';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const NUM = { fontVariant: ['tabular-nums' as const] };
const MINUS = '−';

type Section = 'overview' | 'futures';
const SECTIONS: readonly { key: Section; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'futures', label: 'Futures' },
];

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? MINUS : ''}${formatNumber(Math.abs(n))}`;

/**
 * /fno-underlying?exchange=BFO&underlying=SENSEX — an index's (or F&O stock's) own screen, laid
 * out like Groww's: the price and the day's move, a candlestick chart edge to edge with a
 * full-screen button and the ranges under it, then Overview / Futures, with Chart and Chain
 * pinned at the bottom.
 *
 * Everything is live: the price streams from the F&O feed (the viewer's Groww session; else the
 * polled spot), and the forming candle follows it. The day's move is measured from the previous
 * session's last close in the intraday bars — the same baseline Groww uses — so it reads right
 * even where the spot feed carries no change of its own.
 */
export default function UnderlyingScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    exchange?: string | string[];
    underlying?: string | string[];
  }>();
  const { exchange, underlying } = parseChainParams(params);

  const [range, setRange] = useState<UnderlyingRange>('1D');
  const [chartType, setChartType] = useState<'candles' | 'line'>('candles');
  const [section, setSection] = useState<Section>('overview');
  const [scrub, setScrub] = useState<ChartScrub | null>(null);
  const [ticket, setTicket] = useState<TicketTarget | null>(null);
  const [searching, setSearching] = useState(false);

  const universe = useFnoUnderlyings();
  const meta =
    universe.data?.underlyings.find(
      (u) => u.exchange === exchange && u.underlying === underlying,
    ) ?? null;
  const futures = useFnoFutures(exchange, underlying, meta?.hasFutures !== false);
  // An underlying without futures (rare) is charted through its chain instead — one strike is
  // enough to name it to the candles API.
  const needChain = meta !== null && !meta.hasFutures && meta.hasOptions;
  const chain = useOptionChain(exchange, underlying, null, 1, needChain);
  const anchor = chartAnchor(needChain ? 'options' : 'futures', chain.data, futures.data);

  const day = useUnderlyingCandles(exchange, underlying, anchor, '1D');
  const ranged = useUnderlyingCandles(exchange, underlying, anchor, range);
  const spec = underlyingRange(range);
  const { session, prevClose } = useMemo(() => lastSession(day.data?.bars ?? []), [day.data]);

  // Live: the cash/index listing on the F&O feed, and every future for the Futures tab.
  const spotExchange = exchange === 'BFO' ? 'BSE' : 'NSE';
  const spotQuote = useLiveQuote(spotExchange, meta?.spotSymbol, { mode: 'fno' });
  const futureQuotes = useLiveQuotes(
    section === 'futures'
      ? (futures.data?.futures ?? []).map((f) => ({
          exchange: f.contract.exchange,
          symbol: f.contract.tradingSymbol,
        }))
      : [],
    { mode: 'fno' },
  );

  const now = useNow(15_000);
  const marketOpen = isMarketOpen(new Date(now));
  const lastBar = session[session.length - 1];
  const price = spotQuote?.ltp ?? futures.data?.spot ?? lastBar?.close ?? null;

  const rangeBars = range === '1D' ? session : (ranged.data?.bars ?? []);
  const bars = useLiveCandles(
    rangeBars,
    marketOpen ? price : null,
    spec.barSeconds,
    marketOpen,
    `${exchange}:${underlying}:${range}`,
  );

  // The headline: the scrubbed bar while the finger is on the chart, else the live price.
  const shown = scrub?.value ?? price;
  const reference = range === '1D' ? prevClose : (bars[0]?.open ?? null);
  const move = overlayQuote({ price: shown, prevClose: reference }, undefined);
  const moveLabel = scrub
    ? barTimeLabel(scrub.time, spec.intraday)
    : range === '1D'
      ? marketOpen
        ? '1D'
        : '1D · last session'
      : spec.label;

  const openFullChart = useCallback(() => {
    if (!anchor) return;
    router.push(
      fnoChartHref({
        exchange,
        target: 'underlying',
        subject: underlying,
        anchor: anchor.tradingSymbol,
        label: underlying,
        spotSymbol: meta?.spotSymbol,
        prevClose,
        fullscreen: true,
      }),
    );
  }, [anchor, exchange, meta?.spotSymbol, prevClose, router, underlying]);

  const onTradeFuture = useCallback((contract: FnoContract, side: FnoSide) => {
    setTicket({ contract, leg: null, side, nonce: Date.now() });
  }, []);

  // Day's range from today's session: what Groww's "Today's low / high" bar reads.
  const dayStats = useMemo(() => {
    if (session.length === 0) return null;
    return {
      open: session[0]!.open,
      high: Math.max(...session.map((b) => b.high), price ?? 0),
      low: Math.min(...session.map((b) => b.low), price ?? Number.POSITIVE_INFINITY),
    };
  }, [session, price]);

  const liveFutures = useMemo(() => {
    const base = futures.data;
    if (!base || futureQuotes.size === 0) return base;
    return {
      ...base,
      futures: base.futures.map((row) => {
        const quote = futureQuotes.get(liveKey(row.contract.exchange, row.contract.tradingSymbol));
        if (!quote) return row;
        const view = overlayQuote(
          { price: row.ltp, changeAbs: row.dayChange, changePct: row.dayChangePct },
          quote,
        );
        return { ...row, ltp: view.price, dayChange: view.change, dayChangePct: view.changePct };
      }),
    };
  }, [futures.data, futureQuotes]);

  const ticketLtp = ticket
    ? (liveFutures?.futures.find((f) => f.contract.tradingSymbol === ticket.contract.tradingSymbol)
        ?.ltp ?? null)
    : null;

  const chartMessage = ranged.error
    ? 'The chart couldn’t be loaded.'
    : range === '1D'
      ? (day.data?.unavailableReason ?? null)
      : (ranged.data?.unavailableReason ?? null);
  const anchorMissing =
    !anchor && !futures.isPending && !(needChain && chain.isPending) && meta !== null;

  const footer = (
    <View className="flex-row gap-3 border-t border-line bg-surface px-5 py-3 dark:border-line-dark dark:bg-surface-dark">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open the full ${underlying} chart`}
        disabled={!anchor}
        onPress={openFullChart}
        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-field border border-line active:bg-surface-sunk disabled:opacity-50 dark:border-line-dark dark:active:bg-surface-sunk-dark"
      >
        <ChartCandlestick size={18} color={colors.text} />
        <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">Chart</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open the ${underlying} option chain`}
        disabled={meta?.hasOptions === false}
        onPress={() => router.push(chainHref(exchange, underlying))}
        className="h-12 flex-1 flex-row items-center justify-center gap-2 rounded-field border border-line active:bg-surface-sunk disabled:opacity-50 dark:border-line-dark dark:active:bg-surface-sunk-dark"
      >
        <Link2 size={18} color={colors.text} />
        <Text className="text-[15px] font-semibold text-ink dark:text-ink-dark">Chain</Text>
      </Pressable>
    </View>
  );

  return (
    <StackScreen
      title={meta?.name ?? underlying}
      subtitle={`${underlying} · ${venueOf(exchange)} · ${meta?.isIndex === false ? 'Stock' : 'Index'}`}
      footer={footer}
      onRefresh={() =>
        Promise.all([futures.refetch(), day.refetch(), range === '1D' ? null : ranged.refetch()])
      }
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search F&O underlyings"
          hitSlop={8}
          onPress={() => setSearching(true)}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <Search size={20} color={colors.text} />
        </Pressable>
      }
    >
      <StockLogo
        symbol={meta?.logoSymbol ?? underlying}
        uri={meta?.isIndex ? undefined : stockLogoUrl(meta?.logoSymbol ?? underlying)}
        size="lg"
      />
      <Text className="mt-3 text-[17px] text-ink dark:text-ink-dark" numberOfLines={1}>
        {meta?.name ?? underlying}
      </Text>

      <View className="mt-2 flex-row items-end justify-between gap-3">
        <View className="min-w-0 flex-1" accessibilityLiveRegion="polite">
          <LiveFlash seq={scrub ? undefined : spotQuote?.seq} dir={spotQuote?.dir}>
            <Text
              className="text-[32px] font-bold text-ink dark:text-ink-dark"
              style={[NUM, { letterSpacing: -1 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {shown != null ? formatNumber(shown) : DASH}
            </Text>
          </LiveFlash>
          <View className="mt-0.5 flex-row items-center gap-1.5">
            <ChangeText value={move.change} className="text-[13px]" style={NUM}>
              {move.change !== null
                ? `${signed(move.change)} (${formatSignedPercent(move.changePct).replace(/^[+−-]/, '')})`
                : DASH}
            </ChangeText>
            <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">{moveLabel}</Text>
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open the ${underlying} option chain`}
          disabled={meta?.hasOptions === false}
          onPress={() => router.push(chainHref(exchange, underlying))}
          className="mb-1 h-12 w-12 items-center justify-center rounded-full border border-line active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Link2 size={20} color={colors.text} />
        </Pressable>
      </View>

      <View className="mt-4">
        {anchorMissing ? (
          <InlineEmpty
            title="No chart for this underlying"
            message={`${underlying} has no listed derivative to chart it through right now.`}
          />
        ) : (
          <UnderlyingChart
            bars={bars}
            loading={(range === '1D' ? day.isPending : ranged.isPending) || !anchor}
            message={chartMessage}
            onRetry={ranged.isError ? () => void ranged.refetch() : undefined}
            baseline={range === '1D' ? prevClose : null}
            range={range}
            onRangeChange={(next) => {
              setScrub(null);
              setRange(next);
            }}
            type={chartType}
            onTypeChange={setChartType}
            onScrub={setScrub}
            onFullScreen={openFullChart}
            stale={range !== '1D' && ranged.isPlaceholderData}
          />
        )}
      </View>

      <Tabs items={SECTIONS} value={section} onChange={setSection} className="mt-5" />

      {section === 'overview' ? (
        <View className="mt-2">
          <KeyValueRow
            label="Today’s low – high"
            value={
              dayStats ? `${formatNumber(dayStats.low)} – ${formatNumber(dayStats.high)}` : DASH
            }
          />
          <KeyValueRow label="Open" value={dayStats ? formatNumber(dayStats.open) : DASH} divider />
          <KeyValueRow
            label="Previous close"
            value={prevClose != null ? formatNumber(prevClose) : DASH}
            divider
          />
          <KeyValueRow
            label="Nearest expiry"
            value={meta ? `${expiryLabel(meta.nearestExpiry)} · ${meta.expiryCount} listed` : DASH}
            divider
          />
          <KeyValueRow
            label="Lot size"
            value={meta?.lotSize != null ? formatStrike(meta.lotSize) : DASH}
            divider
          />
          {futures.data?.futures[0] ? (
            <KeyValueRow
              label="Nearest future"
              value={`${formatINR(futures.data.futures[0].ltp)} · ${dteLabel(futures.data.futures[0].daysToExpiry)}`}
              divider
            />
          ) : null}
          {day.data?.source ? (
            <Text className="mt-3 text-[11px] text-ink-faint dark:text-ink-dark-faint">
              Bars from{' '}
              {day.data.source === 'groww' ? 'Groww historical data' : 'the platform feed (mStock)'}
              {spotQuote && marketOpen ? ' · the price streams live' : ''}.
            </Text>
          ) : null}
        </View>
      ) : futures.isPending ? (
        <View className="mt-4">
          <ListSkeleton rows={3} />
        </View>
      ) : futures.isError && !futures.data ? (
        <InlineError
          className="mt-4"
          what="futures"
          error={futures.error}
          onRetry={() => void futures.refetch()}
        />
      ) : liveFutures && liveFutures.futures.length > 0 ? (
        <View className="mt-4">
          <FuturesList data={liveFutures} onTrade={onTradeFuture} />
        </View>
      ) : (
        <InlineEmpty
          className="mt-4"
          title="No futures listed"
          message={`${underlying} has no live futures.`}
        />
      )}

      <SearchSheet
        visible={searching}
        onClose={() => setSearching(false)}
        onPickUnderlying={(u) => router.replace(underlyingHref(u.exchange, u.underlying))}
        onPickContract={(c) =>
          router.push(
            chainHref(
              c.exchange,
              c.underlying,
              c.kind === 'FUT' ? { tab: 'futures' } : { expiry: c.expiry },
            ),
          )
        }
      />
      <OrderTicket target={ticket} ltp={ticketLtp} onClose={() => setTicket(null)} />
    </StackScreen>
  );
}
