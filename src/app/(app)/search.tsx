import { useLocalSearchParams, useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Clock from 'lucide-react-native/icons/clock';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { SCREEN_EDGES_NO_BOTTOM } from '@/components/common/safeArea';
import { StockRow } from '@/components/market/StockRow';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { FnoSearchResults } from '@/features/derivatives/components/FnoSearchResults';
import { useFnoSearchHits } from '@/features/derivatives/hooks';
import type { FnoSearchHit } from '@/features/derivatives/lib/paperFno';
import { fnoSearchHref, parseSearchScope } from '@/features/derivatives/lib/routes';
import { useCommoditySearchHits } from '@/features/fno/hooks';
import { commodityContractHref, commodityHref } from '@/features/fno/lib/explore';
import { stockLogoUrl } from '@/features/market/api';
import { useMovers, useStockSearch } from '@/features/market/hooks';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  searchPhase,
  searchResultMeta,
} from '@/features/market/lib/search';
import type { SearchResult } from '@/features/market/types';
import { useDebounce } from '@/hooks/useDebounce';
import { stockHref } from '@/lib/navigation';
import { usePreferencesStore, type RecentSearch } from '@/store/preferencesStore';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/** Ten, not six: the same request (and cache entry) as Explore's Most traded shelf. */
const POPULAR_LIMIT = 10;
const POPULAR_SHOWN = 6;
/** The F&O group stays under the stocks: a few underlyings, a handful of contracts. */
const FNO_LIMITS = { underlyings: 3, contracts: 6 };
const COMMODITY_LIMITS = { commodities: 3, contracts: 3 };

/**
 * Search, Groww-style: the field is focused on arrival and results update as you type
 * (debounced like the web's header search) — stocks first, then futures & options (an
 * underlying, or one contract). With nothing typed it shows your recent searches and today's
 * most-traded names. The keyboard's search key opens the top result.
 *
 * SCOPE. `/search?scope=paper` is the search a PAPER screen opens: there an F&O pick opens the
 * paper chain (an underlying) or the paper ticket on that chain (a contract) — never the live
 * Groww chain, which is one wrong tap away from a real order. Anywhere else, the live screens.
 */
