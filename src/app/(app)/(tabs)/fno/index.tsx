import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { SearchTrigger } from '@/components/ui/SearchTrigger';
import { Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { TradedTile, TradedTileSkeleton } from '@/features/fno/components/ExploreCards';
import {
  FnoStocksShelf,
  FnoToolsGrid,
  FuturesShelf,
  YourFnoCard,
} from '@/features/fno/components/ExploreSections';
import { Freshness, GrowwAccessBanner } from '@/features/fno/components/FnoChrome';
import { Caveats, Disclosure } from '@/features/fno/components/primitives';
import { SearchSheet } from '@/features/fno/components/SearchSheet';
import { useFnoExplore, useFnoStatus } from '@/features/fno/hooks';
import { chainHref, isChainExchange, liveMove } from '@/features/fno/lib/explore';
import { expiryLabel, futureTitle } from '@/features/fno/lib/format';
import type { ExploreTile } from '@/features/fno/types';

const TOP_KINDS = [
  { key: 'equity', label: 'Equity' },
  { key: 'commodities', label: 'Commodities' },
] as const;

/**
 * F&O Explore, after Groww's: top traded (with each instrument's session in mini candles),
 * your F&O returns, F&O stock movers, tools, then commodities and index / stock / commodity
 * futures. The whole screen is ONE request (GET /fno/explore, refreshed every 15 s in market
 * hours); where every price came from and when is always on screen, and each shelf says how
 * it is ranked.
 */
export default function FnoExploreScreen() {
  const router = useRouter();
  const explore = useFnoExplore();
  const status = useFnoStatus();
  const data = explore.data;
  const [topKind, setTopKind] = useState<'equity' | 'commodities'>('equity');
  const [searching, setSearching] = useState(false);

  const onRefresh = useCallback(
    () => Promise.all([explore.refetch(), status.refetch()]),
    [explore, status],
  );
  // No dataset at all (first load failed): the price shelves have nothing to show, so only the
  // error with its retry stands in for them — not empty headings and skeletons that never fill.
  const failed = explore.isError && !data;

  const tiles = data
    ? topKind === 'equity'
      ? data.topTraded.equity
      : data.topTraded.commodities
    : null;
  const tileRows = useMemo(() => {
    const out: ExploreTile[][] = [];
    for (let i = 0; i < (tiles?.length ?? 0); i += 2) out.push((tiles ?? []).slice(i, i + 2));
    return out;
  }, [tiles]);

  return (
    <GroupScreen onRefresh={onRefresh}>
      <SearchTrigger
        placeholder="Search NIFTY, RELIANCE, GOLD or a contract"
        onPress={() => setSearching(true)}
      />
      <GrowwAccessBanner quietPlan className="mt-4" />
      <Freshness
        className="mt-3"
        source={data?.sources.equity}
        asOf={data?.asOf}
        updatedAt={explore.dataUpdatedAt}
        refreshFailed={explore.isError && !!data}
      />

      {failed ? (
        <InlineError
          className="mt-4"
          what="F&O markets"
          error={explore.error}
          onRetry={() => void explore.refetch()}
        />
      ) : null}

      {failed ? null : (
        <Section
          title="Top traded"
          className="mt-5"
          action={{
            label: 'See more',
            onPress: () =>
              router.push({ pathname: '/fno-list/[section]', params: { section: 'underlyings' } }),
          }}
        >
          <Chips items={TOP_KINDS} value={topKind} onChange={setTopKind} className="mb-3" />
          {data?.ranking.topTraded && topKind === 'equity' ? (
            <Text
              className="mb-3 text-xs leading-[17px] text-ink-faint dark:text-ink-dark-faint"
              numberOfLines={2}
            >
              {data.ranking.topTraded}
            </Text>
          ) : null}
          {!tiles && explore.isLoading ? (
            <View className="gap-2.5">
              {[0, 1].map((row) => (
                <View key={row} className="flex-row gap-2.5">
                  <TradedTileSkeleton />
                  <TradedTileSkeleton />
                </View>
              ))}
            </View>
          ) : tiles && tiles.length === 0 ? (
            <InlineEmpty
              title={
                topKind === 'commodities' ? 'No MCX contracts listed' : 'No F&O underlyings listed'
              }
              message={
                topKind === 'commodities'
                  ? 'Groww’s instrument master lists no MCX contracts right now.'
                  : undefined
              }
            />
          ) : (
            <View className="gap-2.5">
              {tileRows.map((row) => (
                <View
                  key={row
                    .map((t) => `${t.exchange}:${t.underlying}:${t.tradingSymbol ?? ''}`)
                    .join('|')}
                  className="flex-row gap-2.5"
                >
                  {row.map((tile) => {
                    const move = liveMove(tile.ltp, tile.prevClose);
                    const exchange = tile.exchange;
                    const opens = tile.kind !== 'commodity' && isChainExchange(exchange);
                    return (
                      <TradedTile
                        key={`${tile.exchange}:${tile.underlying}:${tile.tradingSymbol ?? ''}`}
                        // A commodity tile prices one futures contract (MCX has no spot), so it says which.
                        label={
                          tile.kind === 'commodity' && tile.expiry
                            ? futureTitle(tile.label, tile.expiry)
                            : tile.label
                        }
                        ltp={tile.ltp}
                        change={move.change ?? tile.change}
                        changePct={move.changePct ?? tile.changePct}
                        isLevel={tile.kind === 'index'}
                        candles={tile.candles}
                        candleNote={tile.candleNote}
                        onPress={
                          opens ? () => router.push(chainHref(exchange, tile.underlying)) : null
                        }
                      />
                    );
                  })}
                  {row.length === 1 ? <View className="flex-1" /> : null}
                </View>
              ))}
            </View>
          )}
          {topKind === 'commodities' && data?.commodityNote ? (
            <Text className="mt-3 text-xs leading-[17px] text-warning-600 dark:text-warning-dark">
              {data.commodityNote}
            </Text>
          ) : null}
        </Section>
      )}

      <YourFnoCard commodityReturns={data?.commodityReturns} />

      <FnoStocksShelf stocks={data?.stocks} loading={explore.isLoading} />

      <FnoToolsGrid />

      {failed ? null : (
        <>
          <FuturesShelf
            title="Commodities"
            section="commodities"
            caption={data?.ranking.commodities}
            note={data?.commodityNote}
            rows={data?.commodities}
            loading={explore.isLoading}
            empty="No commodity contracts to show"
            commodity
            titleOf={(f) => f.label}
            subOf={(f) => `${expiryLabel(f.expiry)} futures`}
          />
          <FuturesShelf
            title="Index futures"
            section="index-futures"
            caption={data?.ranking.indexFutures}
            rows={data?.indexFutures}
            loading={explore.isLoading}
            empty="No index futures are listed"
          />
          <FuturesShelf
            title="Stock futures"
            section="stock-futures"
            caption={data?.ranking.stockFutures}
            rows={data?.stockFutures}
            loading={explore.isLoading}
            empty="No stock futures are listed"
          />
          <FuturesShelf
            title="Commodity futures"
            section="commodity-futures"
            caption={data?.ranking.commodityFutures}
            note={
              data?.commodityNote ? 'No commodity prices — “Commodities” above says why.' : null
            }
            rows={data?.commodityFutures}
            loading={explore.isLoading}
            empty="No commodity futures to show"
            commodity
          />
        </>
      )}

      {data && data.notes.length > 0 ? (
        <Disclosure
          className="mt-7"
          title="About these prices"
          meta="Where every number on this screen comes from"
        >
          <Caveats items={data.notes} />
        </Disclosure>
      ) : null}

      <Text className="mt-6 text-center text-[11px] leading-4 text-ink-faint dark:text-ink-dark-faint">
        Derivatives are leveraged: losses can exceed the margin you put up. Prices refresh every few
        seconds and can lag the exchange.
      </Text>

      <SearchSheet
        visible={searching}
        onClose={() => setSearching(false)}
        onPickUnderlying={(u) => router.push(chainHref(u.exchange, u.underlying))}
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
    </GroupScreen>
  );
}
