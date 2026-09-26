import { useLocalSearchParams, useRouter } from 'expo-router';
import Check from 'lucide-react-native/icons/check';
import Plus from 'lucide-react-native/icons/plus';
import X from 'lucide-react-native/icons/x';
import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { InlineError } from '@/components/common/InlineError';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { CreateListForm } from '@/features/watchlists/components/CreateListForm';
import {
  useAddToWatchlist,
  useListsContaining,
  useRemoveFromWatchlist,
} from '@/features/watchlists/hooks';
import { MAX_WATCHLISTS } from '@/features/watchlists/types';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

/** Add or remove one stock across the user's own lists. */
export default function WatchlistPickerScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ symbol: string; exchange?: string }>();
  const symbol = (params.symbol ?? '').toUpperCase();
  const exchange = ((params.exchange ?? 'NSE').toUpperCase() === 'BSE' ? 'BSE' : 'NSE') as
    'NSE' | 'BSE';

  const { lists, containing, isLoading, error } = useListsContaining(exchange, symbol);
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();
  const busy = add.isPending || remove.isPending;

  const toggle = (id: string, name: string) => {
    const onError = (err: unknown) => toast.error('Couldn’t update list', getErrorMessage(err));
    if (containing.has(id)) {
      remove.mutate({ id, exchange, symbol }, { onError });
    } else {
      add.mutate(
        { id, item: { exchange, symbol } },
        { onSuccess: () => toast.success('Added', `${symbol} is on “${name}”.`), onError },
      );
    }
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View className="flex-row items-center gap-3 px-5 pb-3 pt-4">
        <View className="flex-1">
          <Text
            accessibilityRole="header"
            className="text-xl font-bold text-ink dark:text-ink-dark"
          >
            Save {symbol}
          </Text>
          <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
            Choose the lists to keep it on
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={10}
          onPress={() => router.back()}
          className="h-9 w-9 items-center justify-center rounded-full bg-surface-sunk dark:bg-surface-sunk-dark"
        >
          <X size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ padding: 20, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : error ? (
          <InlineError what="your lists" error={error} />
        ) : lists.length > 0 ? (
          <ListCard>
            {lists.map((list, index) => {
              const saved = containing.has(list.id);
              return (
                <View key={list.id}>
                  {index > 0 ? <RowDivider /> : null}
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: saved, disabled: busy }}
                    disabled={busy}
                    onPress={() => toggle(list.id, list.name)}
                    className="min-h-[56px] flex-row items-center gap-3 px-3.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
                  >
                    <View className="flex-1">
                      <Text className="text-sm font-semibold text-ink dark:text-ink-dark">
                        {list.name}
                      </Text>
                      <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
                        {list.itemCount} stock{list.itemCount === 1 ? '' : 's'}
                      </Text>
                    </View>
                    <View
                      className={
                        saved
                          ? 'h-7 w-7 items-center justify-center rounded-full bg-brand-strong dark:bg-brand-strong-dark'
                          : 'h-7 w-7 items-center justify-center rounded-full border border-line-strong dark:border-line-dark-strong'
                      }
                    >
                      {saved ? (
                        <Check size={15} strokeWidth={3} color="#fff" />
                      ) : (
                        <Plus size={15} color={colors.textMuted} />
                      )}
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </ListCard>
        ) : (
          <Text className="text-center text-[13px] text-ink-muted dark:text-ink-dark-muted">
            You don't have a watchlist yet. Name one below — {symbol} will be its first stock.
          </Text>
        )}

        {lists.length < MAX_WATCHLISTS ? <CreateListForm seed={{ exchange, symbol }} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}