export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const inputRef = useRef<TextInput>(null);
  const scope = parseSearchScope(useLocalSearchParams<{ scope?: string }>().scope);
  const paper = scope === 'paper';
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);
  // One row per company: the stock page switches between a company's NSE and BSE listings.
  const results = useStockSearch(debounced, { group: 'company' });
  const fno = useFnoSearchHits(debounced, true, FNO_LIMITS);
  const fnoHits = query.trim() ? fno.hits : [];
  // MCX / NSE commodities open their chain read-only (Groww's API places no commodity orders).
  // Never on a paper screen's search: the paper book has no commodity contracts.
  const commodities = useCommoditySearchHits(
    debounced,
    !paper && query.trim().length > 0,
    COMMODITY_LIMITS,
  );
  const derivativeCount =
    fnoHits.length + (paper ? 0 : commodities.commodities.length + commodities.contracts.length);
  const recentSearches = usePreferencesStore((state) => state.recentSearches);
  const addRecentSearch = usePreferencesStore((state) => state.addRecentSearch);
  const clearRecentSearches = usePreferencesStore((state) => state.clearRecentSearches);

  const rows = results.data ?? [];
  const { phase, stale } = searchPhase({
    typed: query,
    debounced,
    pending: results.isPending,
    placeholder: results.isPlaceholderData,
    error: results.isError,
    count: rows.length,
  });

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const openStock = (symbol: string, exchange: string) => {
    Keyboard.dismiss();
    router.push(stockHref(symbol, exchange));
  };

  /** Only what was found by searching is remembered as a recent search. */
  const openResult = (item: SearchResult | RecentSearch) => {
    addRecentSearch({
      symbol: item.symbol,
      exchange: item.exchange,
      name: ('companyName' in item ? item.companyName : item.name) || item.symbol,
    });
    openStock(item.symbol, item.exchange);
  };

  const openFno = (hit: FnoSearchHit) => {
    Keyboard.dismiss();
    router.push(fnoSearchHref(hit, scope));
  };

  const onSubmit = () => {
    const top = phase === 'results' && !stale ? rows[0] : undefined;
    const topFno = phase === 'empty' ? fnoHits[0] : undefined;
    if (top) openResult(top);
    else if (topFno) openFno(topFno);
    else Keyboard.dismiss();
  };

  const clearQuery = () => {
    setQuery('');
    inputRef.current?.focus();
  };

  let body: React.ReactNode;
  if (phase === 'idle') {
    body = (
      <IdleContent
        recent={recentSearches}
        onOpenRecent={openResult}
        onClearRecent={clearRecentSearches}
        onOpenStock={openStock}
      />
    );
  } else if (phase === 'loading') {
    body = <ListSkeleton rows={5} />;
  } else if (phase === 'error') {
    body = (
      <InlineError
        what="search results"
        error={results.error}
        onRetry={() => void results.refetch()}
      />
    );
  } else if (phase === 'empty') {
    body =
      derivativeCount > 0 ? (
        <Text className="text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No stocks match “{debounced}”.
        </Text>
      ) : fno.searching ? (
        <ListSkeleton rows={3} />
      ) : (
        <InlineEmpty
          title={`Nothing matches “${debounced}”`}
          message="Try the ticker (like TCS), a word from the company’s name, or an index like NIFTY."
        />
      );
  } else {
    body = (
      <ListCard className={stale ? 'opacity-60' : undefined}>
        {rows.map((item, index) => (
          <View key={`${item.exchange}:${item.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            {/* `exchange` keys the live price; the subtitle carries no NSE/BSE tag. */}
            <StockRow
              symbol={item.symbol}
              name={item.companyName}
              exchange={item.exchange}
              subtitle={searchResultMeta(item)}
              price={item.ltp}
              changePercent={item.changePct}
              logoUri={stockLogoUrl(item.symbol)}
              onPress={() => openResult(item)}
            />
          </View>
        ))}
      </ListCard>
    );
  }

  return (
    <SafeAreaView
      edges={SCREEN_EDGES_NO_BOTTOM}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View className="flex-row items-center gap-2 border-b border-line px-3 pb-3 pt-2 dark:border-line-dark">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close search"
          hitSlop={8}
          onPress={close}
          className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <ArrowLeft size={22} color={colors.text} />
        </Pressable>
        <View className="h-11 flex-1 flex-row items-center gap-2 rounded-[11px] bg-surface-sunk px-3 dark:bg-surface-sunk-dark">
          <Search size={16} color={colors.textMuted} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={onSubmit}
            autoFocus
            autoCapitalize="characters"
            autoCorrect={false}
            spellCheck={false}
            maxLength={SEARCH_MAX_LENGTH}
            returnKeyType="search"
            placeholder={
              paper ? 'Search a stock, NIFTY or an F&O contract' : 'Search stocks, NIFTY or F&O'
            }
            placeholderTextColor={colors.textFaint}
            accessibilityLabel={paper ? 'Search stocks and paper F&O' : 'Search stocks and F&O'}
            className="h-full flex-1 text-[15px] text-ink dark:text-ink-dark"
          />
          {query ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              hitSlop={10}
              onPress={clearQuery}
            >
              <X size={18} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: phase === 'idle' ? 0 : 16,
          // The bottom edge is left to the list, so it scrolls under the home indicator.
          paddingBottom: insets.bottom + 24,
        }}
        showsVerticalScrollIndicator={false}
      >
        {paper ? (
          <View className="mb-3 mt-3 flex-row items-center gap-2">
            <View className="rounded-md bg-info-wash px-1.5 py-0.5 dark:bg-info-wash-dark">
              <Text className="text-[10px] font-bold text-info dark:text-info-dark">PAPER</Text>
            </View>
            <Text className="flex-1 text-xs text-ink-muted dark:text-ink-dark-muted">
              An F&amp;O pick opens the paper chain and ticket — never a live order.
            </Text>
          </View>
        ) : null}
        <View accessibilityLiveRegion="polite">
          {body}
          {phase !== 'idle' ? (
            <FnoSearchResults
              hits={fnoHits}
              title={paper ? 'Futures & options · paper' : 'Futures & options'}
              onPick={openFno}
              commodities={paper ? undefined : commodities}
              onPickCommodity={
                paper
                  ? undefined
                  : (pick) => {
                      Keyboard.dismiss();
                      router.push(
                        pick.type === 'commodity'
                          ? commodityHref(pick.commodity)
                          : commodityContractHref(pick.contract),
                      );
                    }
              }
              className="mt-6"
            />
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Before anything is typed: recent searches (on this device) and today's most traded. */
function IdleContent({
  recent,
  onOpenRecent,
  onClearRecent,
  onOpenStock,
}: {
  recent: readonly RecentSearch[];
  onOpenRecent: (item: RecentSearch) => void;
  onClearRecent: () => void;
  onOpenStock: (symbol: string, exchange: string) => void;
}) {
  const { colors } = useTheme();
  const popular = useMovers('volume', POPULAR_LIMIT);
  const list = (popular.data ?? []).slice(0, POPULAR_SHOWN);

  let popularBody: React.ReactNode = null;
  if (popular.isPending) popularBody = <ListSkeleton rows={4} />;
  else if (popular.error && !popular.data)
    popularBody = (
      <InlineError
        what="most-traded stocks"
        error={popular.error}
        onRetry={() => void popular.refetch()}
      />
    );
  else if (list.length > 0)
    popularBody = (
      <ListCard>
        {list.map((item, index) => (
          <View key={`${item.exchange}:${item.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <StockRow
              symbol={item.symbol}
              name={item.companyName}
              exchange={item.exchange}
              subtitle={searchResultMeta(item)}
              price={item.ltp}
              changePercent={item.changePct}
              logoUri={stockLogoUrl(item.symbol)}
              onPress={() => onOpenStock(item.symbol, item.exchange)}
            />
          </View>
        ))}
      </ListCard>
    );

  return (
    <View>
      {recent.length > 0 ? (
        <Section
          title="Recent searches"
          action={{ label: 'Clear', onPress: onClearRecent }}
          className="mt-5"
        >
          <View className="flex-row flex-wrap gap-2">
            {recent.map((item) => (
              <Pressable
                key={`${item.exchange}:${item.symbol}`}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.exchange}`}
                onPress={() => onOpenRecent(item)}
                className="max-w-full flex-row items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 active:bg-surface-sunk dark:border-line-dark dark:bg-surface-dark dark:active:bg-surface-sunk-dark"
              >
                <Clock size={13} color={colors.textMuted} />
                <Text className="shrink text-[13px] text-ink dark:text-ink-dark" numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
            ))}
          </View>
        </Section>
      ) : null}

      {popularBody ? (
        <Section title="Most traded today" note="By volume · NSE" className="mt-6">
          {popularBody}
        </Section>
      ) : null}
    </View>
  );
}
