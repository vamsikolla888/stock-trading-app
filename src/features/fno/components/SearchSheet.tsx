import { useRouter } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { useTheme } from '@/theme/ThemeProvider';

import { useFnoSearch, useFnoUnderlyings } from '../hooks';
import { commodityChainHref } from '../lib/explore';
import { contractTitle, expiryLabel, venueOf } from '../lib/format';
import { rankUnderlyings } from '../lib/underlyingSearch';
import type {
  CommodityContractSearchResult,
  CommodityExchange,
  CommodityUnderlying,
  FnoContract,
  FnoUnderlying,
} from '../types';

import { InstrumentMark } from './Glyphs';
import { Sheet } from './Sheet';

type Item =
  | { type: 'u'; u: FnoUnderlying }
  | { type: 'c'; c: FnoContract }
  | { type: 'm'; m: CommodityUnderlying }
  | { type: 'mc'; mc: CommodityContractSearchResult };

const keyOf = (it: Item) =>
  it.type === 'u'
    ? `u:${it.u.exchange}:${it.u.underlying}`
    : it.type === 'c'
      ? `c:${it.c.exchange}:${it.c.tradingSymbol}`
      : it.type === 'mc'
        ? `mc:${it.mc.exchange}:${it.mc.tradingSymbol}`
        : `m:${it.m.exchange}:${it.m.underlying}`;

/** Server-side search needs three characters (the hook's own gate). */
const REMOTE_MIN = 3;

/** Where a commodity pick goes: its chain (or futures), read-only, optionally one contract charted. */
export interface CommodityPick {
  exchange: CommodityExchange;
  underlying: string;
  tab: 'options' | 'futures';
  expiry: string | null;
  contract: string | null;
}

function commodityPickOf(it: Extract<Item, { type: 'm' | 'mc' }>): CommodityPick {
  if (it.type === 'm') {
    return {
      exchange: it.m.exchange,
      underlying: it.m.underlying,
      tab: it.m.hasOptions ? 'options' : 'futures',
      expiry: null,
      contract: null,
    };
  }
  const future = it.mc.kind === 'FUT';
  return {
    exchange: it.mc.exchange,
    underlying: it.mc.underlying,
    tab: future ? 'futures' : 'options',
    expiry: future ? null : it.mc.expiry,
    contract: it.mc.tradingSymbol,
  };
}

/**
 * Find an underlying (NIFTY, RELIANCE…), a commodity (GOLD, CRUDEOIL), or jump straight to a
 * contract by trading symbol or "NIFTY 25000 CE". Underlyings filter locally from the cached
 * universe (instant), word by word with the spoken index names ("bank nifty", "fin nifty",
 * "index" — lib/underlyingSearch.ts); with nothing typed it lists every index. Contracts and
 * commodities come from the server once three characters are typed. A commodity opens its own
 * chain / futures, read-only — Groww's API places no commodity orders.
 */
