import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Layers from 'lucide-react-native/icons/layers';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Shapes from 'lucide-react-native/icons/shapes';
import Wallet from 'lucide-react-native/icons/wallet';
import React, { memo, useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { SearchTrigger } from '@/components/ui/SearchTrigger';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { SegmentedControl } from '@/components/ui/Tabs';
import { InstrumentRow } from '@/features/fno/components/ExploreCards';
import { InstrumentMark } from '@/features/fno/components/Glyphs';
import { Tag } from '@/features/fno/components/primitives';
import { changeLine, level } from '@/features/fno/lib/format';
import { useLiveIndices } from '@/features/market/hooks';
import { cn } from '@/lib/utils/cn';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { useFnoMovers, usePaperBook, usePaperUnderlyings } from '../hooks';
import { bookReturns, paperIndexTiles, type PaperIndexTile } from '../lib/book';
import { paperChainHref } from '../lib/routes';
import type { FnoMover, PaperView } from '../types';

import { UnderlyingPickerSheet } from './UnderlyingPickerSheet';

const NUM = { fontVariant: ['tabular-nums' as const] };

const MOVE_TABS = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
] as const;

const pnlTone = (n: number | null) =>
  n == null || n === 0
    ? 'text-ink dark:text-ink-dark'
    : n > 0
      ? 'text-brand-text dark:text-brand-text-dark'
      : 'text-danger-600 dark:text-danger-dark';

/**
 * Paper F&O Explore — the web's /fno/paper: the index strip, Top traded (the indices you can
 * option-trade here, then today's three most active F&O stocks), your paper book, and the F&O
 * stock movers — every row one tap from its paper chain. Discovery, not trading.
 *
 * Where each number comes from: indices are GET /market/indices (the live feed); Top traded
 * and the movers are GET /stocks/top-* with fnoOnly=true; the book card is GET
 * /derivatives/book's own totals. An index or stock is linked to a chain only when the
 * derivatives catalogue actually lists it.
 */
