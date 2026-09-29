import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import Plus from 'lucide-react-native/icons/plus';
import Search from 'lucide-react-native/icons/search';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, Pressable, Share, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { Input } from '@/components/ui/Input';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider, Section } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { afterSheetClose, Caveats } from '@/features/trading/components/Sheet';
import { StockSearchSheet, type StockPick } from '@/features/trading/components/StockSearchSheet';
import { ticketHref } from '@/features/trading/lib/ticket';
import { ListActionsSheet, ListNameSheet } from '@/features/watchlists/components/ListSheets';
import { WatchlistRow } from '@/features/watchlists/components/WatchlistRow';
import { WatchlistStockSheet } from '@/features/watchlists/components/WatchlistStockSheet';
import {
  AiPulseCard,
  WatchlistSummaryCard,
} from '@/features/watchlists/components/WatchlistSummaryCard';
import {
  useAddToWatchlist,
  useCreateWatchlist,
  useDeleteWatchlist,
  useRemoveFromWatchlist,
  useRenameWatchlist,
  useWatchlist,
  useWatchlists,
  watchlistKeys,
} from '@/features/watchlists/hooks';
import {
  filterAndSort,
  newestFlagDate,
  orderLists,
  quickFilterCounts,
  SORT_LABEL,
  watchlistCsv,
  type QuickFilter,
  type WatchlistSort,
} from '@/features/watchlists/lib/listView';
import {
  MAX_WATCHLIST_ITEMS,
  MAX_WATCHLISTS,
  type WatchlistItem,
} from '@/features/watchlists/types';
import { useNow } from '@/hooks/useNow';
import { stockHref } from '@/lib/navigation';
import { toast } from '@/lib/utils/toast';
import { useTheme } from '@/theme/ThemeProvider';
import { getErrorMessage } from '@/types/api';

/** Rows drawn per step — the AI list runs to 80-odd stocks. */
const PAGE = 25;
const EMPTY: WatchlistItem[] = [];

const QUICK_LABEL: Record<QuickFilter, string> = {
  all: 'All',
  gainers: 'Up',
  losers: 'Down',
  new: 'New',
  repeat: 'Repeat',
};

type SheetKind = 'create' | 'rename' | 'actions' | 'add' | 'sort' | null;

const itemKey = (item: { exchange: string; symbol: string }) => `${item.exchange}:${item.symbol}`;

/**
 * Watchlists — the user's own named lists plus the AI recommendations list every account
 * starts with. Each stock is tracked from the price it was added at; the headline is an
 * equal-weighted average of those moves (no costs, so not money — paper trading is where
 * money is modelled). Filtering and sorting run on the server's stored figures, so the order
 * doesn't depend on which rows happen to be on screen.
 */
