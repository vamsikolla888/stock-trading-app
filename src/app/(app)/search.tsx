import { useRouter } from 'expo-router';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import Clock from 'lucide-react-native/icons/clock';
import Search from 'lucide-react-native/icons/search';
import X from 'lucide-react-native/icons/x';
import React, { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { StockRow } from '@/components/market/StockRow';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
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

/** Ten, not six: the same request (and cache entry) as Explore's Most traded shelf. */
const POPULAR_LIMIT = 10;
const POPULAR_SHOWN = 6;

/**
 * Stock search, Groww-style: the field is focused on arrival and results update as you
 * type (debounced like the web's header search). With nothing typed it shows your recent
 * searches and today's most-traded names. The keyboard's search key opens the top result.
 */
export default function SearchScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), SEARCH_DEBOUNCE_MS);
  const results = useStockSearch(debounced);
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

  const onSubmit = () => {
    const top = phase === 'results' && !stale ? rows[0] : undefined;
    if (top) openResult(top);
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
    body = (
      <InlineEmpty
        title={`No stocks match “${debounced}”`}
        message="Try the ticker (like TCS) or a word from the company’s name."
      />
    );
  } else {
    body = (
      <ListCard className={stale ? 'opacity-60' : undefined}>
        {rows.map((item, index) => (
          <View key={`${item.exchange}:${item.symbol}`}>
            {index > 0 ? <RowDivider /> : null}
            <StockRow
              symbol={item.symbol}
              name={item.companyName}
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
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: colors.background }}>
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
            placeholder="Search NSE / BSE — ticker or company"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Search stocks"
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
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View accessibilityLiveRegion="polite">{body}</View>
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
