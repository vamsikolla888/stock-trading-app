import { useRouter, type Href } from 'expo-router';
import CalendarClock from 'lucide-react-native/icons/calendar-clock';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import FlaskConical from 'lucide-react-native/icons/flask-conical';
import Layers from 'lucide-react-native/icons/layers';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Plug from 'lucide-react-native/icons/plug';
import Wallet from 'lucide-react-native/icons/wallet';
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { InlineEmpty } from '@/components/common/InlineError';
import type { IconComponent } from '@/components/ui/icon';
import { IconTile, type IconTone } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { RangeSelector, SegmentedControl } from '@/components/ui/Tabs';
import { cn } from '@/lib/utils/cn';
import { formatCompactNumber, formatINR, formatSignedINR } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';

import { useFnoPositions, useFnoStatus } from '../hooks';
import { summarisePositions } from '../lib/chain';
import { chainHref, isChainExchange, liveMove, periodBase, PERIODS } from '../lib/explore';
import { daysUntil, dteLabel, expiryLabel, futureTitle } from '../lib/format';
import type { CommodityReturns, ExploreFuture, ExplorePeriod, FnoExploreSummary } from '../types';

import { InstrumentRow, QuoteCard, QuoteCardSkeleton } from './ExploreCards';
import { InstrumentMark } from './Glyphs';

const NUM = { fontVariant: ['tabular-nums' as const] };

/* ── Your F&O (the web rail's Positions card) ─────────────────────────────────────────── */

const RETURNS_REASON: Record<Exclude<CommodityReturns['reason'], null>, string> = {
  'not-connected': 'Connect mStock to see commodity returns',
  'session-expired': 'Your mStock session has expired',
  unavailable: 'mStock did not answer',
};

/**
 * F&O returns = today's realised (Groww's figure) + unrealised on open lines at the latest
 * price — the same sum the Positions screen shows. Commodity returns come from mStock (Groww's
 * API has no commodity segment). A figure that cannot be computed is a dash with the reason —
 * never ₹0.00, which would read as "flat".
 */
