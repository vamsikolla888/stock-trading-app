import { useRouter } from 'expo-router';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { InlineError } from '@/components/common/InlineError';
import { useTheme } from '@/theme/ThemeProvider';

import { useFnoSearch, useFnoUnderlyings } from '../hooks';
import { contractTitle, expiryLabel } from '../lib/format';
import type {
  CommodityContractSearchResult,
  CommodityUnderlying,
  FnoContract,
  FnoUnderlying,
} from '../types';

import { Tag } from './primitives';
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

/**
 * Find an underlying (NIFTY, RELIANCE…), a commodity (GOLD, CRUDEOIL), or jump straight to a
 * contract by trading symbol or "NIFTY 25000 CE". Underlyings filter locally from the cached
 * universe (instant); contracts and commodities come from the server once three characters
 * are typed. A commodity (or commodity contract) opens the commodity futures list filtered to
 * it — commodities have no option chain here, and Groww's API places no commodity orders.
 */
export function SearchSheet({
  visible,
  onClose,
  onPickUnderlying,
  onPickContract,
}: {
  visible: boolean;
  onClose: () => void;
  onPickUnderlying: (u: FnoUnderlying) => void;
  onPickContract?: (c: FnoContract) => void;
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
      return all
        .filter((u) => u.isIndex)
        .slice(0, 8)
        .map((u) => ({ type: 'u' as const, u }));
    }
    const us = all
      .filter((u) => u.underlying.includes(needle) || (u.name ?? '').toUpperCase().includes(needle))
      .sort(
        (a, b) =>
          Number(!a.underlying.startsWith(needle)) - Number(!b.underlying.startsWith(needle)) ||
          Number(!a.isIndex) - Number(!b.isIndex),
      )
      .slice(0, 8)
      .map((u) => ({ type: 'u' as const, u }));
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
        router.push({
          pathname: '/fno-list/[section]',
          params: {
            section: 'commodity-futures',
            q: it.type === 'm' ? it.m.underlying : it.mc.underlying,
          },
        });
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
            ? `${it.u.name ?? it.u.underlying} · ${it.u.exchange === 'BFO' ? 'BSE' : 'NSE'}`
            : it.type === 'm'
              ? `${it.m.underlying} · ${it.m.exchange === 'NCO' ? 'NSE' : 'MCX'} · futures list`
              : it.type === 'mc'
                ? `${it.mc.tradingSymbol} · ${expiryLabel(it.mc.expiry)} · ${it.mc.exchange === 'NCO' ? 'NSE' : 'MCX'}`
                : `${it.c.tradingSymbol} · ${expiryLabel(it.c.expiry)}`;
        const tag =
          it.type === 'u'
            ? it.u.isIndex
              ? 'Index'
              : 'Stock'
            : it.type === 'm'
              ? 'Commodity'
              : it.type === 'mc'
                ? it.mc.kind
                : it.c.kind;
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
            <Tag label={tag} tone={it.type === 'u' && it.u.isIndex ? 'info' : 'neutral'} />
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
          Type three or more characters to search contracts and commodities too.
        </Text>
      ) : null}
    </Sheet>
  );
}
