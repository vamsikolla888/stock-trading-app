import { useLocalSearchParams } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useMemo, useRef, useState } from 'react';
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
import {
  ChainGrid,
  ChainGridHeader,
  CHAIN_ROW_HEIGHT,
  SPOT_MARKER_HEIGHT,
  type ChainOuterColumn,
} from '@/features/fno/components/ChainGrid';
import { Freshness, GrowwAccessBanner, SourceTag } from '@/features/fno/components/FnoChrome';
import { FuturesList } from '@/features/fno/components/FuturesList';
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
import {
  atmRowIndex,
  chainMaxOi,
  chainRowOffset,
  legItm,
  oiShare,
  spotMarkerIndex,
  STRIKE_WINDOWS,
} from '@/features/fno/lib/chain';
import { parseChainParams } from '@/features/fno/lib/explore';
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
import type { FnoChainLeg, FnoContract, FnoExchange, FnoSide } from '@/features/fno/types';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { formatINR } from '@/lib/utils/formatters';
import { isMarketOpen } from '@/lib/utils/market';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

const NUM = { fontVariant: ['tabular-nums' as const] };
const STALE_MS = 60_000;

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
  }>();
  // Normalised once: a repeated key arrives as an array, and a malformed expiry would only
  // earn a 422 — it falls back to the nearest listed expiry instead.
  const [sel, setSel] = useState<Selection>(() => parseChainParams(params));
  const [strikes, setStrikes] = useState<number | null>(10);
  const [view, setView] = useState<View_>('oi');
  const [ticket, setTicket] = useState<TicketTarget | null>(null);
  const [searching, setSearching] = useState(false);
  const [pickingWindow, setPickingWindow] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const universe = useFnoUnderlyings();
  const meta =
    universe.data?.underlyings.find(
      (u) => u.exchange === sel.exchange && u.underlying === sel.underlying,
    ) ?? null;
  // An underlying with no options opens on its futures — derived, so the choice follows the
  // universe the moment it loads and never costs an extra render.
  const tab: Tab =
    sel.tab === 'options' && meta && !meta.hasOptions && meta.hasFutures ? 'futures' : sel.tab;
  const expiries = useFnoExpiries(sel.exchange, sel.underlying);
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
  const spot = data?.spot ?? futures.data?.spot ?? null;
  const activeQuery = tab === 'options' ? chain : futures;
  const priceStale =
    (activeQuery.isError && !!activeQuery.data) ||
    (isMarketOpen(new Date(now)) &&
      activeQuery.dataUpdatedAt > 0 &&
      now - activeQuery.dataUpdatedAt > STALE_MS);

  /* Chain cells */
  const maxOi = useMemo(() => (data ? chainMaxOi(data.rows) : 0), [data]);
  const outer = useMemo<ChainOuterColumn<FnoChainLeg>>(
    () =>
      view === 'oi'
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
    [view, maxOi],
  );
  const ltpOf = useCallback((leg: FnoChainLeg) => leg.ltp, []);
  const canPick = useCallback(
    (leg: FnoChainLeg) => !placeholder && leg.contract != null,
    [placeholder],
  );
  const onPick = useCallback((leg: FnoChainLeg) => {
    if (!leg.contract) return;
    setTicket({ contract: leg.contract, leg, side: 'BUY', nonce: Date.now() });
  }, []);
  const onTradeFuture = useCallback((contract: FnoContract, side: FnoSide) => {
    setTicket({ contract, leg: null, side, nonce: Date.now() });
  }, []);

  // The ticket's price follows every refresh of the chain or futures list.
  const ticketLtp = useMemo(() => {
    if (!ticket) return null;
    const symbol = ticket.contract.tradingSymbol;
    for (const row of data?.rows ?? []) {
      if (row.call?.tradingSymbol === symbol) return row.call.ltp;
      if (row.put?.tradingSymbol === symbol) return row.put.ltp;
    }
    const future = futures.data?.futures.find((f) => f.contract.tradingSymbol === symbol);
    return future?.ltp ?? ticket.leg?.ltp ?? null;
  }, [ticket, data, futures.data]);

  /* Centre the ATM strike once per (underlying, expiry) — never on a refresh, which would yank
     the table away from wherever the user had scrolled. Rows are a fixed height, so the ATM
     row's offset is arithmetic, not a measurement that could lag a re-render. */
  const scrollRef = useRef<ScrollView>(null);
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
          <View className="min-w-0 flex-1">
            <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
              {meta?.name ?? sel.underlying} · spot
            </Text>
            <Text
              className="mt-1 text-2xl font-bold text-ink dark:text-ink-dark"
              style={[NUM, { letterSpacing: -0.5 }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {spot != null ? formatINR(spot) : DASH}
            </Text>
            {data?.spotSource ? (
              <Text
                className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
                numberOfLines={1}
              >
                {data.spotSource}
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
            <HeaderStat
              label="PCR (OI)"
              value={data?.totals.pcr != null ? data.totals.pcr.toFixed(2) : DASH}
            />
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
      <SegmentedControl
        className="mt-3"
        items={TABS.filter(
          (t) => !meta || (t.key === 'options' ? meta.hasOptions : meta.hasFutures),
        )}
        value={tab}
        onChange={(tab) => setSel((s) => ({ ...s, tab }))}
      />
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
                onPress={() => setSel((s) => ({ ...s, expiry: e.expiry }))}
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
          <SegmentedControl items={VIEWS} value={view} onChange={setView} className="flex-1" />
        </View>
        <ChainGridHeader outerLabel={outer.label} />
      </View>
    ) : (
      <View />
    );

  const showNearestExpiry = () => {
    centredFor.current = null;
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
        <FuturesList data={futures.data} onTrade={onTradeFuture} />
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
          Tap any price to buy or sell it. Orders go to your Groww account only after a review step.
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
      title={sel.underlying}
      subtitle={`${venueOf(sel.exchange)} · ${meta ? (meta.isIndex ? 'Index' : 'Stock') : 'F&O'} · Groww`}
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
          centredFor.current = null;
          setSel({ exchange: u.exchange, underlying: u.underlying, expiry: null, tab: 'options' });
        }}
        onPickContract={(c) => {
          centredFor.current = null;
          setSel({
            exchange: c.exchange,
            underlying: c.underlying,
            expiry: c.kind === 'FUT' ? null : c.expiry,
            tab: c.kind === 'FUT' ? 'futures' : 'options',
          });
          setTicket({ contract: c, leg: null, side: 'BUY', nonce: Date.now() });
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
