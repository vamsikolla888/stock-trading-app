import { useLocalSearchParams } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { SegmentedControl } from '@/components/ui/Tabs';
import { ChainChart } from '@/features/fno/components/ChainChart';
import {
  ChainGrid,
  ChainGridHeader,
  CHAIN_ROW_HEIGHT,
  SPOT_MARKER_HEIGHT,
  type ChainOuterColumn,
} from '@/features/fno/components/ChainGrid';
import { Freshness, GrowwAccessBanner, SourceTag } from '@/features/fno/components/FnoChrome';
import { FuturesList } from '@/features/fno/components/FuturesList';
import { InstrumentMark } from '@/features/fno/components/Glyphs';
import { OrderTicket, type TicketTarget } from '@/features/fno/components/OrderTicket';
import { Caveats, Disclosure, Note } from '@/features/fno/components/primitives';
import { SearchSheet } from '@/features/fno/components/SearchSheet';
import {
  useFnoExpiries,
  useFnoFutures,
  useFnoStatus,
  useFnoUnderlyings,
  useOptionChain,
} from '@/features/fno/hooks';
import { isUnlistedExpiryError } from '@/features/fno/lib/access';
import { chartAnchor } from '@/features/fno/lib/candles';
import {
  atmRowIndex,
  chainMaxOi,
  chainRowOffset,
  legItm,
  oiShare,
  spotMarkerIndex,
  STRIKE_WINDOWS,
} from '@/features/fno/lib/chain';
import {
  isCommodityExchange,
  isMcxSessionOpen,
  parseChainParams,
  parseContractParam,
  splitStreamKey,
  venueLabel,
} from '@/features/fno/lib/explore';
import {
  compactQty,
  DASH,
  dteLabel,
  expiryLabel,
  formatStrike,
  ivPct,
  signedGreek,
  timeIst,
  venueOf,
} from '@/features/fno/lib/format';
import type {
  ChartTarget,
  FnoChainLeg,
  FnoContract,
  FnoExchange,
  FnoFutures,
  FnoSide,
} from '@/features/fno/types';
import { liveKey, overlayQuote, type LiveQuote } from '@/features/market/lib/liveQuote';
import { useLiveQuotes, type LiveTarget } from '@/features/market/live';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const NUM = { fontVariant: ['tabular-nums' as const] };
const STALE_MS = 60_000;
/** Past the push animation: a linked contract's chart / ticket never opens mid-transition. */
const LINK_DELAY_MS = 350;

type Tab = 'options' | 'futures';
type View_ = 'oi' | 'greeks';

const TABS: readonly { key: Tab; label: string }[] = [
  { key: 'options', label: 'Option chain' },
  { key: 'futures', label: 'Futures' },
];
const VIEWS: readonly { key: View_; label: string }[] = [
  { key: 'oi', label: 'OI' },
  { key: 'greeks', label: 'Greeks' },
];
const WINDOW_OPTIONS = STRIKE_WINDOWS.map((w) => ({
  key: w.each == null ? 'all' : String(w.each),
  label: w.each == null ? 'All strikes' : `${w.each} strikes each side of ATM`,
}));

interface Selection {
  exchange: FnoExchange;
  underlying: string;
  expiry: string | null;
  tab: Tab;
}

/**
 * /option-chain?underlying=NIFTY&exchange=NFO&expiry=2026-10-06&tab=futures — one underlying's
 * option chain or futures, with the order ticket opening from any price. Calls left, strike
 * ladder centre, puts right; ITM shaded, ATM branded, the spot marked between strikes, and
 * the expiry chips and column header pinned while the strikes scroll.
 */
