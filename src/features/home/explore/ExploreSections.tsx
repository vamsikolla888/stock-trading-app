import { useRouter } from 'expo-router';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Badge } from '@/components/ui/Badge';
import { IconTile } from '@/components/ui/IconTile';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { stockLogoUrl } from '@/features/market/api';
import {
  useClearRecentlyViewed,
  useMovers,
  useRecentlyViewed,
  useScreeners,
} from '@/features/market/hooks';
import type { Mover, MoverKind } from '@/features/market/types';
import { stockHref } from '@/lib/navigation';
import {
  formatCompactNumber,
  formatINR,
  formatNumber,
  formatSignedPercent,
} from '@/lib/utils/formatters';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { MoverRow } from '../components/MoverRow';
import { formatIstDateTime } from '../lib/istTime';

const numbers = { fontVariant: ['tabular-nums' as const] };

// ── Recently viewed ─────────────────────────────────────────────────────────────────────

/**
 * The stocks this user opened last, newest first, as a sideways strip. Absent entirely for
 * a new account — it fills itself in from the first stock opened.
 */
export function RecentlyViewedStrip() {
  const router = useRouter();
  const recent = useRecentlyViewed(5);
  const clear = useClearRecentlyViewed();
  const items = (recent.data ?? []).slice(0, 5);
  if (items.length === 0) return null;

  const confirmClear = () =>
    Alert.alert('Clear recently viewed?', 'This removes every stock from the list.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () =>
          clear.mutate(undefined, {
            onSuccess: () => toast.success('Recently viewed cleared'),
            onError: (error) => toast.error('Couldn’t clear the list', getErrorMessage(error)),
          }),
      },
    ]);

  return (
    <Section
      title="Recently viewed"
      className="mt-6"
      action={{ label: clear.isPending ? 'Clearing…' : 'Clear', onPress: confirmClear }}
    >
      <View className="flex-row items-center gap-1.5">
        {items.map((item) => (
          <Pressable
            key={`${item.exchange}:${item.symbol}`}
            accessibilityRole="button"
            accessibilityLabel={`${item.companyName ?? item.symbol}, ${formatSignedPercent(item.changePct)}`}
            onPress={() => router.push(stockHref(item.symbol, item.exchange))}
            className="flex-1 items-center rounded-card bg-surface px-1 py-2.5 active:bg-surface-sunk dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
          >
            <StockLogo symbol={item.symbol} uri={stockLogoUrl(item.symbol)} />
            <Text
              className="mt-1.5 text-[11px] font-semibold text-ink dark:text-ink-dark"
              numberOfLines={1}
            >
              {item.symbol}
            </Text>
            <ChangeText value={item.changePct} className="mt-0.5 text-[10px]" style={numbers}>
              {formatSignedPercent(item.changePct)}
            </ChangeText>
          </Pressable>
        ))}
      </View>
    </Section>
  );
}

// ── Top movers ──────────────────────────────────────────────────────────────────────────

const MOVER_CHIPS: readonly { key: MoverKind; label: string }[] = [
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'volume', label: 'Most traded' },
];

const PREVIEW_ROWS = 5;