export function YourFnoCard({
  commodityReturns,
}: {
  commodityReturns: CommodityReturns | undefined;
}) {
  const router = useRouter();
  const { colors } = useTheme();
  const status = useFnoStatus();
  const g = status.data?.groww;
  const growwOk = g?.usable === true || g?.reason === 'plan';
  const positions = useFnoPositions(growwOk);
  const summary = positions.data
    ? summarisePositions(positions.data.positions, positions.data.totals.realisedPnl)
    : null;
  const fnoReturns = summary?.total ?? null;
  const fnoWhy = !g
    ? null
    : growwOk
      ? positions.isError
        ? 'Groww did not return positions'
        : summary && fnoReturns == null
          ? 'An open line has no price'
          : summary
            ? `${summary.open.length} open · realised + unrealised`
            : 'Loading…'
      : g.reason === 'not-connected'
        ? 'Connect Groww to see F&O returns'
        : g.reason === 'session-expired'
          ? 'Your Groww session has expired'
          : 'Groww is not answering';
  const cr = commodityReturns;
  const crWhy = !cr
    ? null
    : cr.reason
      ? RETURNS_REASON[cr.reason]
      : cr.pnl == null
        ? 'A position has no P&L figure'
        : `${cr.openCount} open · from mStock`;

  const tone = (n: number | null) =>
    n == null || n === 0
      ? 'text-ink dark:text-ink-dark'
      : n > 0
        ? 'text-brand-text dark:text-brand-text-dark'
        : 'text-danger-600 dark:text-danger-dark';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Your F&O. F&O returns ${formatSignedINR(fnoReturns)}. Commodity returns ${formatSignedINR(cr?.pnl ?? null)}. Opens positions.`}
      onPress={() => router.push('/fno/positions')}
      className="mt-6 rounded-card border border-line bg-surface p-4 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <View className="mb-3 flex-row items-center justify-between">
        <Text className="text-[15px] font-bold text-ink dark:text-ink-dark">Your F&amp;O</Text>
        <View className="flex-row items-center gap-0.5">
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Positions
          </Text>
          <ChevronRight size={16} color={colors.link} />
        </View>
      </View>
      <View className="flex-row gap-3">
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">F&amp;O returns</Text>
          <Text
            className={cn('mt-1 text-base font-bold', tone(fnoReturns))}
            style={NUM}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatSignedINR(fnoReturns)}
          </Text>
          {fnoWhy ? (
            <Text
              className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={2}
            >
              {fnoWhy}
            </Text>
          ) : null}
        </View>
        <View className="w-px bg-line dark:bg-line-dark" />
        <View className="flex-1">
          <Text className="text-xs text-ink-muted dark:text-ink-dark-muted">Commodity returns</Text>
          <Text
            className={cn('mt-1 text-base font-bold', tone(cr?.pnl ?? null))}
            style={NUM}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatSignedINR(cr?.pnl ?? null)}
          </Text>
          {crWhy ? (
            <Text
              className="mt-0.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={2}
            >
              {crWhy}
            </Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/* ── F&O stocks: gainers / losers over 1D / 1W / 1M ───────────────────────────────────── */

const MOVE_TABS = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
] as const;

/**
 * The RANKING is the server's; the app only re-measures the price against the same baseline.
 * 1W/1M moves are against the close 5 / 21 sessions back — a stock with stale stored bars has
 * no longer-period move and is not ranked. Volume is the cash market's, where known.
 */
export function FnoStocksShelf({ stocks }: { stocks: FnoExploreSummary['stocks'] | undefined }) {
  const router = useRouter();
  const [period, setPeriod] = useState<ExplorePeriod>('d1');
  const [tab, setTab] = useState<'gainers' | 'losers'>('gainers');
  const rows = useMemo(() => (stocks?.[period][tab] ?? []).slice(0, 8), [stocks, period, tab]);

  return (
    <Section
      title="F&O stocks"
      action={{
        label: 'See more',
        onPress: () =>
          router.push({ pathname: '/fno-list/[section]', params: { section: 'stocks' } }),
      }}
    >
      <View className="mb-3 flex-row items-center gap-3">
        <SegmentedControl items={MOVE_TABS} value={tab} onChange={setTab} className="flex-1" />
        <RangeSelector items={PERIODS} value={period} onChange={setPeriod} />
      </View>
      {!stocks ? (
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
      ) : rows.length === 0 ? (
        <InlineEmpty
          title={
            period === 'd1'
              ? `No F&O stock is ${tab === 'gainers' ? 'up' : 'down'} on the day yet`
              : 'No moves for this period'
          }
          message={
            period === 'd1'
              ? undefined
              : 'The stored daily bars behind longer-period moves are missing or out of date.'
          }
        />
      ) : (
        <ListCard>
          {rows.map((r, index) => {
            const m = liveMove(r.ltp, periodBase(r, period));
            return (
              <React.Fragment key={`${r.exchange}:${r.underlying}`}>
                {index > 0 ? <RowDivider /> : null}
                <InstrumentRow
                  mark={
                    <InstrumentMark
                      kind="stock"
                      underlying={r.underlying}
                      logoSymbol={r.spotSymbol}
                    />
                  }
                  title={r.label}
                  meta={`${r.underlying} · lot ${r.lotSize?.toLocaleString('en-IN') ?? '—'} · ${expiryLabel(r.nearestExpiry)}`}
                  price={r.ltp != null ? formatINR(r.ltp) : '—'}
                  change={m.change}
                  changePct={m.changePct}
                  trailing={r.volume != null ? `Vol ${formatCompactNumber(r.volume)}` : null}
                  onPress={() => router.push(chainHref(r.exchange, r.underlying))}
                />
              </React.Fragment>
            );
          })}
        </ListCard>
      )}
    </Section>
  );
}

/* ── Products & tools ────────────────────────────────────────────────────────────────── */

const TOOLS: { label: string; href: Href; Icon: IconComponent; tone: IconTone }[] = [
  { label: 'Option chain', href: chainHref('NFO', 'NIFTY') as Href, Icon: Layers, tone: 'blue' },
  { label: 'Expiry calendar', href: '/fno-expiries', Icon: CalendarClock, tone: 'amber' },
  { label: 'Paper F&O', href: '/fno/paper', Icon: FlaskConical, tone: 'violet' },
  { label: 'Positions', href: '/fno/positions', Icon: Wallet, tone: 'green' },
  { label: 'Orders', href: '/fno/orders', Icon: ListChecks, tone: 'teal' },
  { label: 'Groww API', href: '/brokers', Icon: Plug, tone: 'slate' },
];

/** Groww's "Products & tools": a grid of entry points into the rest of the F&O module. */
export function FnoToolsGrid() {
  const router = useRouter();
  return (
    <Section title="Products & tools">
      <View className="flex-row flex-wrap gap-y-4">
        {TOOLS.map(({ label, href, Icon, tone }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => router.push(href)}
            className="w-1/3 items-center gap-2 active:opacity-70"
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

/* ── Futures / commodity shelves ─────────────────────────────────────────────────────── */

/** A sideways shelf of futures (index, stock or commodity), with its ranking caption. */
export function FuturesShelf({
  title,
  section,
  caption,
  rows,
  loading,
  empty,
  commodity = false,
  note,
  titleOf = (f) => futureTitle(f.label, f.expiry),
  subOf,
}: {
  title: string;
  section: 'index-futures' | 'stock-futures' | 'commodities' | 'commodity-futures';
  caption?: string | null;
  rows: ExploreFuture[] | undefined;
  loading: boolean;
  empty: string;
  commodity?: boolean;
  note?: string | null;
  titleOf?: (f: ExploreFuture) => string;
  subOf?: (f: ExploreFuture) => string | null;
}) {
  const router = useRouter();
  return (
    <Section
      title={title}
      action={{
        label: 'See more',
        onPress: () => router.push({ pathname: '/fno-list/[section]', params: { section } }),
      }}
    >
      {caption ? (
        <Text
          className="-mt-1.5 mb-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={2}
        >
          {caption}
        </Text>
      ) : null}
      {note ? (
        <Text className="mb-3 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
          {note}
        </Text>
      ) : null}
      {loading && !rows ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        >
          {[0, 1, 2].map((i) => (
            <QuoteCardSkeleton key={i} />
          ))}
        </ScrollView>
      ) : rows && rows.length === 0 ? (
        <InlineEmpty title={empty} />
      ) : rows ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          className="-mx-5"
          contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
        >
          {rows.map((f) => {
            const m = liveMove(f.ltp, f.prevClose);
            const exchange = f.exchange;
            return (
              <QuoteCard
                key={`${f.exchange}:${f.tradingSymbol}`}
                mark={
                  <InstrumentMark
                    kind={commodity ? 'commodity' : f.logoSymbol ? 'stock' : 'index'}
                    underlying={f.underlying}
                    logoSymbol={f.logoSymbol}
                    size={32}
                  />
                }
                title={titleOf(f)}
                sub={
                  subOf
                    ? subOf(f)
                    : `${dteLabel(daysUntil(f.expiry))} · lot ${f.lotSize.toLocaleString('en-IN')}`
                }
                ltp={f.ltp}
                change={m.change ?? f.change}
                changePct={m.changePct ?? f.changePct}
                onPress={
                  !commodity && isChainExchange(exchange)
                    ? () => router.push(chainHref(exchange, f.underlying, { tab: 'futures' }))
                    : null
                }
              />
            );
          })}
        </ScrollView>
      ) : null}
    </Section>
  );
}