export function SearchSheet({
  visible,
  onClose,
  onPickUnderlying,
  onPickContract,
  onPickCommodity,
}: {
  visible: boolean;
  onClose: () => void;
  onPickUnderlying: (u: FnoUnderlying) => void;
  onPickContract?: (c: FnoContract) => void;
  /** A commodity pick; by default it opens the commodity's chain screen. */
  onPickCommodity?: (pick: CommodityPick) => void;
}) {
  const router = useRouter();
  const { colors, isDark } = useTheme();
  const [q, setQ] = useState('');
  const universe = useFnoUnderlyings();
  const remote = useFnoSearch(q);
  const needle = q.trim().toUpperCase();

  const items = useMemo((): Item[] => {
    const all = universe.data?.underlyings ?? [];
    if (!needle) {
      return all.filter((u) => u.isIndex).map((u) => ({ type: 'u' as const, u }));
    }
    const us = rankUnderlyings(all, needle, 8).map((u) => ({ type: 'u' as const, u }));
    // The query keeps its previous answer while the next one loads; below the server's minimum
    // that answer belongs to a longer query the user has since deleted, so it is not shown.
    const answer = needle.length >= REMOTE_MIN ? remote.data : undefined;
    const ms = (answer?.commodities ?? []).slice(0, 6).map((m) => ({ type: 'm' as const, m }));
    const cs = onPickContract
      ? (answer?.contracts ?? []).slice(0, 8).map((c) => ({ type: 'c' as const, c }))
      : [];
    const mcs = (answer?.commodityContracts ?? [])
      .slice(0, 6)
      .map((mc) => ({ type: 'mc' as const, mc }));
    return [...us, ...ms, ...cs, ...mcs];
  }, [needle, universe.data, remote.data, onPickContract]);

  const close = () => {
    setQ('');
    onClose();
  };

  // iOS cannot present a modal (the order ticket a contract pick opens) while this one is still
  // animating away: UIKit refuses the presentation, the ticket never appears, and the screen's
  // ticket state is stuck "open". So on iOS the pick runs once this sheet has dismissed; Android
  // stacks dialogs and has no dismiss event, so it runs at once there.
  const pending = useRef<(() => void) | null>(null);
  const runPending = () => {
    const action = pending.current;
    pending.current = null;
    action?.();
  };

  const choose = (it: Item) => {
    const action = () => {
      if (it.type === 'u') onPickUnderlying(it.u);
      else if (it.type === 'm' || it.type === 'mc') {
        const pick = commodityPickOf(it);
        if (onPickCommodity) onPickCommodity(pick);
        else
          router.push(
            commodityChainHref(
              pick.exchange,
              pick.underlying,
              pick.tab,
              pick.expiry,
              pick.contract,
            ),
          );
      } else onPickContract?.(it.c);
    };
    close();
    if (Platform.OS === 'ios') pending.current = action;
    else action();
  };

  const searching = needle.length >= REMOTE_MIN && remote.isFetching;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      onDismissed={runPending}
      title="Search F&O"
      maxHeight={0.9}
      header={
        <View className="h-12 flex-row items-center gap-2.5 rounded-xl border border-line-strong bg-canvas px-3.5 dark:border-line-dark-strong dark:bg-canvas-dark">
          <Search size={18} color={colors.textMuted} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="NIFTY, RELIANCE, GOLD or a contract"
            placeholderTextColor={colors.textFaint}
            keyboardAppearance={isDark ? 'dark' : 'light'}
            accessibilityLabel="Search F&O underlyings and contracts"
            returnKeyType="search"
            className="h-full flex-1 text-[15px] text-ink dark:text-ink-dark"
          />
          {searching ? <ActivityIndicator size="small" color={colors.accent} /> : null}
          {q ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={() => setQ('')}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      }
    >
      {!needle ? (
        <Text className="mb-1 mt-1 text-xs font-semibold uppercase tracking-wider text-ink-faint dark:text-ink-dark-faint">
          Indices
        </Text>
      ) : null}
      {universe.isError && !universe.data ? (
        <InlineError
          what="F&O underlyings"
          error={universe.error}
          onRetry={() => void universe.refetch()}
        />
      ) : null}
      {items.map((it) => {
        const title =
          it.type === 'u'
            ? it.u.underlying
            : it.type === 'm'
              ? it.m.label
              : it.type === 'mc'
                ? contractTitle(it.mc)
                : contractTitle(it.c);
        const sub =
          it.type === 'u'
            ? `${it.u.isIndex ? 'Index' : 'Stock'} · ${it.u.name ?? it.u.underlying} · ${venueOf(it.u.exchange)}`
            : it.type === 'm'
              ? `Commodity · ${venueOf(it.m.exchange)} · ${it.m.expiryCount} expir${it.m.expiryCount === 1 ? 'y' : 'ies'}`
              : it.type === 'mc'
                ? `${it.mc.kind} · ${expiryLabel(it.mc.expiry)} · ${venueOf(it.mc.exchange)} · view only`
                : `${it.c.kind} · ${expiryLabel(it.c.expiry)} · ${it.c.tradingSymbol}`;
        const mark =
          it.type === 'u' ? (
            <InstrumentMark
              kind={it.u.isIndex ? 'index' : 'stock'}
              underlying={it.u.underlying}
              logoSymbol={it.u.logoSymbol ?? it.u.spotSymbol}
              exchange={it.u.exchange}
              size={32}
            />
          ) : it.type === 'm' || it.type === 'mc' ? (
            <InstrumentMark
              kind="commodity"
              underlying={it.type === 'm' ? it.m.underlying : it.mc.underlying}
              size={32}
            />
          ) : (
            <InstrumentMark
              kind={it.c.logoKind === 'index' ? 'index' : 'stock'}
              underlying={it.c.underlying}
              logoSymbol={it.c.logoSymbol}
              exchange={it.c.exchange}
              size={32}
            />
          );
        const lot =
          it.type === 'u'
            ? it.u.lotSize
            : it.type === 'm'
              ? it.m.lotSize
              : it.type === 'mc'
                ? it.mc.lotSize
                : it.c.lotSize;
        return (
          <Pressable
            key={keyOf(it)}
            accessibilityRole="button"
            accessibilityLabel={`${title}, ${sub}`}
            onPress={() => choose(it)}
            className="min-h-[56px] flex-row items-center gap-3 border-b border-line py-2.5 active:opacity-70 dark:border-line-dark"
          >
            {mark}
            <View className="min-w-0 flex-1">
              <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
                {title}
              </Text>
              <Text
                className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                numberOfLines={1}
              >
                {sub}
              </Text>
            </View>
            <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
              {lot != null ? `lot ${lot.toLocaleString('en-IN')}` : ''}
            </Text>
          </Pressable>
        );
      })}
      {needle.length >= 2 && items.length === 0 && !universe.isLoading && !remote.isFetching ? (
        <Text className="py-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No F&amp;O underlying, commodity or contract matches “{q.trim()}”.
        </Text>
      ) : null}
      {needle.length > 0 && needle.length < REMOTE_MIN && onPickContract ? (
        <Text className="pt-3 text-[11px] text-ink-faint dark:text-ink-dark-faint">
          Type 3+ characters to also search contracts and commodities.
        </Text>
      ) : null}
    </Sheet>
  );
}