export default function WatchlistsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const now = useNow();

  const lists = useWatchlists();
  const ordered = useMemo(() => orderLists(lists.data), [lists.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const active = ordered.find((list) => list.id === selectedId) ?? ordered[0] ?? null;
  const detail = useWatchlist(active?.id);
  const view = detail.data;
  const rows = view?.items ?? EMPTY;
  const readOnly = active?.readOnly ?? true;
  const hasAi = Boolean(view?.ai);
  const ownCount = ordered.filter((list) => list.kind === 'manual').length;

  const [query, setQuery] = useState('');
  const [quick, setQuick] = useState<QuickFilter>('all');
  const [sort, setSort] = useState<WatchlistSort>('default');
  const [limit, setLimit] = useState(PAGE);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetKind>(null);

  // The AI-only views fall back on a list that has no AI layer, rather than showing nothing.
  const effectiveSort: WatchlistSort = !hasAi && sort === 'score' ? 'default' : sort;
  const effectiveQuick: QuickFilter =
    !hasAi && (quick === 'new' || quick === 'repeat') ? 'all' : quick;

  const counts = useMemo(() => quickFilterCounts(rows), [rows]);
  const newest = useMemo(() => newestFlagDate(rows), [rows]);
  const shown = useMemo(
    () => filterAndSort(rows, { query, quick: effectiveQuick, sort: effectiveSort }),
    [rows, query, effectiveQuick, effectiveSort],
  );
  const visible = shown.slice(0, limit);
  const alreadyIn = useMemo(() => new Set(rows.map(itemKey)), [rows]);
  const openItem = rows.find((item) => itemKey(item) === openKey) ?? null;

  const create = useCreateWatchlist();
  const rename = useRenameWatchlist();
  const remove = useDeleteWatchlist();
  const addItem = useAddToWatchlist();
  const removeItem = useRemoveFromWatchlist();

  const selectList = (id: string) => {
    setSelectedId(id);
    setQuery('');
    setQuick('all');
    setLimit(PAGE);
    setOpenKey(null);
  };

  const onRefresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: watchlistKeys.all }),
    [queryClient],
  );

  const confirmRemove = (item: WatchlistItem) => {
    if (!active || readOnly) return;
    Alert.alert(
      `Remove ${item.symbol}?`,
      `It comes off “${active.name}”. Your other lists keep it.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            removeItem.mutate(
              { id: active.id, exchange: item.exchange, symbol: item.symbol },
              {
                onSuccess: () => {
                  setOpenKey((key) => (key === itemKey(item) ? null : key));
                  toast.success('Removed', `${item.symbol} is off “${active.name}”.`);
                },
                onError: (error) => toast.error('Couldn’t remove it', getErrorMessage(error)),
              },
            ),
        },
      ],
    );
  };

  const confirmDelete = () => {
    if (!active || readOnly) return;
    const list = active;
    setSheet(null);
    // iOS won't present the alert while the actions sheet is still animating away.
    afterSheetClose(() =>
      Alert.alert(
        `Delete “${list.name}”?`,
        'The list and its tracking history are gone for good.',
        [
          { text: 'Keep it', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () =>
              remove.mutate(list.id, {
                onSuccess: () => {
                  setSelectedId(null);
                  toast.success('List deleted', list.name);
                },
                onError: (error) => toast.error('Couldn’t delete the list', getErrorMessage(error)),
              }),
          },
        ],
      ),
    );
  };

  const share = () => {
    if (!view) return;
    setSheet(null);
    afterSheetClose(() => {
      void Share.share({ title: `${view.name}.csv`, message: watchlistCsv(shown) }).catch(() =>
        toast.error('Couldn’t open sharing'),
      );
    });
  };

  const addStock = (pick: StockPick) => {
    if (!active || readOnly) return;
    addItem.mutate(
      { id: active.id, item: { exchange: pick.exchange, symbol: pick.symbol } },
      {
        onSuccess: () => toast.success('Added', `${pick.symbol} is tracked from today's price.`),
        onError: (error) => toast.error('Couldn’t add it', getErrorMessage(error)),
      },
    );
  };

  const goTo = (href: Parameters<typeof router.push>[0]) => {
    setOpenKey(null);
    afterSheetClose(() => router.push(href));
  };

  const sortOptions = (Object.keys(SORT_LABEL) as WatchlistSort[])
    .filter((key) => hasAi || key !== 'score')
    .map((key) => ({ key, label: SORT_LABEL[key] }));
  const quickItems = (Object.keys(QUICK_LABEL) as QuickFilter[])
    .filter((key) => hasAi || (key !== 'new' && key !== 'repeat'))
    .map((key) => ({ key, label: `${QUICK_LABEL[key]} (${counts[key]})` }));
  const listChips = ordered.map((list) => ({
    key: list.id,
    label: `${list.name} · ${list.itemCount}`,
  }));
  const full = rows.length >= MAX_WATCHLIST_ITEMS;
  const busyAddKey =
    addItem.isPending && addItem.variables ? itemKey(addItem.variables.item) : null;

  return (
    <GroupScreen
      onRefresh={onRefresh}
      intro="Track stocks from the price you added them at."
      right={
        ownCount < MAX_WATCHLISTS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="New watchlist"
            hitSlop={8}
            onPress={() => {
              create.reset();
              setSheet('create');
            }}
            className="flex-row items-center gap-1 active:opacity-60"
          >
            <Plus size={16} color={colors.link} />
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              New list
            </Text>
          </Pressable>
        ) : undefined
      }
    >
      {lists.isPending ? (
        <ListSkeleton rows={5} />
      ) : lists.error && !lists.data ? (
        <InlineError
          what="your watchlists"
          error={lists.error}
          onRetry={() => void lists.refetch()}
        />
      ) : !active ? (
        <InlineEmpty
          title="No watchlists yet"
          message="Create a list and add stocks to track them from today's price."
          action={{ label: 'Create a list', onPress: () => setSheet('create') }}
        />
      ) : (
        <>
          <Chips items={listChips} value={active.id} onChange={selectList} className="mb-4" />

          {detail.isPending ? (
            <ListSkeleton rows={5} />
          ) : detail.error && !view ? (
            <InlineError
              what="this list"
              error={detail.error}
              onRetry={() => void detail.refetch()}
            />
          ) : view ? (
            <>
              <WatchlistSummaryCard view={view} now={now} onMenu={() => setSheet('actions')} />
              {view.ai ? (
                <View className="mt-3">
                  <AiPulseCard ai={view.ai} newestFlagDate={newest} />
                </View>
              ) : null}

              <Section
                title="Stocks"
                right={
                  !readOnly ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: full }}
                      disabled={full}
                      hitSlop={8}
                      onPress={() => setSheet('add')}
                      className="flex-row items-center gap-1 active:opacity-60"
                      style={full ? { opacity: 0.4 } : undefined}
                    >
                      <Plus size={15} color={colors.link} />
                      <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                        Add stock
                      </Text>
                    </Pressable>
                  ) : undefined
                }
              >
                {rows.length === 0 ? (
                  <InlineEmpty
                    title={readOnly ? 'Nothing flagged yet' : 'Nothing here yet'}
                    message={
                      readOnly
                        ? "The daily batch hasn't flagged anything in this window. The list fills itself as recommendations are published."
                        : 'Add a stock and this list tracks it from today’s price.'
                    }
                    action={
                      readOnly
                        ? undefined
                        : { label: 'Add a stock', onPress: () => setSheet('add') }
                    }
                  />
                ) : (
                  <>
                    <View className="flex-row items-center gap-2.5">
                      <Input
                        value={query}
                        onChangeText={(text) => {
                          setQuery(text);
                          setLimit(PAGE);
                        }}
                        placeholder={hasAi ? 'Filter by name or sector' : 'Filter this list'}
                        autoCorrect={false}
                        returnKeyType="search"
                        accessibilityLabel="Filter this watchlist"
                        leftIcon={<Search size={17} color={colors.textMuted} />}
                        containerClassName="flex-1"
                      />
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Sort, now ${SORT_LABEL[effectiveSort]}`}
                        onPress={() => setSheet('sort')}
                        className="h-12 flex-row items-center gap-1.5 rounded-field border border-line-strong px-3 active:bg-surface-sunk dark:border-line-dark-strong dark:active:bg-surface-sunk-dark"
                      >
                        <ArrowUpDown size={15} color={colors.text} />
                        <Text
                          className="max-w-[92px] text-[13px] font-semibold text-ink dark:text-ink-dark"
                          numberOfLines={1}
                        >
                          {SORT_LABEL[effectiveSort]}
                        </Text>
                      </Pressable>
                    </View>
                    <Chips
                      items={quickItems}
                      value={effectiveQuick}
                      onChange={(key) => {
                        setQuick(key);
                        setLimit(PAGE);
                      }}
                      className="mb-3 mt-3"
                    />

                    {shown.length === 0 ? (
                      <InlineEmpty
                        title="Nothing matches"
                        message="No stock on this list matches the filter."
                        action={{
                          label: 'Clear filters',
                          onPress: () => {
                            setQuery('');
                            setQuick('all');
                          },
                        }}
                      />
                    ) : (
                      <ListCard>
                        {visible.map((item, index) => (
                          <View key={itemKey(item)}>
                            {index > 0 ? <RowDivider /> : null}
                            <WatchlistRow
                              item={item}
                              onPress={() => setOpenKey(itemKey(item))}
                              onLongPress={readOnly ? undefined : () => confirmRemove(item)}
                            />
                          </View>
                        ))}
                      </ListCard>
                    )}

                    {shown.length > visible.length ? (
                      <Pressable
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={() => setLimit((current) => current + PAGE)}
                        className="mt-3 items-center py-1 active:opacity-60"
                      >
                        <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
                          Show {Math.min(PAGE, shown.length - visible.length)} more ·{' '}
                          {visible.length} of {shown.length}
                        </Text>
                      </Pressable>
                    ) : null}
                    {!readOnly ? (
                      <Text className="mt-3 text-center text-[11px] text-ink-faint dark:text-ink-dark-faint">
                        Long-press a stock to remove it.
                      </Text>
                    ) : null}
                  </>
                )}
              </Section>

              <Caveats items={view.caveats} className="mt-6 gap-1.5" />
            </>
          ) : null}
        </>
      )}

      {sheet === 'create' ? (
        <ListNameSheet
          mode="create"
          busy={create.isPending}
          error={create.error}
          onClose={() => setSheet(null)}
          onSubmit={(name) =>
            create.mutate(
              { name },
              {
                onSuccess: (created) => {
                  setSheet(null);
                  selectList(created.id);
                  toast.success('List created', created.name);
                },
              },
            )
          }
        />
      ) : null}
      {sheet === 'rename' && active && !readOnly ? (
        <ListNameSheet
          mode="rename"
          initialName={active.name}
          busy={rename.isPending}
          error={rename.error}
          onClose={() => setSheet(null)}
          onSubmit={(name) =>
            rename.mutate(
              { id: active.id, name },
              {
                onSuccess: () => {
                  setSheet(null);
                  toast.success('List renamed', name);
                },
              },
            )
          }
        />
      ) : null}
      {sheet === 'actions' && active ? (
        <ListActionsSheet
          name={active.name}
          readOnly={readOnly}
          canShare={shown.length > 0}
          onClose={() => setSheet(null)}
          onShare={share}
          onRename={() => {
            rename.reset();
            // One RN Modal at a time: the name sheet presents once this one has gone.
            setSheet(null);
            afterSheetClose(() => setSheet('rename'));
          }}
          onDelete={confirmDelete}
        />
      ) : null}
      {sheet === 'add' && active && !readOnly ? (
        <StockSearchSheet
          visible
          title={`Add to “${active.name}”`}
          subtitle="Tracked from the price at the moment you add it"
          actionLabel="Add"
          isPicked={(pick) => alreadyIn.has(itemKey(pick))}
          busyKey={busyAddKey}
          onPick={addStock}
          onClose={() => setSheet(null)}
          footnote={full ? `A list holds at most ${MAX_WATCHLIST_ITEMS} stocks.` : undefined}
        />
      ) : null}
      <OptionSheet
        visible={sheet === 'sort'}
        title="Sort stocks by"
        options={sortOptions}
        value={effectiveSort}
        onSelect={(key) => {
          setSort(key);
          setLimit(PAGE);
        }}
        onClose={() => setSheet(null)}
      />

      {openItem ? (
        <WatchlistStockSheet
          item={openItem}
          now={now}
          onClose={() => setOpenKey(null)}
          onOpenStock={() => goTo(stockHref(openItem.symbol, openItem.exchange))}
          onTradePaper={() =>
            goTo(
              ticketHref({
                symbol: openItem.symbol,
                exchange: openItem.exchange,
                side: 'BUY',
                mode: 'paper',
              }),
            )
          }
          onRemove={readOnly ? undefined : () => confirmRemove(openItem)}
        />
      ) : null}
    </GroupScreen>
  );
}
