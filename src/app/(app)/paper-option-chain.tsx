import { useLocalSearchParams, useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import Search from 'lucide-react-native/icons/search';
import Wallet from 'lucide-react-native/icons/wallet';
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
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { SegmentedControl } from '@/components/ui/Tabs';
import { PaperChainHeader } from '@/features/derivatives/components/PaperChainHeader';
import { PaperTicket, type PaperTicketTarget } from '@/features/derivatives/components/PaperTicket';
import { StrategySheet } from '@/features/derivatives/components/StrategySheet';
import { UnderlyingPickerSheet } from '@/features/derivatives/components/UnderlyingPickerSheet';
import { usePaperChain, usePaperUnderlyings } from '@/features/derivatives/hooks';
import {
  chainQuote,
  defaultUnderlying,
  PAPER_WINDOWS,
  PREFERRED_UNDERLYING,
} from '@/features/derivatives/lib/book';
import { paperBookHref, parsePaperChainParams } from '@/features/derivatives/lib/routes';
import type { OptionChainLeg, PaperTicketQuote } from '@/features/derivatives/types';
import {
  ChainGrid,
  ChainGridHeader,
  CHAIN_ROW_HEIGHT,
  SPOT_MARKER_HEIGHT,
  type ChainOuterColumn,
} from '@/features/fno/components/ChainGrid';
import { Caveats, Disclosure, Note } from '@/features/fno/components/primitives';
import { atmRowIndex, chainRowOffset, spotMarkerIndex } from '@/features/fno/lib/chain';
import {
  daysUntil,
  dteLabel,
  expiryLabel,
  ivPct,
  signedGreek,
  timeIst,
  venueOf,
} from '@/features/fno/lib/format';
import { cn } from '@/lib/utils/cn';
import { formatINRCompact } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { isApiError } from '@/types/api';

type ChainView = 'value' | 'greeks';

const VIEWS: readonly { key: ChainView; label: string }[] = [
  { key: 'value', label: 'Lot value' },
  { key: 'greeks', label: 'Greeks' },
];
const DEFAULT_WINDOW = 10;
const WINDOW_OPTIONS = PAPER_WINDOWS.map((w) => ({
  key: String(w),
  label: `${w} strikes each side of ATM`,
}));

const legItm = (leg: OptionChainLeg) => leg.inTheMoney === true;
const legLtp = (leg: OptionChainLeg) => leg.lastPrice;

/**
 * /paper-option-chain?underlying=RELIANCE&expiry=2026-10-29&builder=1 — the paper book's option
 * chain (the web's /fno/paper/chain): calls left, strikes centre, puts right, drawn by the same
 * grid as the live Groww chain. Tap any price for a paper ticket; the strategy builder resolves
 * templates against this chain. Priced by Black-Scholes over the broker's quotes, so every
 * greek and IV is MODELLED, and the spot's source is always on screen.
 *
 * Params are decoded and validated once at mount: an unknown or stale underlying falls back
 * to NIFTY (said so on screen), and an expiry the chain does not list falls back to the
 * nearest one — the server's own rule.
 */
export default function PaperOptionChainScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const raw = useLocalSearchParams<{ underlying?: string; expiry?: string; builder?: string }>();
  // Read once: picking another underlying must not fight the URL on every render.
  const [linked] = useState(() => parsePaperChainParams(raw));
  const [picked, setPicked] = useState<string | null>(null);
  const [expiry, setExpiry] = useState<string | null>(linked.expiry);
  const [strikeWindow, setStrikeWindow] = useState<number>(DEFAULT_WINDOW);
  const [view, setView] = useState<ChainView>('value');
  const [ticket, setTicket] = useState<{
    target: PaperTicketTarget;
    seed: PaperTicketQuote;
  } | null>(null);
  const [picking, setPicking] = useState(false);
  const [pickingWindow, setPickingWindow] = useState(false);
  const [building, setBuilding] = useState(linked.builder);
  const [refreshing, setRefreshing] = useState(false);

  const catalogue = usePaperUnderlyings();
  // The catalogue decides the default; if it cannot be read, the link (or NIFTY) is tried as-is.
  const underlying =
    picked ??
    (catalogue.data
      ? defaultUnderlying(catalogue.data, linked.underlying)
      : catalogue.isError
        ? (linked.underlying ?? PREFERRED_UNDERLYING)
        : null);
  const linkMissed =
    picked == null &&
    linked.underlying != null &&
    underlying != null &&
    catalogue.data != null &&
    underlying !== linked.underlying;
  const chain = usePaperChain(underlying, {
    // The linked expiry belongs to the linked underlying only.
    expiry: linkMissed ? null : expiry,
    window: strikeWindow,
  });
  // keepPreviousData: another underlying's chain is never shown under this one's name; the same
  // underlying's previous expiry or window is, dimmed, until the new one arrives.
  const shown = chain.data && chain.data.underlying === underlying ? chain.data : null;
  const placeholder = chain.isPlaceholderData && shown != null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        chain.refetch(),
        catalogue.isError ? catalogue.refetch() : Promise.resolve(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [chain, catalogue]);

  /* Chain cells */
  const outer = useMemo<ChainOuterColumn<OptionChainLeg>>(
    () =>
      view === 'value'
        ? { label: 'Lot value', main: (leg) => formatINRCompact(leg.contractValue) }
        : {
            label: 'Δ · IV',
            main: (leg) => signedGreek(leg.greeks?.delta, 2),
            sub: (leg) => ivPct(leg.impliedVolatility),
          },
    [view],
  );
  const canPick = useCallback(() => !placeholder, [placeholder]);
  // Keyed on the chain's identity strings, not the chain object: a 25 s refresh must not hand
  // every memoised grid row a new callback.
  const chainExchange = shown?.exchange ?? null;
  const chainUnderlying = shown?.underlying ?? null;
  const chainExpiry = shown?.expiry ?? null;
  const onPick = useCallback(
    (leg: OptionChainLeg, kind: 'CE' | 'PE', strike: number) => {
      if (!chainExchange || !chainUnderlying || !chainExpiry) return;
      setTicket({
        target: {
          tradingsymbol: leg.tradingsymbol,
          exchange: chainExchange,
          underlying: chainUnderlying,
          kind,
          strike,
          expiry: chainExpiry,
          lotSize: leg.lotSize,
          side: 'BUY',
          nonce: Date.now(),
        },
        seed: {
          lastPrice: leg.lastPrice,
          impliedVolatility: leg.impliedVolatility,
          delta: leg.greeks?.delta ?? null,
        },
      });
    },
    [chainExchange, chainUnderlying, chainExpiry],
  );
  const onTradeFuture = useCallback(() => {
    const future = shown?.future;
    if (!shown || !future) return;
    setTicket({
      target: {
        tradingsymbol: future.tradingsymbol,
        exchange: shown.exchange,
        underlying: shown.underlying,
        kind: 'FUT',
        strike: null,
        expiry: shown.expiry,
        lotSize: future.lotSize,
        side: 'BUY',
        nonce: Date.now(),
      },
      seed: { lastPrice: future.lastPrice, impliedVolatility: null, delta: null },
    });
  }, [shown]);
  // The ticket's price follows every refresh; a contract scrolled out of the window keeps the
  // quote it was opened with.
  const ticketQuote = ticket
    ? (chainQuote(shown, ticket.target.tradingsymbol) ?? ticket.seed)
    : null;

  /* Centre the ATM strike once per (underlying, expiry) — never on a refresh. Rows are a fixed
     height, so the offset is arithmetic (the same maths the live chain uses). */
  const scrollRef = useRef<ScrollView>(null);
  const layout = useRef({ viewport: 0, sticky: 0, rows: 0 });
  const centredFor = useRef<string | null>(null);
  const chainId = shown ? `${shown.underlying}:${shown.expiry}` : null;
  const centre = useCallback(() => {
    const l = layout.current;
    if (!shown || !chainId || centredFor.current === chainId || l.viewport === 0) return;
    const index = atmRowIndex(shown.rows, shown.atmStrike, shown.spot);
    if (index < 0) return;
    const y =
      l.rows +
      chainRowOffset(
        index,
        spotMarkerIndex(shown.rows, shown.spot),
        CHAIN_ROW_HEIGHT,
        SPOT_MARKER_HEIGHT,
      );
    const target = y + CHAIN_ROW_HEIGHT / 2 - (l.sticky + (l.viewport - l.sticky) / 2);
    scrollRef.current?.scrollTo({ y: Math.max(0, target), animated: false });
    centredFor.current = chainId;
  }, [shown, chainId]);

  const pickUnderlying = (next: string) => {
    centredFor.current = null;
    setTicket(null);
    setExpiry(null);
    setPicked(next);
  };

  // The chip tapped lights up at once; otherwise the server's answer (an unlisted expiry
  // falls back to the nearest listed one).
  const selectedExpiry =
    shown && expiry && !linkMissed && shown.expiries.includes(expiry) ? expiry : shown?.expiry;
  const notListed = isApiError(chain.error) && chain.error.status === 404;

  const header = (
    <View className="w-full max-w-[720px] self-center px-5 pb-3 pt-4">
      {linkMissed ? (
        <Banner
          className="mb-3"
          tone="info"
          message={`${linked.underlying} has no listed contracts right now, so the chain opened on ${underlying}.`}
        />
      ) : null}
      {shown ? (
        <PaperChainHeader chain={shown} onTradeFuture={placeholder ? null : onTradeFuture} />
      ) : null}
      {chain.isError && shown ? (
        <Text className="mt-2 text-[11px] text-warning-600 dark:text-warning-dark">
          Couldn’t refresh — showing the last prices.
        </Text>
      ) : null}
    </View>
  );

  const sticky = (
    <View
      className="bg-canvas dark:bg-canvas-dark"
      onLayout={(e) => {
        layout.current.sticky = e.nativeEvent.layout.height;
      }}
    >
      {shown && shown.expiries.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 10 }}
        >
          {shown.expiries.map((e) => {
            const on = e === selectedExpiry;
            // The server's own count for the chain's expiry; a calendar count for the rest.
            const days = e === shown.expiry ? shown.daysToExpiry : daysUntil(e);
            return (
              <Pressable
                key={e}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`Expiry ${expiryLabel(e)}, ${dteLabel(days)}`}
                onPress={() => {
                  if (e === selectedExpiry) return;
                  centredFor.current = null;
                  setTicket(null);
                  setExpiry(e);
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
                  {expiryLabel(e)}
                  <Text className="text-[11px] font-normal"> · {dteLabel(days)}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}
      <View className="flex-row items-center gap-3 px-5 pb-2">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Strikes shown: ${strikeWindow} each side. Change`}
          onPress={() => setPickingWindow(true)}
          className="h-9 flex-row items-center gap-1 rounded-lg border border-line px-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">
            Strikes ±{strikeWindow}
          </Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
        <SegmentedControl items={VIEWS} value={view} onChange={setView} className="flex-1" />
      </View>
      <ChainGridHeader outerLabel={outer.label} />
    </View>
  );

  let body: React.ReactNode;
  if (catalogue.data && catalogue.data.length === 0 && picked == null) {
    body = (
      <View className="px-5 pt-3">
        <InlineEmpty
          title="No contracts listed"
          message="The derivatives catalogue lists no underlying with live contracts right now."
        />
      </View>
    );
  } else if (!underlying || (chain.isPending && !shown) || (!shown && chain.isFetching)) {
    body = (
      <View className="px-5 pt-3">
        <ListSkeleton rows={8} />
      </View>
    );
  } else if (chain.isError && !shown) {
    body = (
      <View className="gap-3 px-5 pt-3">
        <InlineError
          what={`the chain for ${underlying}`}
          error={chain.error}
          onRetry={notListed ? undefined : () => void chain.refetch()}
        />
        <Button
          label="Choose another underlying"
          variant="outline"
          onPress={() => setPicking(true)}
        />
      </View>
    );
  } else if (shown && shown.rows.length === 0) {
    body = (
      <View className="px-5 pt-3">
        <InlineEmpty title="No strikes listed" message="No strikes are listed for this expiry." />
      </View>
    );
  } else if (shown) {
    body = (
      <View
        key={chainId ?? 'chain'}
        className="w-full max-w-[720px] self-center"
        style={placeholder ? { opacity: 0.45 } : undefined}
        accessibilityState={{ busy: placeholder }}
        onLayout={() => centre()}
      >
        <ChainGrid
          rows={shown.rows}
          atmStrike={shown.atmStrike}
          spot={shown.spot}
          ltp={legLtp}
          outer={outer}
          itm={legItm}
          canPick={canPick}
          onPick={onPick}
        />
      </View>
    );
  }

  const footer = shown ? (
    <View className="w-full max-w-[720px] self-center gap-3 px-5 pt-4">
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {shown.rows.length} strikes · {expiryLabel(shown.expiry)} ({dteLabel(shown.daysToExpiry)}) ·
        as of {timeIst(shown.asOf, true)} IST · {venueOf(shown.exchange)}
        {chain.isFetching ? ' · refreshing' : ''}
      </Text>
      <Button
        label="Build a strategy on this chain"
        variant="secondary"
        onPress={() => setBuilding(true)}
      />
      <Note>
        Tap any price to trade it in your paper book, in lots. Prices come from the broker’s quote
        feed behind a 20-second cache and refresh about every 25 seconds while the market is open.
        Delta and IV are model outputs, not exchange data — a strike that has not traded shows a
        dash, never a stale number.
      </Note>
      {shown.caveats.length > 0 ? (
        <Disclosure
          title="How these greeks were calculated"
          meta={`${shown.caveats.length} thing${shown.caveats.length === 1 ? '' : 's'} the model assumes`}
        >
          <Caveats items={shown.caveats} />
        </Disclosure>
      ) : null}
    </View>
  ) : null;

  return (
    <StackScreen
      title={underlying ?? 'Paper option chain'}
      subtitle={`Paper · ${shown ? `${shown.isIndex ? 'Index' : 'Stock'} options · ${venueOf(shown.exchange)}` : 'simulated F&O'}`}
      scroll={false}
      right={
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Paper positions"
            hitSlop={6}
            onPress={() => router.dismissTo(paperBookHref('positions'))}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <Wallet size={20} color={colors.text} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch underlying"
            hitSlop={6}
            onPress={() => setPicking(true)}
            className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
          >
            <Search size={20} color={colors.text} />
          </Pressable>
        </View>
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
        value={String(strikeWindow)}
        onSelect={(key) => {
          const next = Number(key);
          if (!Number.isInteger(next) || next === strikeWindow) return;
          centredFor.current = null;
          setStrikeWindow(next);
        }}
        onClose={() => setPickingWindow(false)}
      />
      <UnderlyingPickerSheet
        visible={picking}
        value={underlying}
        onPick={pickUnderlying}
        onClose={() => setPicking(false)}
      />
      <PaperTicket
        target={ticket?.target ?? null}
        quote={ticketQuote}
        onClose={() => setTicket(null)}
      />
      <StrategySheet
        visible={building}
        underlying={underlying}
        expiry={shown?.expiry ?? null}
        expiries={shown?.expiries ?? []}
        onClose={() => setBuilding(false)}
      />
    </StackScreen>
  );
}
