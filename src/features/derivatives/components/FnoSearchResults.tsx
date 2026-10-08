import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { ListCard, RowDivider } from '@/components/ui/Section';
import { InstrumentMark } from '@/features/fno/components/Glyphs';
import { Tag } from '@/features/fno/components/primitives';
import type { CommoditySearchHits } from '@/features/fno/hooks';
import { contractTitle, expiryLabel, venueOf } from '@/features/fno/lib/format';
import type { CommodityContractSearchResult, CommodityUnderlying } from '@/features/fno/types';

import { fnoHitView, type FnoSearchHit } from '../lib/paperFno';

/** A commodity row in a search: an MCX / NSE-commodity underlying or one of its contracts. */
export type CommoditySearchPick =
  | { type: 'commodity'; commodity: CommodityUnderlying }
  | { type: 'commodity-contract'; contract: CommodityContractSearchResult };

/**
 * The "Futures & options" group of a search: underlyings (open the chain) and contracts (open
 * the ticket), then — when the screen passes them — commodities, which open their chain /
 * futures READ-ONLY (Groww's API places no commodity orders; the row says "view only"). Shared
 * by the app search and the cash paper screen's order search; on a paper screen the heading
 * says so, because where a pick goes depends on it. An index wears its logo
 * (features/fno/lib/indexLogo.ts).
 */
export function FnoSearchResults({
  hits,
  title,
  onPick,
  commodities,
  onPickCommodity,
  className,
}: {
  hits: readonly FnoSearchHit[];
  title: string;
  onPick: (hit: FnoSearchHit) => void;
  /** Optional commodity rows (features/fno/hooks useCommoditySearchHits). */
  commodities?: CommoditySearchHits;
  onPickCommodity?: (pick: CommoditySearchPick) => void;
  className?: string;
}) {
  const commodityRows: CommoditySearchPick[] = onPickCommodity
    ? [
        ...(commodities?.commodities ?? []).map((commodity) => ({
          type: 'commodity' as const,
          commodity,
        })),
        ...(commodities?.contracts ?? []).map((contract) => ({
          type: 'commodity-contract' as const,
          contract,
        })),
      ]
    : [];
  if (hits.length === 0 && commodityRows.length === 0) return null;
  return (
    <View className={className}>
      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-dark-muted">
        {title}
      </Text>
      <ListCard>
        {hits.map((hit, index) => {
          const row = fnoHitView(hit);
          const mark =
            hit.type === 'underlying'
              ? {
                  kind: hit.underlying.isIndex ? ('index' as const) : ('stock' as const),
                  underlying: hit.underlying.underlying,
                  logoSymbol: hit.underlying.logoSymbol ?? hit.underlying.spotSymbol,
                  exchange: hit.underlying.exchange,
                }
              : {
                  kind: hit.contract.logoKind === 'index' ? ('index' as const) : ('stock' as const),
                  underlying: hit.contract.underlying,
                  logoSymbol: hit.contract.logoSymbol,
                  exchange: hit.contract.exchange,
                };
          return (
            <View key={row.key}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${row.title}, ${row.sub}`}
                onPress={() => onPick(hit)}
                className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <InstrumentMark
                  kind={mark.kind}
                  underlying={mark.underlying}
                  logoSymbol={mark.logoSymbol}
                  exchange={mark.exchange}
                  size={32}
                />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="shrink text-sm font-semibold text-ink dark:text-ink-dark"
                      numberOfLines={1}
                    >
                      {row.title}
                    </Text>
                    <Tag label={row.tag} tone={hit.type === 'underlying' ? 'info' : 'neutral'} />
                  </View>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {row.sub}
                  </Text>
                </View>
                {row.lot != null ? (
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    lot {row.lot.toLocaleString('en-IN')}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
        {commodityRows.map((pick, index) => {
          const view = commodityRowView(pick);
          return (
            <View key={view.key}>
              {hits.length > 0 || index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${view.title}, ${view.sub}, opens its chain, view only`}
                onPress={() => onPickCommodity?.(pick)}
                className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <InstrumentMark kind="commodity" underlying={view.underlying} size={32} />
                <View className="min-w-0 flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      className="shrink text-sm font-semibold text-ink dark:text-ink-dark"
                      numberOfLines={1}
                    >
                      {view.title}
                    </Text>
                    <Tag label={view.tag} />
                  </View>
                  <Text
                    className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {view.sub}
                  </Text>
                </View>
                {view.lot != null ? (
                  <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
                    lot {view.lot.toLocaleString('en-IN')}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          );
        })}
      </ListCard>
    </View>
  );
}

function commodityRowView(pick: CommoditySearchPick): {
  key: string;
  underlying: string;
  title: string;
  sub: string;
  tag: string;
  lot: number | null;
} {
  if (pick.type === 'commodity') {
    const c = pick.commodity;
    return {
      key: `m:${c.exchange}:${c.underlying}`,
      underlying: c.underlying,
      title: c.label,
      sub: `Commodity · ${venueOf(c.exchange)} · view only`,
      tag: 'Commodity',
      lot: c.lotSize,
    };
  }
  const c = pick.contract;
  return {
    key: `mc:${c.exchange}:${c.tradingSymbol}`,
    underlying: c.underlying,
    title: contractTitle(c),
    sub: `${expiryLabel(c.expiry)} · ${venueOf(c.exchange)} · view only`,
    tag: c.kind,
    lot: c.lotSize,
  };
}