/** The web's movers table as rows: five per ranking, the full lists behind "See all". */
export function MoversPreview() {
  const router = useRouter();
  const [kind, setKind] = useState<MoverKind>('gainers');
  // Volume asks for ten — the same query (and cache entry) as the Most traded shelf.
  const movers = useMovers(kind, kind === 'volume' ? 10 : PREVIEW_ROWS);

  let body: React.ReactNode;
  if (movers.isPending) body = <ListSkeleton rows={PREVIEW_ROWS} />;
  else if (movers.error && !movers.data)
    body = (
      <InlineError what="top movers" error={movers.error} onRetry={() => void movers.refetch()} />
    );
  else if (!movers.data || movers.data.length === 0)
    body = (
      <InlineEmpty
        title="Nothing to rank yet"
        message="The price snapshot may still be warming up."
      />
    );
  else
    body = (
      <ListCard className={movers.isPlaceholderData ? 'opacity-60' : undefined}>
        {movers.data.slice(0, PREVIEW_ROWS).map((mover, index) => (
          <View key={`${mover.exchange}:${mover.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <MoverRow
              mover={mover}
              kind={kind}
              onPress={() => router.push(stockHref(mover.symbol, mover.exchange))}
            />
          </View>
        ))}
      </ListCard>
    );

  return (
    <Section
      title="Top movers"
      action={{
        label: 'See all',
        onPress: () =>
          router.push(
            kind === 'volume' ? '/most-traded' : { pathname: '/movers', params: { kind } },
          ),
      }}
    >
      <Chips items={MOVER_CHIPS} value={kind} onChange={setKind} className="mb-3" />
      {body}
      <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
        {kind === 'volume' ? 'By volume traded today' : 'By change since the previous close'} · NSE
      </Text>
    </Section>
  );
}

// ── Most traded ─────────────────────────────────────────────────────────────────────────

function TradedCard({ mover, onPress }: { mover: Mover; onPress: () => void }) {
  const title = mover.companyName || mover.symbol;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${formatINR(mover.ltp)}, ${formatSignedPercent(mover.changePct)}${
        mover.volume != null ? `, ${formatCompactNumber(mover.volume)} shares traded` : ''
      }`}
      onPress={onPress}
      className="w-[148px] rounded-card border border-line bg-surface p-3.5 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
    >
      <StockLogo symbol={mover.symbol} uri={stockLogoUrl(mover.symbol)} />
      <Text
        className="mt-3 min-h-[36px] text-[13px] font-medium leading-[18px] text-ink dark:text-ink-dark"
        numberOfLines={2}
      >
        {title}
      </Text>
      <Text className="mt-2 text-sm font-semibold text-ink dark:text-ink-dark" style={numbers}>
        {formatINR(mover.ltp)}
      </Text>
      <ChangeText value={mover.changePct} className="mt-0.5 text-xs" style={numbers}>
        {formatSignedPercent(mover.changePct)}
      </ChangeText>
      {mover.volume != null ? (
        <Text
          className="mt-1.5 text-[11px] text-ink-faint dark:text-ink-dark-faint"
          numberOfLines={1}
        >
          {formatCompactNumber(mover.volume)} shares
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Ten most-traded names by day volume, as a sideways shelf of cards. */
export function MostTradedShelf() {
  const router = useRouter();
  const movers = useMovers('volume', 10);

  let body: React.ReactNode;
  if (movers.isPending) {
    body = (
      <View className="flex-row gap-2.5">
        {[0, 1].map((key) => (
          <View
            key={key}
            className="h-[176px] w-[148px] rounded-card border border-line bg-surface dark:border-line-dark dark:bg-surface-dark"
          />
        ))}
      </View>
    );
  } else if (movers.error && !movers.data) {
    body = (
      <InlineError
        what="most-traded stocks"
        error={movers.error}
        onRetry={() => void movers.refetch()}
      />
    );
  } else if (!movers.data || movers.data.length === 0) {
    body = (
      <InlineEmpty
        title="Nothing to show yet"
        message="The volume snapshot may still be warming up."
      />
    );
  } else {
    body = (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="-mx-5"
        contentContainerStyle={{ paddingHorizontal: 20, gap: 10 }}
      >
        {movers.data.map((mover) => (
          <TradedCard
            key={`${mover.exchange}:${mover.symbol}`}
            mover={mover}
            onPress={() => router.push(stockHref(mover.symbol, mover.exchange))}
          />
        ))}
      </ScrollView>
    );
  }

  return (
    <Section
      title="Most traded"
      action={{
        label: 'See all',
        onPress: () => router.push('/most-traded'),
      }}
    >
      {body}
    </Section>
  );
}

// ── Screens ─────────────────────────────────────────────────────────────────────────────

const SCREENS_SHOWN = 6;

/**
 * The built-in screens and how many stocks each matches now, in the server's order —
 * deliberately not re-sorted by count (a loose screen matching 2,000 would top a list it
 * says little about). "Not scanned yet" is never shown as 0.
 */
export function ScreensCard() {
  const router = useRouter();
  const { colors } = useTheme();
  const screeners = useScreeners();
  const list = screeners.data ?? [];

  const lastRun = list.reduce<string | null>(
    (latest, screener) =>
      screener.runAt && (latest === null || screener.runAt > latest) ? screener.runAt : latest,
    null,
  );
  const universe = list.reduce<number | null>(
    (max, screener) => (screener.runAt === null ? max : Math.max(max ?? 0, screener.universeSize)),
    null,
  );

  let body: React.ReactNode;
  if (screeners.isPending) body = <ListSkeleton rows={3} />;
  else if (screeners.error && !screeners.data)
    body = (
      <InlineError
        what="screens"
        error={screeners.error}
        onRetry={() => void screeners.refetch()}
      />
    );
  else if (list.length === 0) body = <InlineEmpty title="No screens are configured" />;
  else
    body = (
      <>
        <ListCard>
          {list.slice(0, SCREENS_SHOWN).map((screener, index) => (
            <View key={screener.id}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${screener.label}, ${
                  screener.runAt === null
                    ? 'not scanned yet'
                    : `${screener.matchCount} match${screener.matchCount === 1 ? '' : 'es'}`
                }`}
                onPress={() =>
                  router.push({ pathname: '/screeners/[id]', params: { id: screener.id } })
                }
                className="min-h-[56px] flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <IconTile Icon={SlidersHorizontal} tone="blue" size="sm" />
                <Text
                  className="flex-1 text-sm font-semibold text-ink dark:text-ink-dark"
                  numberOfLines={1}
                >
                  {screener.label}
                </Text>
                {screener.runAt === null ? (
                  <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
                    Not scanned yet
                  </Text>
                ) : (
                  <Badge
                    label={formatNumber(screener.matchCount, 0)}
                    variant={screener.matchCount > 0 ? 'primary' : 'neutral'}
                  />
                )}
                <ChevronRight size={16} color={colors.textFaint} />
              </Pressable>
            </View>
          ))}
        </ListCard>
        <Text className="mt-2 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {list.length} screens
          {universe !== null ? ` · ${formatNumber(universe, 0)} symbols` : ''}
          {lastRun ? ` · last scan ${formatIstDateTime(lastRun)} IST` : ''}
        </Text>
      </>
    );

  return (
    <Section
      title="Screens"
      action={{ label: 'See all', onPress: () => router.push('/intel/screeners') }}
    >
      {body}
    </Section>
  );
}
