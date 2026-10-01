import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Activity from 'lucide-react-native/icons/activity';
import ChartCandlestick from 'lucide-react-native/icons/chart-candlestick';
import ChartLine from 'lucide-react-native/icons/chart-line';
import ChevronsRight from 'lucide-react-native/icons/chevrons-right';
import Maximize2 from 'lucide-react-native/icons/maximize-2';
import Minimize2 from 'lucide-react-native/icons/minimize-2';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { LiveFlash } from '@/components/market/LiveFlash';
import { StackScreen } from '@/components/navigation/StackScreen';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ChartLegend } from '@/features/charts/components/ChartLegend';
import { StudiesSheet } from '@/features/charts/components/StudiesSheet';
import { TradingChart, type TradingChartHandle } from '@/features/charts/components/TradingChart';
import { useChartHistory, useFnoChartHistory } from '@/features/charts/hooks';
import {
  activeStudies,
  CHART_INTERVALS,
  CHART_TYPES,
  type ChartInterval,
  type ChartType,
} from '@/features/charts/lib/config';
import { barIndexAt, computeStudies, legendValues } from '@/features/charts/lib/payload';
import { useChartPrefs } from '@/features/charts/store';
import { useLiveCandles } from '@/features/charts/useLiveCandles';
import { paramString } from '@/features/fno/lib/explore';
import { venueOf } from '@/features/fno/lib/format';
import type { ChartTarget, FnoExchange } from '@/features/fno/types';
import { useStockDetail } from '@/features/market/hooks';
import { overlayQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuote } from '@/features/market/live';
import { usable } from '@/features/stock/lib/priceView';
import { parseStockParams } from '@/features/stock/lib/routeParams';
import { useNow } from '@/hooks/useNow';
import { lockLandscape, unlockOrientation } from '@/lib/orientation';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedINR, formatSignedPercent } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const NUM = { fontVariant: ['tabular-nums' as const] };

/**
 * /chart/RELIANCE?exchange=NSE — the advanced chart, a trading terminal's chart on a phone:
 * TradingView's chart engine, eight intervals, six chart types, overlays (moving averages,
 * Bollinger Bands, VWAP, volume) and oscillator panes (RSI, MACD), a crosshair legend, pinch to
 * zoom and drag to pan — and LIVE: every tick streams into the forming candle and every study.
 * Scrolling left loads older history; settings persist across stocks.
 *
 * TWO SOURCES: a stock (`/chart/RELIANCE?exchange=NSE` — market candles, the equity feed) or
 * F&O (`src=fno` — an index or F&O stock charted through `anchor`, any listed contract of it,
 * or a contract itself — the F&O candles API and the F&O feed). Everything else is shared.
 *
 * FULL SCREEN (the toolbar's expand button, or `?full=1` from the stock page): landscape, no
 * status bar or header, every control in one slim bar above the chart. The chart stays the same
 * instance, so the view and zoom carry over. Opened full screen from another screen, closing it
 * goes back there; toggled here, it returns to this layout.
 *
 * Live price precedence: the streamed tick (the viewer's broker feed), else — while the market
 * is open — the polled quote, so the forming candle still moves without a broker connection.
 */
