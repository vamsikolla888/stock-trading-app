import Search from 'lucide-react-native/icons/search';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { FnoSearchResults } from '@/features/derivatives/components/FnoSearchResults';
import { useFnoSearchHits } from '@/features/derivatives/hooks';
import type { FnoSearchHit } from '@/features/derivatives/lib/paperFno';
import { stockLogoUrl } from '@/features/market/api';
import { useStockSearch } from '@/features/market/hooks';
import { Note, Sheet } from '@/features/trading/components/Sheet';
import type { StockPick } from '@/features/trading/components/StockSearchSheet';
import { useDebounce } from '@/hooks/useDebounce';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };
const FNO_LIMITS = { underlyings: 3, contracts: 6 };

const keyOf = (pick: Pick<StockPick, 'exchange' | 'symbol'>) => `${pick.exchange}:${pick.symbol}`;

/**
 * The cash paper screen's order search (web: the paper ticket's search box): NSE/BSE stocks
 * for a delivery or intraday paper order, and — grouped under "Futures & options · paper" — F&O
 * underlyings and contracts, so a paper F&O trade is one search away from here. A contract
 * opens the paper F&O ticket; an underlying opens its paper chain. Never the app-wide search or
 * a live screen: a paper screen must not hand the user a real-money ticket.
 */
export function PaperOrderSearchSheet({
  visible,
  title,
  subtitle,
  onClose,
  onPick,
  onPickFno,
  quickPicks = [],
  quickPicksTitle = 'Suggestions',
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPick: (pick: StockPick) => void;
  /** Omitted: stocks only. */
  onPickFno?: (hit: FnoSearchHit) => void;
  quickPicks?: readonly StockPick[];
  quickPicksTitle?: string;
}) {
  const { colors, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 300);
  const search = useStockSearch(debounced);
  const fno = useFnoSearchHits(debounced, onPickFno != null && debounced.length >= 2, FNO_LIMITS);
  const results: StockPick[] = (search.data ?? [])
    .filter((row) => row.exchange === 'NSE' || row.exchange === 'BSE')
    .map((row) => ({
      exchange: row.exchange as 'NSE' | 'BSE',
      symbol: row.symbol,
      companyName: row.companyName,
    }));
  const quotes = new Map((search.data ?? []).map((row) => [`${row.exchange}:${row.symbol}`, row]));
  const typing = query.trim().length > 0;
  const fnoHits = typing ? fno.hits : [];
  const waiting =
    typing && (query.trim() !== debounced || (search.isFetching && !search.data) || fno.searching);
  const shown = typing ? results : quickPicks;

  const close = () => {
    setQuery('');
    onClose();
  };

  return (
    <Sheet visible={visible} onClose={close} title={title} subtitle={subtitle}>
      <View className="h-12 flex-row items-center gap-2.5 rounded-field border border-line-strong bg-canvas px-3.5 dark:border-line-dark-strong dark:bg-canvas-dark">
        <Search size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCorrect={false}
          autoCapitalize="characters"
          returnKeyType="search"
          placeholder={
            onPickFno ? 'Search a stock, NIFTY or an F&O contract' : 'Search by name or symbol'
          }
          placeholderTextColor={colors.textFaint}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={colors.accent}
          accessibilityLabel={onPickFno ? 'Search stocks and F&O' : 'Search stocks'}
          className="h-full flex-1 text-[15px] text-ink dark:text-ink-dark"
        />
        {waiting ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>

      {!typing && quickPicks.length > 0 ? (
        <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-ink-muted dark:text-ink-dark-muted">
          {quickPicksTitle}
        </Text>
      ) : null}

      {typing && search.error && !search.data ? (
        <Text className="mt-4 text-center text-[13px] text-danger-600 dark:text-danger-dark">
          {getErrorMessage(search.error)}
        </Text>
      ) : typing && !waiting && results.length === 0 && fnoHits.length === 0 ? (
        <Text className="mt-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Nothing matches “{query.trim()}”.
        </Text>
      ) : shown.length > 0 ? (
        <ListCard className={typing ? 'mt-3' : undefined}>
          {shown.map((pick, index) => {
            const key = keyOf(pick);
            const quote = quotes.get(key);
            return (
              <View key={key}>
                {index > 0 ? <RowDivider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${pick.symbol}, ${pick.exchange}`}
                  onPress={() => onPick(pick)}
                  className="min-h-[60px] flex-row items-center gap-3 px-3.5 py-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                >
                  <StockLogo symbol={pick.symbol} uri={stockLogoUrl(pick.symbol)} size="sm" />
                  <View className="min-w-0 flex-1">
                    <Text
                      className="text-sm font-semibold text-ink dark:text-ink-dark"
                      numberOfLines={1}
                    >
                      {pick.symbol}
                      <Text className="text-xs font-normal text-ink-faint dark:text-ink-dark-faint">
                        {'  '}
                        {pick.exchange}
                      </Text>
                    </Text>
                    <Text
                      className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
                      numberOfLines={1}
                    >
                      {pick.companyName ?? '—'}
                    </Text>
                  </View>
                  {quote ? (
                    <View className="items-end">
                      <Text
                        className="text-[13px] font-semibold text-ink dark:text-ink-dark"
                        style={NUMBERS}
                      >
                        {formatINR(quote.ltp)}
                      </Text>
                      <ChangeText value={quote.changePct} className="text-[11px]" style={NUMBERS}>
                        {formatSignedPercent(quote.changePct)}
                      </ChangeText>
                    </View>
                  ) : null}
                  <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                    Trade
                  </Text>
                </Pressable>
              </View>
            );
          })}
        </ListCard>
      ) : !typing ? (
        <Note className="mt-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Type a company, its symbol{onPickFno ? ', an index like NIFTY or an F&O contract' : ''}.
        </Note>
      ) : null}

      {onPickFno ? (
        <FnoSearchResults
          hits={fnoHits}
          title="Futures & options · paper"
          onPick={(hit) => {
            setQuery('');
            onPickFno(hit);
          }}
          className="mt-5"
        />
      ) : null}
    </Sheet>
  );
}
