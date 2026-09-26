import Check from 'lucide-react-native/icons/check';
import Search from 'lucide-react-native/icons/search';
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, Text, TextInput, View } from 'react-native';

import { ChangeText } from '@/components/market/ChangeText';
import { StockLogo } from '@/components/market/StockLogo';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { stockLogoUrl } from '@/features/market/api';
import { useStockSearch } from '@/features/market/hooks';
import { useDebounce } from '@/hooks/useDebounce';
import { formatINR, formatSignedPercent } from '@/lib/utils/formatters';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

import { Note, Sheet } from './Sheet';

const NUMBERS = { fontVariant: ['tabular-nums' as const] };

export interface StockPick {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  companyName: string | null;
}

interface StockSearchSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  onPick: (pick: StockPick) => void;
  /** Offered before anything is typed — e.g. the stocks already in the paper book. */
  quickPicks?: readonly StockPick[];
  quickPicksTitle?: string;
  /** Results already chosen (already on the list) show a check and can't be picked again. */
  isPicked?: (pick: StockPick) => boolean;
  /** The pick currently being saved — its row shows a spinner. */
  busyKey?: string | null;
  /** Verb on each row, e.g. "Add"; omitted rows are plain links. */
  actionLabel?: string;
  footnote?: string;
}

const keyOf = (pick: Pick<StockPick, 'exchange' | 'symbol'>) => `${pick.exchange}:${pick.symbol}`;

/**
 * Search-and-pick in a bottom sheet — for adding to a watchlist or starting a paper order,
 * where leaving the screen for the full search page would lose the context the pick is for.
 * Only NSE/BSE equities are offered: nothing here can act on an index.
 */
export function StockSearchSheet({
  visible,
  title,
  subtitle,
  onClose,
  onPick,
  quickPicks = [],
  quickPicksTitle = 'Suggestions',
  isPicked,
  busyKey,
  actionLabel,
  footnote,
}: StockSearchSheetProps) {
  const { colors, isDark } = useTheme();
  const [query, setQuery] = useState('');
  const debounced = useDebounce(query.trim(), 300);
  const search = useStockSearch(debounced);
  const results: StockPick[] = (search.data ?? [])
    .filter((row) => row.exchange === 'NSE' || row.exchange === 'BSE')
    .map((row) => ({
      exchange: row.exchange as 'NSE' | 'BSE',
      symbol: row.symbol,
      companyName: row.companyName,
    }));
  const quotes = new Map((search.data ?? []).map((row) => [`${row.exchange}:${row.symbol}`, row]));
  const typing = query.trim().length > 0;
  const waiting = typing && (query.trim() !== debounced || (search.isFetching && !search.data));
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
          placeholder="Search by name or symbol"
          placeholderTextColor={colors.textFaint}
          keyboardAppearance={isDark ? 'dark' : 'light'}
          selectionColor={colors.accent}
          accessibilityLabel="Search stocks"
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
      ) : typing && !waiting && results.length === 0 ? (
        <Text className="mt-6 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          No stocks match “{query.trim()}”.
        </Text>
      ) : shown.length > 0 ? (
        <ListCard className={typing ? 'mt-3' : undefined}>
          {shown.map((pick, index) => {
            const key = keyOf(pick);
            const picked = isPicked?.(pick) ?? false;
            const busy = busyKey === key;
            const quote = quotes.get(key);
            return (
              <View key={key}>
                {index > 0 ? <RowDivider /> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${pick.symbol}, ${pick.exchange}${picked ? ', already added' : ''}`}
                  accessibilityState={{ disabled: picked || Boolean(busyKey) }}
                  disabled={picked || Boolean(busyKey)}
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
                  {busy ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : picked ? (
                    <Check size={18} color={colors.link} accessibilityLabel="Added" />
                  ) : actionLabel ? (
                    <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                      {actionLabel}
                    </Text>
                  ) : null}
                </Pressable>
              </View>
            );
          })}
        </ListCard>
      ) : !typing ? (
        <Note className="mt-4 text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
          Type at least a few letters of a company or its symbol.
        </Note>
      ) : null}

      {footnote ? (
        <Note className="mt-3 text-xs text-ink-faint dark:text-ink-dark-faint">{footnote}</Note>
      ) : null}
    </Sheet>
  );
}