export function PaperExplore({ onOpenView }: { onOpenView: (view: PaperView) => void }) {
  const router = useRouter();
  const indices = useLiveIndices();
  const catalogue = usePaperUnderlyings();
  const book = usePaperBook();
  const topVolume = useFnoMovers('volume', 3);
  const [kind, setKind] = useState<'gainers' | 'losers'>('gainers');
  const gainers = useFnoMovers('gainers', 10, kind === 'gainers');
  const losers = useFnoMovers('losers', 10, kind === 'losers');
  const movers = kind === 'gainers' ? gainers : losers;
  const [picking, setPicking] = useState(false);

  const listed = useMemo(
    () => new Set((catalogue.data ?? []).map((u) => u.underlying)),
    [catalogue.data],
  );
  const tiles = useMemo(() => paperIndexTiles(indices.indices, listed), [indices.indices, listed]);
  const tradedIndices = useMemo(() => tiles.filter((t) => t.underlying).slice(0, 3), [tiles]);
  // Until the catalogue answers, a stock is assumed listed — the chain falls back if it is not.
  const hasChain = useCallback(
    (symbol: string) => !catalogue.data || listed.has(symbol),
    [catalogue.data, listed],
  );
  const openChain = useCallback(
    (underlying?: string | null) => router.push(paperChainHref({ underlying })),
    [router],
  );

  const traded: TradedItem[] = [
    ...tradedIndices.map((t): TradedItem => ({
      key: t.key,
      title: t.label,
      price: level(t.ltp),
      change: t.change,
      changePct: t.changePct,
      expiryToday: t.expiryToday,
      underlying: t.underlying,
    })),
    ...(topVolume.data ?? []).map((m): TradedItem => ({
      key: `${m.exchange}:${m.symbol}`,
      title: m.symbol,
      price: m.ltp != null ? formatINR(m.ltp) : 'No price',
      change: m.changeAbs ?? null,
      changePct: m.changePct,
      expiryToday: false,
      underlying: hasChain(m.symbol) ? m.symbol : null,
    })),
  ];
  const tradedRows: TradedItem[][] = [];
  for (let i = 0; i < traded.length; i += 2) tradedRows.push(traded.slice(i, i + 2));
  const tradedLoading = topVolume.isPending || (indices.isLoading && tiles.length === 0);

  return (
    <View>
      <SearchTrigger
        placeholder="Search NIFTY, BANKNIFTY, RELIANCE…"
        onPress={() => setPicking(true)}
      />

      {tiles.length > 0 ? (
        <IndexStrip tiles={tiles} onOpen={openChain} />
      ) : indices.isLoading ? (
        <View className="mt-4 flex-row gap-2">
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              className="h-[58px] flex-1 rounded-xl border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
            />
          ))}
        </View>
      ) : null}

      <Section title="Top traded" className="mt-6">
        <Text className="-mt-1.5 mb-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          Indices you can option-trade here, then today’s most active F&amp;O stocks by volume.
        </Text>
        {traded.length === 0 && tradedLoading ? (
          <View className="gap-2.5">
            {[0, 1].map((row) => (
              <View key={row} className="flex-row gap-2.5">
                <TileSkeleton />
                <TileSkeleton />
              </View>
            ))}
          </View>
        ) : traded.length === 0 ? (
          topVolume.isError ? (
            <InlineError
              what="the most active F&O stocks"
              error={topVolume.error}
              onRetry={() => void topVolume.refetch()}
            />
          ) : (
            <InlineEmpty
              title="Nothing to show yet"
              message="The price snapshot may still be warming up."
            />
          )
        ) : (
          <View className="gap-2.5">
            {tradedRows.map((row) => (
              <View key={row.map((t) => t.key).join('|')} className="flex-row gap-2.5">
                {row.map((item) => (
                  <TradedCard key={item.key} item={item} onOpen={openChain} />
                ))}
                {row.length === 1 ? <View className="flex-1" /> : null}
              </View>
            ))}
          </View>
        )}
      </Section>

      <BookCard book={book} onOpen={() => onOpenView('positions')} />

      <Section title="F&O stocks">
        <Text className="-mt-1.5 mb-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint">
          NSE names with listed derivatives, by today’s change.
        </Text>
        <SegmentedControl items={MOVE_TABS} value={kind} onChange={setKind} className="mb-3" />
        <MoversList
          query={movers}
          kind={kind}
          hasChain={hasChain}
          onOpen={(symbol) => openChain(symbol)}
        />
      </Section>

      <PaperTools
        onChain={() => openChain(null)}
        onBuilder={() => router.push(paperChainHref({ builder: true }))}
        onOpenView={onOpenView}
      />

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Simulated futures and options, priced with a Black-Scholes model over the broker’s quotes —
        greeks and implied volatility are modelled, not exchange data. Orders spend the paper
        F&amp;O pool, which is separate from delivery and intraday.
      </Text>

      <UnderlyingPickerSheet
        visible={picking}
        value={null}
        onPick={(underlying) => openChain(underlying)}
        onClose={() => setPicking(false)}
      />
    </View>
  );
}

/* ── Index strip ─────────────────────────────────────────────────────────────────────── */