export default function AdvancedChartScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{
    symbol?: string | string[];
    exchange?: string | string[];
    full?: string | string[];
    src?: string | string[];
    target?: string | string[];
    anchor?: string | string[];
    label?: string | string[];
    spot?: string | string[];
    pc?: string | string[];
  }>();
  const fno = paramString(params.src) === 'fno';
  const stockParams = parseStockParams(params);
  const fnoExchange: FnoExchange =
    paramString(params.exchange)?.toUpperCase() === 'BFO' ? 'BFO' : 'NFO';
  const symbol = fno ? (paramString(params.symbol) ?? '').toUpperCase() : stockParams.symbol;
  const exchange: string = fno ? fnoExchange : stockParams.exchange;
  const fnoTarget: ChartTarget =
    paramString(params.target) === 'contract' ? 'contract' : 'underlying';
  const anchor = (paramString(params.anchor) ?? '').toUpperCase();
  const spotSymbol = paramString(params.spot);
  const fnoPrevClose = usable(Number(paramString(params.pc)));
  const openedFull = params.full === '1';
  const [fullscreen, setFullscreen] = useState(openedFull);

  const interval = useChartPrefs((state) => state.interval);
  const chartType = useChartPrefs((state) => state.chartType);
  const selected = useChartPrefs((state) => state.studies);
  const setInterval = useChartPrefs((state) => state.setInterval);
  const setChartType = useChartPrefs((state) => state.setChartType);
  const toggleStudy = useChartPrefs((state) => state.toggleStudy);
  const resetStudies = useChartPrefs((state) => state.resetStudies);

  const equityHistory = useChartHistory(symbol, exchange, interval, !fno);
  const fnoHistory = useFnoChartHistory(fnoExchange, anchor, symbol, fnoTarget, interval, fno);
  const history = fno ? fnoHistory : equityHistory;
  const { spec } = history;
  const detail = useStockDetail(fno ? '' : symbol, exchange);
  // The live price: the stock's own stream, else the F&O feed — the index/stock's cash listing
  // for an underlying chart, the contract for a contract chart.
  const liveExchange =
    fno && fnoTarget === 'underlying' ? (fnoExchange === 'BFO' ? 'BSE' : 'NSE') : exchange;
  const liveSymbol = fno ? (fnoTarget === 'underlying' ? spotSymbol : anchor) : symbol;
  const quote = useLiveQuote(liveExchange, liveSymbol, { mode: fno ? 'fno' : 'stream' });
  const now = useNow(15_000);
  const marketOpen = isMarketOpen(new Date(now));

  const liveLtp = quote?.ltp ?? (marketOpen && !fno ? usable(detail.data?.ltp) : null);
  const seriesKey = `${fno ? `fno:${fnoTarget}` : 'eq'}:${exchange}:${symbol}:${interval}`;
  const bars = useLiveCandles(
    history.bars,
    liveLtp,
    spec.minutesPerBar * 60,
    marketOpen,
    seriesKey,
  );
  const studies = useMemo(() => activeStudies(selected, spec.intraday), [selected, spec.intraday]);
  const values = useMemo(() => computeStudies(bars, studies), [bars, studies]);

  const chartRef = useRef<TradingChartHandle>(null);
  const [crosshair, setCrosshair] = useState<number | null>(null);
  const [atLatest, setAtLatest] = useState(true);
  const [pickingType, setPickingType] = useState(false);
  const [pickingStudies, setPickingStudies] = useState(false);

  const scrubIndex = crosshair !== null ? barIndexAt(bars, crosshair) : -1;
  const legendIndex = scrubIndex >= 0 ? scrubIndex : bars.length - 1;
  const legend = useMemo(
    () => legendValues(studies, values, legendIndex),
    [studies, values, legendIndex],
  );

  const header = fno
    ? overlayQuote({ price: bars[bars.length - 1]?.close ?? null, prevClose: fnoPrevClose }, quote)
    : overlayQuote(
        {
          price: detail.data?.ltp,
          prevClose: detail.data?.prevClose,
          changeAbs: detail.data?.changeAbs,
          changePct: detail.data?.changePct,
        },
        quote,
      );

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = history;
  const onNeedHistory = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const onInterval = useCallback(
    (next: ChartInterval) => {
      setCrosshair(null);
      setAtLatest(true);
      setInterval(next);
    },
    [setInterval, setCrosshair, setAtLatest],
  );

  // Landscape while full screen; the app's normal behaviour again on leaving (or unmounting).
  useEffect(() => {
    if (!fullscreen) return undefined;
    void lockLandscape();
    return () => void unlockOrientation();
  }, [fullscreen]);

  const exitFullscreen = useCallback(() => {
    if (openedFull && router.canGoBack()) router.back();
    else setFullscreen(false);
  }, [openedFull, router, setFullscreen]);

  // Android back leaves full screen first, unless full screen is where this screen started.
  useEffect(() => {
    if (!fullscreen || openedFull) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      setFullscreen(false);
      return true;
    });
    return () => subscription.remove();
  }, [fullscreen, openedFull]);

  const TypeIcon = chartType === 'line' || chartType === 'area' ? ChartLine : ChartCandlestick;
  const typeLabel = CHART_TYPES.find((t) => t.key === chartType)?.label ?? 'Candles';
  const displaySymbol = fno
    ? (paramString(params.label) ?? symbol)
    : (detail.data?.listings?.find((l) => l.exchange === exchange)?.displaySymbol ?? symbol);
  const subtitle = fno
    ? `${venueOf(exchange)} · ${fnoTarget === 'underlying' ? 'Spot' : 'Contract'}`
    : detail.data?.companyName
      ? `${exchange} · ${detail.data.companyName}`
      : exchange;
  const price = (
    <PriceBlock
      price={header.price}
      change={header.change}
      changePct={header.changePct}
      seq={quote?.seq}
      dir={quote?.dir}
      live={Boolean(quote) && marketOpen}
    />
  );
  const tools = (
    <>
      <ToolButton
        label={`Chart type: ${typeLabel}`}
        onPress={() => setPickingType(true)}
        icon={<TypeIcon size={18} color={colors.text} />}
      />
      <ToolButton
        label={`Indicators${studies.length ? `, ${studies.length} on` : ''}`}
        onPress={() => setPickingStudies(true)}
        icon={<Activity size={18} color={colors.text} />}
        badge={studies.length}
      />
    </>
  );

  let body: React.ReactNode;
  if (history.isPending && bars.length === 0) {
    body = null; // TradingChart shows its own spinner while the page boots
  } else if (history.isError && bars.length === 0) {
    body = (
      <View className="flex-1 justify-center px-5">
        <InlineError
          what="the price history"
          error={history.error}
          onRetry={() => void history.refetch()}
        />
      </View>
    );
  } else if (bars.length === 0) {
    body = (
      <View className="flex-1 justify-center px-5">
        <InlineEmpty
          title="No price history"
          message={
            (fno ? fnoHistory.unavailableReason : null) ??
            `There are no ${spec.label} bars for ${displaySymbol} yet.`
          }
        />
      </View>
    );
  }

  return (
    <StackScreen
      title={displaySymbol}
      subtitle={subtitle}
      scroll={false}
      immersive={fullscreen}
      right={price}
    >
      {fullscreen ? <StatusBar hidden /> : null}
      {fullscreen ? (
        <View className="flex-row items-center border-b border-line dark:border-line-dark">
          <ToolButton
            label={openedFull ? 'Close the full-screen chart' : 'Exit full screen'}
            onPress={exitFullscreen}
            icon={<Minimize2 size={18} color={colors.text} />}
          />
          <View className="min-w-0 flex-row items-center gap-3 pr-2">
            <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" numberOfLines={1}>
              {displaySymbol}
            </Text>
            {price}
          </View>
          <View className="h-6 w-px bg-line dark:bg-line-dark" />
          <IntervalChips value={interval} onChange={onInterval} />
          <View className="h-6 w-px bg-line dark:bg-line-dark" />
          {tools}
        </View>
      ) : null}
      <ChartLegend
        bar={bars[legendIndex]}
        previous={legendIndex > 0 ? bars[legendIndex - 1] : undefined}
        values={legend}
        intraday={spec.intraday}
        scrubbing={scrubIndex >= 0}
      />

      <View className="flex-1">
        {body ?? (
          <TradingChart
            ref={chartRef}
            bars={bars}
            values={values}
            chartType={chartType}
            studies={studies}
            seriesKey={seriesKey}
            prevClose={spec.intraday ? (fno ? fnoPrevClose : usable(detail.data?.prevClose)) : null}
            hasMore={Boolean(hasNextPage)}
            onCrosshair={setCrosshair}
            onNeedHistory={onNeedHistory}
            onLatestChange={setAtLatest}
          />
        )}
        {!atLatest && !body ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scroll to the latest bar"
            onPress={() => chartRef.current?.scrollToLatest()}
            className="absolute bottom-10 right-16 h-9 w-9 items-center justify-center rounded-full border border-line bg-surface shadow-sm active:opacity-80 dark:border-line-dark dark:bg-surface-dark"
          >
            <ChevronsRight size={18} color={colors.text} />
          </Pressable>
        ) : null}
        {isFetchingNextPage ? (
          <View className="absolute left-3 top-2 rounded-full bg-surface px-2.5 py-1 dark:bg-surface-dark">
            <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">
              Loading older bars…
            </Text>
          </View>
        ) : null}
      </View>

      {fullscreen ? null : (
        <View className="flex-row items-center border-t border-line dark:border-line-dark">
          <IntervalChips value={interval} onChange={onInterval} />
          <View className="h-6 w-px bg-line dark:bg-line-dark" />
          {tools}
          <ToolButton
            label="Full screen"
            onPress={() => setFullscreen(true)}
            icon={<Maximize2 size={18} color={colors.text} />}
          />
        </View>
      )}

      <OptionSheet
        visible={pickingType}
        title="Chart type"
        options={CHART_TYPES}
        value={chartType}
        onSelect={(key: ChartType) => setChartType(key)}
        onClose={() => setPickingType(false)}
      />
      <StudiesSheet
        visible={pickingStudies}
        selected={selected}
        intraday={spec.intraday}
        onToggle={toggleStudy}
        onReset={resetStudies}
        onClose={() => setPickingStudies(false)}
      />
    </StackScreen>
  );
}

