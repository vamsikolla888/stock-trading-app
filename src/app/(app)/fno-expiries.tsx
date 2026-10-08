import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ExternalLink from 'lucide-react-native/icons/external-link';
import React, { useCallback, useMemo, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';

import { InlineEmpty, InlineError } from '@/components/common/InlineError';
import { useScreenLayout } from '@/components/layout/responsive';
import { ListSkeleton, StackScreen } from '@/components/navigation/StackScreen';
import { OptionSheet } from '@/components/ui/OptionSheet';
import { ListCard, RowDivider } from '@/components/ui/Section';
import { Chips } from '@/components/ui/Tabs';
import {
  AgendaDay,
  CalendarLegend,
  MonthGrid,
  MonthSwitcher,
  SelectedDay,
} from '@/features/fno/components/ExpiryCalendar';
import { Disclosure, Note } from '@/features/fno/components/primitives';
import { useExpiryCalendar } from '@/features/fno/hooks';
import {
  buildMonthView,
  calendarTitle,
  CATEGORY_OPTIONS,
  CONTRACT_OPTIONS,
  DEFAULT_FILTERS,
  EXCHANGE_OPTIONS,
  isDefaultFilters,
  istMonth,
  monthLabel,
  monthWeeks,
  shiftMonth,
  sourcesForMonth,
  type CalendarDay,
  type CalendarFilters,
} from '@/features/fno/lib/calendar';
import { timeIst, todayIst } from '@/features/fno/lib/format';
import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

export { RouteErrorBoundary as ErrorBoundary } from '@/components/common/RouteErrorBoundary';

/**
 * /fno-expiries — the F&O month calendar (the web's FnoExpiryCalendar, 2026-10-07): every
 * index, stock and MCX commodity expiry in one month, from Groww's instrument master, with the
 * published Government of India public holidays and NSE / BSE / MCX trading holidays (MCX's
 * one-session closures included) beside them. A compact month grid, the tapped day under it,
 * then the month's agenda; on a tablet the agenda sits beside the grid.
 *
 * Stock F&O shares one monthly expiry, so it is ONE line per date with a count; an index or a
 * commodity opens its chain at that expiry (a commodity read-only).
 */
export default function FnoExpiriesScreen() {
  const { colors } = useTheme();
  const layout = useScreenLayout();
  const wide = layout.columns >= 2;
  const thisMonth = useMemo(() => istMonth(), []);
  const today = useMemo(() => todayIst(), []);
  const [month, setMonth] = useState(thisMonth);
  const [selected, setSelected] = useState<string | null>(today);
  const [filters, setFilters] = useState<CalendarFilters>(DEFAULT_FILTERS);
  const [picking, setPicking] = useState<'contract' | 'exchange' | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const cal = useExpiryCalendar(month);

  // keepPreviousData holds last month while this one loads: its marks are not drawn on this
  // month's grid, and its agenda is not shown as this month's.
  const shown = cal.data?.month === month ? cal.data : null;
  const view = useMemo(
    () => (shown ? buildMonthView(shown, filters, selected) : null),
    [shown, filters, selected],
  );
  const weeks = useMemo(() => monthWeeks(month), [month]);
  const sources = useMemo(
    () => (shown ? sourcesForMonth(shown.holidaySources, month) : []),
    [shown, month],
  );
  const selectedDay =
    view && selected?.startsWith(`${month}-`)
      ? (view.byDate.get(selected) ?? {
          date: selected,
          entries: [],
          holidays: [],
          daysToExpiry: null,
        })
      : null;

  const goTo = useCallback(
    (next: string) => {
      setMonth(next);
      setSelected(next === thisMonth ? today : `${next}-01`);
    },
    [thisMonth, today],
  );
  const setFilter = <K extends keyof CalendarFilters>(key: K, value: CalendarFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await cal.refetch();
    } finally {
      setRefreshing(false);
    }
  }, [cal]);

  const contractLabel = CONTRACT_OPTIONS.find((o) => o.key === filters.contract)?.label ?? '';
  const exchangeLabel = EXCHANGE_OPTIONS.find((o) => o.key === filters.exchange)?.label ?? '';

  const filtersBar = (
    <View className="gap-3">
      <Chips
        items={CATEGORY_OPTIONS}
        value={filters.category}
        onChange={(v) => setFilter('category', v)}
      />
      <View className="flex-row items-center gap-2">
        <SelectPill
          label={contractLabel}
          a11y={`Contracts: ${contractLabel}. Change`}
          onPress={() => setPicking('contract')}
        />
        <SelectPill
          label={exchangeLabel}
          a11y={`Exchange: ${exchangeLabel}. Change`}
          onPress={() => setPicking('exchange')}
        />
        <View className="flex-1" />
        {!isDefaultFilters(filters) ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Reset filters"
            hitSlop={8}
            onPress={() => setFilters(DEFAULT_FILTERS)}
            className="h-9 justify-center px-1 active:opacity-60"
          >
            <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
              Reset
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );

  const gridCard = (
    <View className="rounded-card border border-line bg-surface px-2 pb-3 pt-2 dark:border-line-dark dark:bg-surface-dark">
      <MonthSwitcher
        month={month}
        onPrev={() => goTo(shiftMonth(month, -1))}
        onNext={() => goTo(shiftMonth(month, 1))}
        onToday={month === thisMonth ? null : () => goTo(thisMonth)}
        busy={cal.isFetching && !shown}
      />
      <View className="mt-1">
        <MonthGrid
          weeks={weeks}
          byDate={view?.byDate ?? EMPTY_DAYS}
          today={today}
          selected={selected}
          onSelect={setSelected}
          dimmed={!shown}
        />
      </View>
      <View className="px-1.5">
        {selectedDay ? <SelectedDay day={selectedDay} contract={filters.contract} /> : null}
        <CalendarLegend className="mt-3 border-t border-line pt-3 dark:border-line-dark" />
      </View>
    </View>
  );

  let agenda: React.ReactNode;
  if (cal.isError && !shown) {
    agenda = (
      <InlineError what="the calendar" error={cal.error} onRetry={() => void cal.refetch()} />
    );
  } else if (!shown || !view) {
    agenda = <ListSkeleton rows={4} />;
  } else if (view.agenda.length === 0) {
    agenda = (
      <InlineEmpty
        title="Nothing this month"
        message={isDefaultFilters(filters) ? undefined : 'No expiries or holidays match.'}
        action={
          isDefaultFilters(filters)
            ? undefined
            : { label: 'Reset filters', onPress: () => setFilters(DEFAULT_FILTERS) }
        }
      />
    );
  } else {
    agenda = (
      <ListCard>
        {view.agenda.map((day, index) => (
          <View key={day.date}>
            {index > 0 ? <RowDivider /> : null}
            <AgendaDay
              day={day}
              contract={filters.contract}
              active={day.date === selected}
              onSelect={setSelected}
            />
          </View>
        ))}
      </ListCard>
    );
  }

  const agendaSection = (
    <View>
      <View className="mb-2 flex-row items-baseline justify-between">
        <Text
          accessibilityRole="header"
          className="text-[15px] font-bold text-ink dark:text-ink-dark"
        >
          {monthLabel(month)}
        </Text>
        {view ? (
          <Text className="text-xs text-ink-faint dark:text-ink-dark-faint">
            {view.expiryCount} expir{view.expiryCount === 1 ? 'y' : 'ies'} · {view.holidayCount}{' '}
            holiday{view.holidayCount === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>
      {agenda}
    </View>
  );

  const footer = shown ? (
    <View className="gap-3">
      <Note>Stock F&amp;O shares one monthly expiry, counted on one line.</Note>
      {sources.length ? (
        <Disclosure title="Holiday sources" meta="Published schedules, not calculated">
          <View className="gap-1">
            {sources.map((s) => (
              <Pressable
                key={s.url}
                accessibilityRole="link"
                accessibilityLabel={`${s.label}, opens in the browser`}
                onPress={() => void Linking.openURL(s.url)}
                className="min-h-[40px] flex-row items-center gap-2 active:opacity-60"
              >
                <Text className="flex-1 text-[13px] text-brand-text dark:text-brand-text-dark">
                  {s.label}
                </Text>
                <ExternalLink size={14} color={colors.link} />
              </Pressable>
            ))}
          </View>
        </Disclosure>
      ) : (
        <Note>
          No official holiday list for {month.slice(0, 4)} yet. Expiries are from Groww’s instrument
          master.
        </Note>
      )}
      <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
        As of {timeIst(shown.asOf)} IST
      </Text>
    </View>
  ) : null;

  return (
    <StackScreen
      title={calendarTitle(filters.category)}
      subtitle="Expiries & holidays"
      scroll={false}
    >
      <ScrollView
        className="flex-1"
        contentContainerStyle={{
          paddingHorizontal: layout.gutter,
          paddingTop: 16,
          paddingBottom: 40,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        <View className={cn('w-full gap-4', !wide && 'max-w-[640px] self-center')}>
          {filtersBar}
          {wide ? (
            <View className="flex-row items-start gap-5">
              <View className="flex-1">{gridCard}</View>
              <View className="flex-1 gap-4">
                {agendaSection}
                {footer}
              </View>
            </View>
          ) : (
            <>
              {gridCard}
              {agendaSection}
              {footer}
            </>
          )}
        </View>
      </ScrollView>

      <OptionSheet
        visible={picking === 'contract'}
        title="Contracts"
        options={CONTRACT_OPTIONS}
        value={filters.contract}
        onSelect={(v) => setFilter('contract', v)}
        onClose={() => setPicking(null)}
      />
      <OptionSheet
        visible={picking === 'exchange'}
        title="Exchange"
        options={EXCHANGE_OPTIONS}
        value={filters.exchange}
        onSelect={(v) => setFilter('exchange', v)}
        onClose={() => setPicking(null)}
      />
    </StackScreen>
  );
}

const EMPTY_DAYS: ReadonlyMap<string, CalendarDay> = new Map<string, CalendarDay>();

function SelectPill({
  label,
  a11y,
  onPress,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={onPress}
      className="h-9 flex-row items-center gap-1 rounded-lg border border-line px-3 active:bg-surface-sunk dark:border-line-dark dark:active:bg-surface-sunk-dark"
    >
      <Text className="text-[13px] font-semibold text-ink dark:text-ink-dark">{label}</Text>
      <ChevronDown size={14} color={colors.textMuted} />
    </Pressable>
  );
}