function IndexStrip({
  tiles,
  onOpen,
}: {
  tiles: readonly PaperIndexTile[];
  onOpen: (underlying: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="-mx-5 mt-4"
      contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
    >
      {tiles.map((t) => {
        const underlying = t.underlying;
        return (
          <Pressable
            key={t.key}
            accessibilityRole={underlying ? 'button' : undefined}
            accessibilityLabel={`${t.label} ${level(t.ltp)}, ${changeLine(t.change, t.changePct)}${
              t.expiryToday ? ', an option expires today' : ''
            }${underlying ? '. Opens the paper chain' : ''}`}
            disabled={!underlying}
            onPress={underlying ? () => onOpen(underlying) : undefined}
            className="min-w-[128px] rounded-xl border border-line bg-surface px-3 py-2 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
          >
            <View className="flex-row items-center gap-1.5">
              <Text
                className="text-xs font-semibold text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {t.label}
              </Text>
              {t.expiryToday ? <Tag label="Expiry" tone="warning" /> : null}
            </View>
            <Text
              className="mt-0.5 text-sm font-semibold text-ink dark:text-ink-dark"
              style={NUM}
              numberOfLines={1}
            >
              {level(t.ltp)}
            </Text>
            <ChangeText
              value={t.changePct ?? t.change}
              className="text-[11px]"
              style={NUM}
              numberOfLines={1}
            >
              {changeLine(t.change, t.changePct)}
            </ChangeText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ── Top traded ──────────────────────────────────────────────────────────────────────── */

interface TradedItem {
  key: string;
  title: string;
  price: string;
  change: number | null;
  changePct: number | null;
  expiryToday: boolean;
  /** The chain this card opens, or null when none is listed. */
  underlying: string | null;
}

const TradedCard = memo(function TradedCard({
  item,
  onOpen,
}: {
  item: TradedItem;
  onOpen: (underlying: string) => void;
}) {
  const underlying = item.underlying;
  const move = changeLine(item.change, item.changePct);
  return (
    <Pressable
      accessibilityRole={underlying ? 'button' : undefined}
      accessibilityLabel={`${item.title}, ${item.price}, ${move}${underlying ? ', opens the paper chain' : ''}`}
      disabled={!underlying}
      onPress={underlying ? () => onOpen(underlying) : undefined}
      className="flex-1 rounded-card border border-line bg-surface p-3 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="flex-row items-center gap-1.5">
        <Text
          className="min-w-0 flex-shrink text-[13px] font-semibold text-ink dark:text-ink-dark"
          numberOfLines={1}
        >
          {item.title}
        </Text>
        {item.expiryToday ? <Tag label="Expiry" tone="warning" /> : null}
      </View>
      <Text
        className="mt-2 text-base font-bold text-ink dark:text-ink-dark"
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {item.price}
      </Text>
      <ChangeText
        value={item.changePct ?? item.change}
        className="mt-0.5 text-xs"
        style={NUM}
        numberOfLines={1}
      >
        {move}
      </ChangeText>
    </Pressable>
  );
});

function TileSkeleton() {
  return (
    <View className="flex-1 rounded-card border border-line bg-surface p-3 dark:border-line-dark dark:bg-surface-dark">
      <View className="h-3 w-3/5 rounded bg-line dark:bg-line-dark" />
      <View className="mt-3 h-4 w-1/2 rounded bg-line dark:bg-line-dark" />
      <View className="mt-1.5 h-2.5 w-2/3 rounded bg-line dark:bg-line-dark" />
    </View>
  );
}

/* ── Your paper book ─────────────────────────────────────────────────────────────────── */

function BookCard({ book, onOpen }: { book: ReturnType<typeof usePaperBook>; onOpen: () => void }) {
  const { colors } = useTheme();
  const data = book.data;
  const returns = data ? bookReturns(data.totals) : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        data
          ? `Your paper F&O book. Returns ${formatSignedINR(returns)}. Margin blocked ${formatINR(data.totals.marginBlocked)}. ${data.positions.length} open positions. Opens positions.`
          : 'Your paper F&O book. Opens positions.'
      }
      onPress={onOpen}
      className="mt-6 rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">
          Your paper F&amp;O book
        </Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Positions
          </Text>
          <ChevronRight size={16} color={colors.link} />
        </View>
      </View>
      {data ? (
        <View className="flex-row gap-3">
          <BookStat label="F&O returns" value={formatSignedINR(returns)} tone={pnlTone(returns)} />
          <View className="w-px bg-line dark:bg-line-dark" />
          <BookStat label="Margin blocked" value={formatINR(data.totals.marginBlocked, 0)} />
          <View className="w-px bg-line dark:bg-line-dark" />
          <BookStat label="Open" value={String(data.positions.length)} />
        </View>
      ) : book.isError ? (
        <View className="flex-row items-center justify-between gap-3">
          <Text className="flex-1 text-[13px] text-ink-muted dark:text-ink-dark-muted">
            Couldn’t load your book.
          </Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={8}
            onPress={() => void book.refetch()}
            className="active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Try again
            </Text>
          </Pressable>
        </View>
      ) : (
        <View className="flex-row gap-3">
          {[0, 1, 2].map((i) => (
            <View key={i} className="flex-1 gap-2">
              <View className="h-2.5 w-3/4 rounded bg-line dark:bg-line-dark" />
              <View className="h-4 w-1/2 rounded bg-line dark:bg-line-dark" />
            </View>
          ))}
        </View>
      )}
      <Text className="mt-3 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        Simulated — paper capital only, in its own F&amp;O pool.
      </Text>
    </Pressable>
  );
}

function BookStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <View className="flex-1">
      <Text className="text-xs text-ink-muted dark:text-ink-dark-muted" numberOfLines={1}>
        {label}
      </Text>
      <Text
        className={cn('mt-1 text-base font-bold', tone ?? 'text-ink dark:text-ink-dark')}
        style={NUM}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </View>
  );
}

/* ── F&O stock movers ────────────────────────────────────────────────────────────────── */

function MoversList({
  query,
  kind,
  hasChain,
  onOpen,
}: {
  query: ReturnType<typeof useFnoMovers>;
  kind: 'gainers' | 'losers';
  hasChain: (symbol: string) => boolean;
  onOpen: (symbol: string) => void;
}) {
  const rows: FnoMover[] = query.data ?? [];
  if (query.isPending) {
    return (
      <ListCard>
        {[0, 1, 2].map((i) => (
          <View
            key={i}
            className="flex-row items-center gap-3 border-b border-line px-3.5 py-3.5 dark:border-line-dark"
          >
            <View className="h-9 w-9 rounded-[11px] bg-line dark:bg-line-dark" />
            <View className="flex-1 gap-2">
              <View className="h-3 w-2/5 rounded bg-line dark:bg-line-dark" />
              <View className="h-2.5 w-1/4 rounded bg-line dark:bg-line-dark" />
            </View>
          </View>
        ))}
      </ListCard>
    );
  }
  if (query.isError && !query.data) {
    return (
      <InlineError what={`F&O ${kind}`} error={query.error} onRetry={() => void query.refetch()} />
    );
  }
  if (rows.length === 0) {
    return (
      <InlineEmpty
        title={`No F&O ${kind} yet`}
        message="The price snapshot may still be warming up."
      />
    );
  }
  return (
    <ListCard>
      {rows.map((m, index) => {
        const linked = hasChain(m.symbol);
        return (
          <React.Fragment key={`${m.exchange}:${m.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <InstrumentRow
              mark={<InstrumentMark kind="stock" underlying={m.symbol} />}
              title={m.symbol}
              meta={m.companyName ?? m.exchange}
              price={m.ltp != null ? formatINR(m.ltp) : '—'}
              change={m.changeAbs ?? null}
              changePct={m.changePct}
              onPress={linked ? () => onOpen(m.symbol) : null}
            />
          </React.Fragment>
        );
      })}
    </ListCard>
  );
}

/* ── Where to go next ────────────────────────────────────────────────────────────────── */

function PaperTools({
  onChain,
  onBuilder,
  onOpenView,
}: {
  onChain: () => void;
  onBuilder: () => void;
  onOpenView: (view: PaperView) => void;
}) {
  const tools: { label: string; Icon: IconComponent; tone: IconTone; onPress: () => void }[] = [
    { label: 'Option chain', Icon: Layers, tone: 'blue', onPress: onChain },
    { label: 'Strategies', Icon: Shapes, tone: 'violet', onPress: onBuilder },
    { label: 'Positions', Icon: Wallet, tone: 'green', onPress: () => onOpenView('positions') },
    { label: 'Orders', Icon: ListChecks, tone: 'teal', onPress: () => onOpenView('orders') },
  ];
  return (
    <Section title="Go to">
      <View className="flex-row">
        {tools.map(({ label, Icon, tone, onPress }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={onPress}
            className="w-1/4 items-center gap-2 active:opacity-70"
          >
            <IconTile Icon={Icon} tone={tone} size="lg" />
            <Text
              className="text-center text-xs font-medium text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}