export default function OptionChainScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{
    underlying?: string | string[];
    exchange?: string | string[];
    expiry?: string | string[];
    tab?: string | string[];
    contract?: string | string[];
  }>();
  // Normalised once: a repeated key arrives as an array, and a malformed expiry would only
  // earn a 422 — it falls back to the nearest listed expiry instead.
  const [sel, setSel] = useState<Selection>(() => parseChainParams(params));
  // A contract to chart on arrival (a link from search or Explore), resolved once its chain or
  // futures list has loaded.
  const pendingContract = useRef<string | null>(parseContractParam(params.contract));
  const linkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (linkTimer.current) clearTimeout(linkTimer.current);
    },
    [],
  );
  // MCX / NSE commodity: the same chain and futures, READ-ONLY — Groww's API places no
  // commodity orders, so a price charts its contract and no ticket ever opens.
  const commodity = isCommodityExchange(sel.exchange);
  const [strikes, setStrikes] = useState<number | null>(10);
  const [view, setView] = useState<View_>('oi');
  const [ticket, setTicket] = useState<TicketTarget | null>(null);
  const [searching, setSearching] = useState(false);
  const [pickingWindow, setPickingWindow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [chartOpen, setChartOpen] = useState(false);
  // The contract last picked (a premium, a future, a searched contract): the chart switches to
  // it, and its chip switches back. Cleared with the underlying, expiry or tab, like the web's.
  const [picked, setPicked] = useState<FnoContract | null>(null);
  const [chartTarget, setChartTarget] = useState<ChartTarget>('underlying');
  const pickForChart = useCallback((contract: FnoContract | null) => {
    setPicked(contract);
    setChartTarget(contract ? 'contract' : 'underlying');
  }, []);

  const universe = useFnoUnderlyings();
  const expiries = useFnoExpiries(sel.exchange, sel.underlying);
  // Commodities are not in the F&O universe list; the expiries response carries their details.
  const expiriesFor = expiries.data?.underlying;
  const meta =
    universe.data?.underlyings.find(
      (u) => u.exchange === sel.exchange && u.underlying === sel.underlying,
    ) ??
    (expiriesFor?.exchange === sel.exchange && expiriesFor.underlying === sel.underlying
      ? expiriesFor
      : null);
  // An underlying with no options (most of MCX) opens on its futures — derived, so the choice
  // follows the universe the moment it loads and never costs an extra render.
  const tab: Tab =
    sel.tab === 'options' && meta && !meta.hasOptions && meta.hasFutures ? 'futures' : sel.tab;
  const optionExpiries = useMemo(
    () => (expiries.data?.expiries ?? []).filter((e) => e.hasOptions),
    [expiries.data],
  );
  const status = useFnoStatus();
  // An expiry that is not (or no longer) a listed OPTION expiry — a link from yesterday's
  // position, or a date when only futures expire. The server refuses it (422) rather than show
  // another expiry's chain; known from the expiry list, it is not even asked for.
  const expiryUnlistedLocally =
    sel.expiry != null &&
    expiries.data != null &&
    !optionExpiries.some((e) => e.expiry === sel.expiry);
  const chain = useOptionChain(
    sel.exchange,
    sel.underlying,
    sel.expiry,
    strikes,
    tab === 'options' && !expiryUnlistedLocally,
  );
  const expiryUnlisted =
    expiryUnlistedLocally || (chain.isError && isUnlistedExpiryError(chain.error));
  const futures = useFnoFutures(sel.exchange, sel.underlying, tab === 'futures');
  const data = chain.data;
  // keepPreviousData shows the last chain while the next loads. When that chain belongs to a
  // different underlying or expiry it is dimmed and cannot open a ticket.
  const placeholder = chain.isPlaceholderData;

  /* Live premiums: every contract on screen, and the spot, on the F&O feed (the viewer's Groww
     session), laid over the polled chain or futures. A placeholder chain — the previous
     underlying, shown while the next loads — is not watched. */
  // A commodity has no cash listing: its chain names the future the options settle into
  // (`MCX:GOLD05NOV26FUT`), and that future's price is the spot.
  const settling = !placeholder ? splitStreamKey(data?.spotInstrument) : null;
  const spotExchange = meta?.spotSymbol
    ? sel.exchange === 'BFO'
      ? 'BSE'
      : 'NSE'
    : (settling?.exchange ?? 'NSE');
  const spotSymbol = meta?.spotSymbol ?? settling?.symbol ?? null;
  // Rebuilt each render on purpose: useLiveQuotes keys on the symbol SET, not the array.
  const fnoTargets: LiveTarget[] = [];
  if (tab === 'options' && data && !placeholder) {
    for (const row of data.rows) {
      for (const leg of [row.call, row.put]) {
        if (leg?.contract) {
          fnoTargets.push({ exchange: leg.contract.exchange, symbol: leg.tradingSymbol });
        }
      }
    }
  }
  if (tab === 'futures') {
    for (const f of futures.data?.futures ?? []) {
      fnoTargets.push({ exchange: f.contract.exchange, symbol: f.contract.tradingSymbol });
    }
  }
  if (spotSymbol) fnoTargets.push({ exchange: spotExchange, symbol: spotSymbol });
  const fnoQuotes = useLiveQuotes(fnoTargets, { mode: 'fno' });
  const liveOf = useCallback(
    (contract: Pick<FnoContract, 'exchange' | 'tradingSymbol'>) =>
      fnoQuotes.get(liveKey(contract.exchange, contract.tradingSymbol)),
    [fnoQuotes],
  );
  const liveSpot = spotSymbol ? fnoQuotes.get(liveKey(spotExchange, spotSymbol))?.ltp : undefined;
  const liveFutures = repriceFutures(futures.data, fnoQuotes, liveSpot);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        // refetch() runs even a disabled query — an expiry known to be unlisted is not re-asked.
        tab === 'futures' ? futures.refetch() : expiryUnlistedLocally ? null : chain.refetch(),
        expiries.refetch(),
        status.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [tab, chain, futures, expiries, status, expiryUnlistedLocally]);

  const now = useNow(15_000);
  // A commodity's futures tab has no chain to name its settling future: the nearest future
  // stands as its price, and the header says so.
  const nearFuture = commodity && tab === 'futures' ? (liveFutures?.futures[0] ?? null) : null;
  const spot = liveSpot ?? data?.spot ?? futures.data?.spot ?? nearFuture?.ltp ?? null;
  const activeQuery = tab === 'options' ? chain : futures;
  const sessionOpen = commodity ? isMcxSessionOpen(now) : isMarketOpen(new Date(now));
  const priceStale =
    (activeQuery.isError && !!activeQuery.data) ||
    (sessionOpen && activeQuery.dataUpdatedAt > 0 && now - activeQuery.dataUpdatedAt > STALE_MS);

  /* Chain cells. A commodity chain carries no OI (Groww's LTP has none), so it shows greeks. */
  const maxOi = useMemo(() => (data ? chainMaxOi(data.rows) : 0), [data]);
  const shownView: View_ = commodity ? 'greeks' : view;
  const outer = useMemo<ChainOuterColumn<FnoChainLeg>>(
    () =>
      shownView === 'oi'
        ? {
            label: 'OI',
            main: (leg) => compactQty(leg.openInterest),
            bar: (leg) => oiShare(leg.openInterest, maxOi),
          }
        : {
            label: 'Δ · IV',
            main: (leg) => signedGreek(leg.greeks?.delta, 2),
            sub: (leg) => ivPct(leg.greeks?.iv),
          },
    [shownView, maxOi],
  );
  const ltpOf = useCallback(
    (leg: FnoChainLeg) => (leg.contract ? liveOf(leg.contract)?.ltp : undefined) ?? leg.ltp,
    [liveOf],
  );
  // The live premium's move against its close; the chain's own figure until the first tick.
  const changeOf = useCallback(
    (leg: FnoChainLeg) =>
      overlayQuote(
        { price: leg.ltp, changePct: leg.dayChangePct },
        leg.contract ? liveOf(leg.contract) : undefined,
      ).changePct,
    [liveOf],
  );
  const canPick = useCallback(
    (leg: FnoChainLeg) => !placeholder && leg.contract != null,
    [placeholder],
  );
  const scrollRef = useRef<ScrollView>(null);
  /** Charts a contract and brings the chart into view — a commodity's only action. */
  const chartContract = useCallback(
    (contract: FnoContract) => {
      pickForChart(contract);
      setChartOpen(true);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    },
    [pickForChart],
  );
  const onPick = useCallback(
    (leg: FnoChainLeg) => {
      if (!leg.contract) return;
      // A commodity premium charts its contract; it never opens an order ticket.
      if (isCommodityExchange(leg.contract.exchange)) {
        chartContract(leg.contract);
        return;
      }
      pickForChart(leg.contract);
      setTicket({ contract: leg.contract, leg, side: 'BUY', nonce: Date.now() });
    },
    [pickForChart, chartContract],
  );
  const onTradeFuture = useCallback(
    (contract: FnoContract, side: FnoSide) => {
      pickForChart(contract);
      if (!isCommodityExchange(contract.exchange)) {
        setTicket({ contract, leg: null, side, nonce: Date.now() });
      }
    },
    [pickForChart],
  );

  // The linked contract, once the list it belongs to is on screen: charted, and on an equity
  // book its ticket opened on BUY (the web's ?contract= rule). Dropped if it is not listed.
  // Applied a beat later, so a sheet is never presented mid push-transition.
  useEffect(() => {
    const wanted = pendingContract.current;
    if (!wanted) return undefined;
    let found: { contract: FnoContract; leg: FnoChainLeg | null } | null = null;
    let settled = false;
    if (tab === 'futures') {
      if (futures.data) {
        settled = true;
        const row = futures.data.futures.find((f) => f.contract.tradingSymbol === wanted);
        if (row) found = { contract: row.contract, leg: null };
      } else if (futures.isError) settled = true;
    } else if (data && !placeholder) {
      settled = true;
      for (const row of data.rows) {
        const leg = [row.call, row.put].find((l) => l?.tradingSymbol === wanted);
        if (leg?.contract) {
          found = { contract: leg.contract, leg };
          break;
        }
      }
    } else if (chain.isError || expiryUnlistedLocally) settled = true;
    if (!settled) return undefined;
    pendingContract.current = null;
    const hit = found;
    if (!hit) return undefined;
    // Held in a ref and cleared only on unmount: a refetch inside the delay must not drop it.
    linkTimer.current = setTimeout(() => {
      linkTimer.current = null;
      chartContract(hit.contract);
      if (!isCommodityExchange(hit.contract.exchange)) {
        setTicket({ contract: hit.contract, leg: hit.leg, side: 'BUY', nonce: Date.now() });
      }
    }, LINK_DELAY_MS);
    return undefined;
  }, [
    tab,
    futures.data,
    futures.isError,
    data,
    placeholder,
    chain.isError,
    expiryUnlistedLocally,
    chartContract,
  ]);

  // A contract's price follows every refresh of the chain or futures list. `undefined`: not on
  // screen; `null`: on screen with no trade yet — which is shown as such, not as a stale price.
  const ltpOfContract = useCallback(
    (contract: Pick<FnoContract, 'exchange' | 'tradingSymbol'>): number | null | undefined => {
      const live = liveOf(contract)?.ltp;
      if (live !== undefined) return live;
      const symbol = contract.tradingSymbol;
      for (const row of data?.rows ?? []) {
        if (row.call?.tradingSymbol === symbol) return row.call.ltp;
        if (row.put?.tradingSymbol === symbol) return row.put.ltp;
      }
      return futures.data?.futures.find((f) => f.contract.tradingSymbol === symbol)?.ltp;
    },
    [liveOf, data, futures.data],
  );
  const ticketOnScreenLtp = ticket ? ltpOfContract(ticket.contract) : undefined;
  const ticketLtp =
    ticketOnScreenLtp !== undefined ? ticketOnScreenLtp : (ticket?.leg?.ltp ?? null);

  /* Chart. The underlying is charted through a listed contract of THIS chain — never through a
     placeholder chain still showing the previous underlying. */
  const chartAnchorContract = useMemo(
    () => chartAnchor(tab, placeholder ? null : data, futures.data),
    [tab, placeholder, data, futures.data],
  );
  const chartsContract = chartTarget === 'contract' && picked != null;
  const chartLivePrice = chartsContract
    ? (ltpOfContract(picked) ?? null)
    : placeholder
      ? null
      : spot;

  /* Centre the ATM strike once per (underlying, expiry) — never on a refresh, which would yank
     the table away from wherever the user had scrolled. Rows are a fixed height, so the ATM
     row's offset is arithmetic, not a measurement that could lag a re-render. */
  const layout = useRef({ viewport: 0, sticky: 0, rows: 0 });
  const centredFor = useRef<string | null>(null);
  const chainId = data ? `${data.underlying}:${data.expiry}` : null;
  const centre = useCallback(() => {
    const l = layout.current;
    if (!data || !chainId || centredFor.current === chainId || l.viewport === 0) return;
    const index = atmRowIndex(data.rows, data.atmStrike, data.spot);
    if (index < 0) return;
    const y =
      l.rows +
      chainRowOffset(
        index,
        spotMarkerIndex(data.rows, data.spot),
        CHAIN_ROW_HEIGHT,
        SPOT_MARKER_HEIGHT,
      );
    const target = y + CHAIN_ROW_HEIGHT / 2 - (l.sticky + (l.viewport - l.sticky) / 2);
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
    centredFor.current = chainId;
  }, [data, chainId]);

  // The chip the user tapped lights up at once, not when its chain arrives.
  const selectedExpiry = sel.expiry ?? data?.expiry ?? optionExpiries[0]?.expiry ?? null;
  const windowKey = strikes == null ? 'all' : String(strikes);
  const windowLabel = STRIKE_WINDOWS.find((w) => w.each === strikes)?.label ?? '±10';

  const header = (
    <View className="w-full max-w-[720px] self-center px-5 pb-3 pt-4">
      <View className="rounded-card border border-line bg-surface p-4 dark:border-line-dark dark:bg-surface-dark">
        <View className="flex-row items-start justify-between gap-3">
          <InstrumentMark
            kind={commodity ? 'commodity' : meta?.isIndex === false ? 'stock' : 'index'}
            underlying={sel.underlying}
            logoSymbol={meta?.logoSymbol ?? meta?.spotSymbol}
            exchange={sel.exchange}
            size={40}
          />
          <View className="min-w-0 flex-1">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {meta?.name ?? sel.underlying} ·{' '}
              {!commodity ? 'spot' : nearFuture ? 'near future' : 'underlying future'}
            </Text>
            <Text
              className="mt-1 text-2xl font-bold text-ink dark:text-ink-dark"
              style={[NUM, { letterSpacing: -0.5 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {spot != null ? formatINR(spot) : DASH}
            </Text>
            {tab === 'options' && data?.spotSource ? (
              <Text
                className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                numberOfLines={1}
              >
                {data.spotSource}
              </Text>
            ) : nearFuture ? (
              <Text
                className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                numberOfLines={1}
              >
                {nearFuture.contract.tradingSymbol}
              </Text>
            ) : null}
          </View>
          <SourceTag source={tab === 'options' ? data?.source : futures.data?.source} />
        </View>
        {tab === 'options' ? (
          <View className="mt-3 flex-row border-t border-line pt-3 dark:border-line-dark">
            <HeaderStat
              label="ATM"
              value={data?.atmStrike != null ? formatStrike(data.atmStrike) : DASH}
            />
            {commodity ? null : (
              <HeaderStat
                label="PCR (OI)"
                value={data?.totals.pcr != null ? data.totals.pcr.toFixed(2) : DASH}
              />
            )}
            <HeaderStat
              label="Expiry"
              value={data ? `${expiryLabel(data.expiry)} · ${dteLabel(data.daysToExpiry)}` : DASH}
            />
          </View>
        ) : null}
      </View>
      <Freshness
        className="mt-2.5"
        source={tab === 'options' ? data?.source : futures.data?.source}
        greeksSource={tab === 'options' ? data?.greeksSource : null}
        asOf={tab === 'options' ? data?.asOf : futures.data?.asOf}
        updatedAt={activeQuery.dataUpdatedAt}
        refreshFailed={activeQuery.isError && !!activeQuery.data}
      />
      <GrowwAccessBanner className="mt-3" />
      <ChainChart
        className="mt-3"
        open={chartOpen}
        onToggle={() => setChartOpen((open) => !open)}
        exchange={sel.exchange}
        underlying={sel.underlying}
        anchor={chartAnchorContract}
        anchorLoading={tab === 'options' ? chain.isLoading || placeholder : futures.isLoading}
        picked={picked}
        target={chartTarget}
        onTargetChange={setChartTarget}
        livePrice={chartLivePrice}
      />
      <SegmentedControl
        className="mt-3"
        items={TABS.filter(
          (t) => !meta || (t.key === 'options' ? meta.hasOptions : meta.hasFutures),
        )}
        value={tab}
        onChange={(tab) => {
          pickForChart(null);
          setSel((s) => ({ ...s, tab }));
        }}
      />
      {commodity ? (
        <Note className="mt-2.5">
          View only — Groww’s API doesn’t place commodity orders. Tap a price to chart it.
        </Note>
      ) : null}
    </View>
  );

  const sticky =
    tab === 'options' ? (
      <View
        className="bg-canvas dark:bg-canvas-dark"
        onLayout={(e) => {
          layout.current.sticky = e.nativeEvent.layout.height;
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 10 }}
        >
          {expiries.isLoading && optionExpiries.length === 0 ? (
            <Text className="py-2 text-xs text-ink-muted dark:text-ink-dark-muted">
              Loading expiries…
            </Text>
          ) : null}
          {optionExpiries.map((e) => {
            const on = e.expiry === selectedExpiry;
            return (
              <Pressable
                key={e.expiry}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Expiry ${expiryLabel(e.expiry)}, ${dteLabel(e.daysToExpiry)}`}
                onPress={() => {
                  if (e.expiry !== selectedExpiry) pickForChart(null);
                  setSel((s) => ({ ...s, expiry: e.expiry }));
                }}
                className={cn(
                  'rounded-full border px-3.5 py-2',
                  on
                    ? 'border-brand bg-brand-wash dark:bg-brand-wash-dark'
                    : 'border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
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
                  {expiryLabel(e.expiry)}
                  <Text className="text-[11px] font-normal"> · {dteLabel(e.daysToExpiry)}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View className="flex-row items-center gap-3 px-5 pb-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Strikes shown: ${windowLabel}. Change`}
            onPress={() => setPickingWindow(true)}
            className="h-9 flex-row items-center gap-1 rounded-lg border border-line px-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
          >
            <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
              Strikes {windowLabel}
            </Text>
            <ChevronDown size={14} color={colors.textMuted} />
          </Pressable>
          {commodity ? (
            <View className="flex-1" />
          ) : (
            <SegmentedControl items={VIEWS} value={view} onChange={setView} className="flex-1" />
          )}
        </View>
        <ChainGridHeader outerLabel={outer.label} />
      </View>
    ) : (
      <View />
    );

  const showNearestExpiry = () => {
    centredFor.current = null;
    pickForChart(null);
    setSel((s) => ({ ...s, expiry: null }));
  };

  let body: React.ReactNode;
  if (tab === 'options') {
    if (expiryUnlisted && sel.expiry) {
      body = (
        <View className="px-5 pt-3">
          <InlineEmpty
            title={`No option chain for ${expiryLabel(sel.expiry)}`}
            message={`${expiryLabel(sel.expiry)} is not a listed option expiry for ${sel.underlying} — it has passed, or only futures expire that day.`}
            action={{ label: 'Show the nearest expiry', onPress: showNearestExpiry }}
          />
        </View>
      );
    } else if (chain.isLoading && !data) {
      body = (
        <View className="px-5 pt-3">
          <ListSkeleton rows={8} />
        </View>
      );
    } else if (chain.isError && !data) {
      body = (
        <View className="px-5 pt-3">
          <InlineError
            what="the option chain"
            error={chain.error}
            onRetry={() => void chain.refetch()}
          />
        </View>
      );
    } else if (data && data.rows.length === 0) {
      body = (
        <View className="px-5 pt-3">
          <InlineEmpty title="No strikes listed" message="No strikes are listed for this expiry." />
        </View>
      );
    } else if (data) {
      body = (
        <View
          key={chainId ?? 'chain'}
          className="w-full max-w-[720px] self-center"
          style={placeholder ? { opacity: 0.45 } : undefined}
          accessibilityState={{ busy: placeholder }}
          onLayout={() => centre()}
        >
          <ChainGrid
            rows={data.rows}
            atmStrike={data.atmStrike}
            spot={spot}
            ltp={ltpOf}
            change={changeOf}
            outer={outer}
            itm={legItm}
            canPick={canPick}
            onPick={onPick}
          />
        </View>
      );
    }
  } else if (futures.isLoading) {
    body = (
      <View className="px-5">
        <ListSkeleton rows={3} />
      </View>
    );
  } else if (futures.isError && !futures.data) {
    body = (
      <View className="px-5">
        <InlineError what="futures" error={futures.error} onRetry={() => void futures.refetch()} />
      </View>
    );
  } else if (futures.data) {
    body = (
      <View className="w-full max-w-[720px] self-center px-5">
        <FuturesList
          data={liveFutures ?? futures.data}
          onTrade={onTradeFuture}
          onChart={chartContract}
          selected={chartTarget === 'contract' ? (picked?.tradingSymbol ?? null) : null}
        />
      </View>
    );
  }

  const footer =
    tab === 'options' && data ? (
      <View className="w-full max-w-[720px] self-center gap-3 px-5 pt-4">
        {data.totals.callOi != null || data.totals.putOi != null ? (
          <View className="flex-row rounded-xl bg-surface-sunk px-3 py-2.5 dark:bg-surface-sunk-dark">
            <FooterStat label="Call OI" value={compactQty(data.totals.callOi)} />
            <FooterStat
              label="PCR"
              value={data.totals.pcr != null ? data.totals.pcr.toFixed(2) : DASH}
              center
            />
            <FooterStat label="Put OI" value={compactQty(data.totals.putOi)} right />
          </View>
        ) : null}
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint" style={NUM}>
          {data.rows.length} strikes · {expiryLabel(data.expiry)} ({dteLabel(data.daysToExpiry)}) ·
          as of {timeIst(data.asOf, true)} IST · {venueOf(data.exchange)}
        </Text>
        {data.sourceNote ? <Note>{data.sourceNote}</Note> : null}
        <Note>
          {commodity
            ? 'Chart only — no commodity orders via Groww.'
            : 'Tap a price to buy or sell. Orders reach Groww only after review.'}
        </Note>
        {data.caveats.length > 0 ? (
          <Disclosure
            title="About these numbers"
            meta={`${data.caveats.length} things worth knowing`}
          >
            <Caveats items={data.caveats} />
          </Disclosure>
        ) : null}
      </View>
    ) : tab === 'futures' && futures.data?.sourceNote ? (
      <View className="px-5 pt-3">
        <Note>{futures.data.sourceNote}</Note>
      </View>
    ) : null;

  return (
    <StackScreen
      title={commodity ? (meta?.name ?? sel.underlying) : sel.underlying}
      subtitle={`${venueLabel(sel.exchange)} · ${
        commodity ? 'Commodity' : meta ? (meta.isIndex ? 'Index' : 'Stock') : 'F&O'
      } · Groww`}
      scroll={false}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Switch underlying or open a contract"
          hitSlop={8}
          onPress={() => setSearching(true)}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <Search size={20} color={colors.text} />
        </Pressable>
      }
    >
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        stickyHeaderIndices={[1]}
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => {
          layout.current.viewport = e.nativeEvent.layout.height;
          centre();
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      >
        {header}
        {sticky}
        <View
          onLayout={(e: LayoutChangeEvent) => {
            layout.current.rows = e.nativeEvent.layout.y;
            centre();
          }}
        >
          {body}
        </View>
        {footer}
      </ScrollView>

      <OptionSheet
        visible={pickingWindow}
        title="Strikes to show"
        options={WINDOW_OPTIONS}
        value={windowKey}
        onSelect={(key) => setStrikes(key === 'all' ? null : Number(key))}
        onClose={() => setPickingWindow(false)}
      />
      <SearchSheet
        visible={searching}
        onClose={() => setSearching(false)}
        onPickUnderlying={(u) => {
          setTicket(null);
          pendingContract.current = null;
          centredFor.current = null;
          pickForChart(null);
          setSel({ exchange: u.exchange, underlying: u.underlying, expiry: null, tab: 'options' });
        }}
        onPickContract={(c) => {
          centredFor.current = null;
          pendingContract.current = null;
          pickForChart(c);
          setSel({
            exchange: c.exchange,
            underlying: c.underlying,
            expiry: c.kind === 'FUT' ? null : c.expiry,
            tab: c.kind === 'FUT' ? 'futures' : 'options',
          });
          if (!isCommodityExchange(c.exchange)) {
            setTicket({ contract: c, leg: null, side: 'BUY', nonce: Date.now() });
          }
        }}
        onPickCommodity={(pick) => {
          // Switched in place: a commodity is this same screen, read-only.
          setTicket(null);
          centredFor.current = null;
          pickForChart(null);
          pendingContract.current = pick.contract;
          setSel({
            exchange: pick.exchange,
            underlying: pick.underlying,
            expiry: pick.expiry,
            tab: pick.tab,
          });
        }}
      />
      <OrderTicket
        target={ticket}
        ltp={ticketLtp}
        priceStale={priceStale}
        onClose={() => setTicket(null)}
      />
    </StackScreen>
  );
}

/**
 * The futures list re-priced at its live ticks: each future's price, day move and basis to the
 * (live) spot. The same object back when nothing on it has ticked.
 */
function repriceFutures(
  base: FnoFutures | undefined,
  quotes: ReadonlyMap<string, LiveQuote>,
  liveSpot: number | undefined,
): FnoFutures | undefined {
  if (!base || quotes.size === 0) return base;
  const spotNow = liveSpot ?? base.spot;
  return {
    ...base,
    spot: spotNow,
    futures: base.futures.map((row) => {
      const quote = quotes.get(liveKey(row.contract.exchange, row.contract.tradingSymbol));
      if (!quote) return row;
      const move = overlayQuote(
        { price: row.ltp, changeAbs: row.dayChange, changePct: row.dayChangePct },
        quote,
      );
      const basis = spotNow != null && move.price != null ? move.price - spotNow : row.basis;
      return {
        ...row,
        ltp: move.price,
        dayChange: move.change,
        dayChangePct: move.changePct,
        basis,
        basisPct: basis != null && spotNow ? (basis / spotNow) * 100 : row.basisPct,
      };
    }),
  };
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text
        className="mt-0.5 text-[13px] font-semibold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function FooterStat({
  label,
  value,
  center,
  right,
}: {
  label: string;
  value: string;
  center?: boolean;
  right?: boolean;
}) {
  return (
    <View className={cn('flex-1', center && 'items-center', right && 'items-end')}>
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">{label}</Text>
      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark" style={NUM}>
        {value}
      </Text>
    </View>
  );
}
