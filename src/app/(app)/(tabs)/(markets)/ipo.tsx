import { useRouter } from 'expo-router';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { GroupScreen } from '@/components/navigation/GroupScreen';
import { ListSkeleton } from '@/components/navigation/StackScreen';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import { formatIstTime } from '@/features/home/lib/istTime';
import { IpoLogo, ToneLine } from '@/features/ipo/components/IpoParts';
import { IpoRow, stageDate } from '@/features/ipo/components/IpoRow';
import { useIpoList } from '@/features/ipo/hooks';
import {
  FILTERS,
  gmpPctText,
  ISSUE_FILTERS,
  listingWhen,
  researchLine,
  times,
  type IssueFilter,
} from '@/features/ipo/lib/format';
import type { IpoListFilter, IpoRecord } from '@/features/ipo/types';
import { useNow } from '@/hooks/useNow';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

/** IPOs listing today or tomorrow, each with where its research report stands. */
function ListingSoon({ items, onOpen }: { items: IpoRecord[]; onOpen: (ipo: IpoRecord) => void }) {
  if (items.length === 0) return null;
  return (
    <View className="mb-5">
      <Text
        accessibilityRole="header"
        className="mb-2.5 text-[15px] font-bold text-ink dark:text-ink-dark"
      >
        Listing soon
      </Text>
      <ListCard>
        {items.map((ipo, index) => {
          const today = listingWhen(ipo.listingDate) === 'today';
          // Listing day reads the entry report once it exists; the eve reads the setup report.
          const line =
            (today ? researchLine('post-listing', ipo.research?.postListing) : null) ??
            researchLine('pre-listing', ipo.research?.preListing);
          return (
            <View key={ipo.id}>
              {index > 0 ? <RowDivider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${ipo.companyName}, ${stageDate(ipo)}`}
                onPress={() => onOpen(ipo)}
                className="flex-row items-center gap-3 px-3.5 py-3 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
              >
                <IpoLogo ipo={ipo} />
                <View className="flex-1 gap-0.5">
                  <Text
                    className="text-sm font-semibold text-ink dark:text-ink-dark"
                    numberOfLines={1}
                  >
                    {ipo.companyName}
                  </Text>
                  <Text
                    className="text-xs text-ink-muted dark:text-ink-dark-muted"
                    numberOfLines={1}
                  >
                    {stageDate(ipo)} · GMP {gmpPctText(ipo.gmpPercent)} ·{' '}
                    {times(ipo.totalSubscription)}
                  </Text>
                  <ToneLine
                    tone={line?.tone ?? 'neutral'}
                    text={
                      line?.text ??
                      (today ? 'Entry report from 10:20 IST' : 'Report scheduled for this evening')
                    }
                  />
                </View>
              </Pressable>
            </View>
          );
        })}
      </ListCard>
    </View>
  );
}

/**
 * IPO centre (web: /ipo) — every issue on the board with its dates, price band, grey-market
 * premium, subscription and research verdict. An IPO stays on the board through its listing
 * day. One request serves every filter: the board is small, so filtering happens on the phone
 * and switching is instant.
 */
export default function IpoScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [filter, setFilter] = useState<IpoListFilter>('all');
  const [issue, setIssue] = useState<IssueFilter>('all');
  const [issueOpen, setIssueOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // "Lists today / tomorrow" rolls over at midnight without a refresh.
  const now = useNow();

  const list = useIpoList('all');
  const all = useMemo(() => list.data?.items ?? [], [list.data]);
  const counts = list.data?.counts;

  const items = useMemo(
    () =>
      all.filter(
        (ipo) =>
          (filter === 'all' || ipo.status === filter) &&
          (issue === 'all' || ipo.issueType === issue),
      ),
    [all, filter, issue],
  );
  const soon = useMemo(
    () =>
      filter === 'all'
        ? all
            .filter((ipo) => listingWhen(ipo.listingDate, new Date(now)) != null)
            .filter((ipo) => issue === 'all' || ipo.issueType === issue)
            .sort((a, b) => (a.listingDate ?? '').localeCompare(b.listingDate ?? ''))
        : [],
    [all, filter, issue, now],
  );

  const chips = useMemo(
    () =>
      FILTERS.map((option) => {
        const count = option.key === 'all' ? counts?.all : counts?.[option.key];
        return {
          key: option.key,
          label: count != null ? `${option.label} · ${count}` : option.label,
        };
      }),
    [counts],
  );
  const issueLabel = ISSUE_FILTERS.find((option) => option.key === issue)?.label ?? '';

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await list.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [list]);

  const open = useCallback(
    (ipo: IpoRecord) => router.push({ pathname: '/ipo/[id]', params: { id: ipo.id } }),
    [router],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: IpoRecord; index: number }) => (
      <View
        className={cn(
          'border-x border-line bg-surface dark:border-line-dark dark:bg-surface-dark',
          index === 0 && 'overflow-hidden rounded-t-card border-t',
          index === items.length - 1 && 'overflow-hidden rounded-b-card border-b',
          index > 0 && 'border-t',
        )}
      >
        <IpoRow ipo={item} onPress={() => open(item)} />
      </View>
    ),
    [items.length, open],
  );

  const header = (
    <View className="pb-4">
      <ListingSoon items={soon} onOpen={open} />
      <Chips items={chips} value={filter} onChange={setFilter} />
    </View>
  );

  let empty: React.ReactElement;
  if (list.isPending) empty = <ListSkeleton rows={5} />;
  else if (list.error && all.length === 0)
    empty = <InlineError what="IPOs" error={list.error} onRetry={() => void list.refetch()} />;
  else
    empty = (
      <InlineEmpty
        title="No IPOs here"
        message={
          all.length === 0
            ? 'No issue is open, upcoming or listing today.'
            : 'Nothing matches these filters right now.'
        }
        action={
          filter !== 'all' || issue !== 'all'
            ? {
                label: 'Show every IPO',
                onPress: () => {
                  setFilter('all');
                  setIssue('all');
                },
              }
            : undefined
        }
      />
    );

  const updated = formatIstTime(list.data?.updatedAt);

  return (
    <GroupScreen
      scroll={false}
      intro={updated ? `Primary market · updated ${updated} IST` : 'Primary market'}
      right={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Issue type: ${issueLabel}`}
          hitSlop={8}
          onPress={() => setIssueOpen(true)}
          className="flex-row items-center gap-1 rounded-full border border-line px-3 py-1.5 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-xs font-semibold text-ink dark:text-ink-dark">{issueLabel}</Text>
          <ChevronDown size={14} color={colors.textMuted} />
        </Pressable>
      }
    >
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <View className="mt-5 flex-row gap-2.5 rounded-field bg-surface-sunk p-3 dark:bg-surface-sunk-dark">
            <ShieldCheck size={16} color={colors.textMuted} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-[11px] leading-4 text-ink-muted dark:text-ink-dark-muted">
              GMP and fair value are context, not a recommendation. GMP is unofficial and changes
              quickly. Fair value is a model estimate from the offer document against the listed
              peers it names; “good up to” is that value less a margin of safety (15% mainboard, 25%
              SME). Setup and entry scores are model-assisted research, not advice.
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressBackgroundColor={colors.surface}
          />
        }
      />
      <OptionSheet
        visible={issueOpen}
        title="Issue type"
        options={ISSUE_FILTERS}
        value={issue}
        onSelect={setIssue}
        onClose={() => setIssueOpen(false)}
      />
    </GroupScreen>
  );
}