/** Price, today's move and the live dot, in the header or the full-screen bar. */
function PriceBlock({
  price,
  change,
  changePct,
  seq,
  dir,
  live,
}: {
  price: number | null;
  change: number | null;
  changePct: number | null;
  seq: number | undefined;
  dir: 'up' | 'down' | null | undefined;
  live: boolean;
}) {
  return (
    <View className="items-end">
      <LiveFlash seq={seq} dir={dir}>
        <Text className="text-[15px] font-bold text-ink dark:text-ink-dark" style={NUM}>
          {formatINR(price)}
        </Text>
      </LiveFlash>
      <View className="flex-row items-center gap-1">
        {live ? (
          <View accessibilityLabel="Live" className="h-1.5 w-1.5 rounded-full bg-brand" />
        ) : null}
        <ChangeText value={changePct} className="text-[11px]" style={NUM}>
          {change !== null
            ? `${formatSignedINR(change)} (${formatSignedPercent(changePct)})`
            : formatSignedPercent(changePct)}
        </ChangeText>
      </View>
    </View>
  );
}

/** The interval row (1m to 1W), scrolling sideways when the bar is narrow. */
function IntervalChips({
  value,
  onChange,
}: {
  value: ChartInterval;
  onChange: (next: ChartInterval) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="flex-1"
      contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 8, gap: 4 }}
    >
      {CHART_INTERVALS.map((option) => {
        const on = option.key === value;
        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${option.label} bars`}
            onPress={() => onChange(option.key)}
            className={cn(
              'min-w-[40px] items-center rounded-lg px-2.5 py-1.5',
              on && 'bg-brand-wash dark:bg-brand-wash-dark',
            )}
          >
            <Text
              className={cn(
                'text-[13px] font-semibold',
                on
                  ? 'text-brand-text dark:text-brand-text-dark'
                  : 'text-ink-muted dark:text-ink-dark-muted',
              )}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function ToolButton({
  label,
  icon,
  badge,
  onPress,
}: {
  label: string;
  icon: React.ReactNode;
  badge?: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      className="h-11 w-12 items-center justify-center active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
    >
      {icon}
      {badge ? (
        <View className="absolute right-1.5 top-1.5 h-4 min-w-[16px] items-center justify-center rounded-full bg-brand-strong px-1 dark:bg-brand-strong-dark">
          <Text className="text-[9px] font-bold text-white">{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}
