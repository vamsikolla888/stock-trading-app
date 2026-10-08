import { useRouter } from 'expo-router';
import CalendarX from 'lucide-react-native/icons/calendar-x';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Flag from 'lucide-react-native/icons/flag';
import React, { memo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { cn } from '@/lib/utils/cn';
import { useTheme } from '@/theme/ThemeProvider';

import {
  contractLabel,
  dayMarks,
  exchangeLabel,
  holidaySessionLabel,
  monthLabel,
  weekdayOf,
  WEEKDAY_INITIALS,
  type CalendarDay,
  type ContractFilter,
} from '../lib/calendar';
import { calendarEntryHref } from '../lib/explore';
import { dayHeading, dteLabel } from '../lib/format';
import type { CalendarHoliday, ExpiryEntry } from '../types';

import { CommodityGlyph, IndexGlyph } from './Glyphs';

/**
 * The F&O month calendar's parts, laid out for a phone: a compact month grid (a calm dot per
 * expiry kind, a tint for a holiday), the selected day, and an agenda row per date. The
 * route (app/(app)/fno-expiries.tsx) owns the data and the filters.
 */

const NUM = { fontVariant: ['tabular-nums' as const] };
const CELL_HEIGHT = 50;
const DOT = 5;

/* ── Month switcher + grid ─────────────────────────────────────────────────────────── */

export function MonthSwitcher({
  month,
  onPrev,
  onNext,
  onToday,
  busy,
}: {
  month: string;
  onPrev: () => void;
  onNext: () => void;
  /** Shown when another month is on screen. */
  onToday: (() => void) | null;
  busy: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View className="flex-row items-center gap-1">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Previous month"
        hitSlop={6}
        onPress={onPrev}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <ChevronLeft size={20} color={colors.text} />
      </Pressable>
      <View className="flex-1 flex-row items-center justify-center gap-2">
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          className="text-base font-bold text-ink dark:text-ink-dark"
        >
          {monthLabel(month)}
        </Text>
        {busy ? <ActivityIndicator size="small" color={colors.accent} /> : null}
      </View>
      {onToday ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back to this month"
          hitSlop={6}
          onPress={onToday}
          className="h-8 justify-center rounded-full px-2.5 active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
        >
          <Text className="text-[13px] font-semibold text-brand-text dark:text-brand-text-dark">
            Today
          </Text>
        </Pressable>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next month"
        hitSlop={6}
        onPress={onNext}
        className="h-10 w-10 items-center justify-center rounded-full active:bg-surface-sunk dark:active:bg-surface-sunk-dark"
      >
        <ChevronRight size={20} color={colors.text} />
      </Pressable>
    </View>
  );
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function cellLabel(date: string, day: CalendarDay | undefined): string {
  const d = Number(date.slice(8, 10));
  const m = MONTH_NAMES[Number(date.slice(5, 7)) - 1] ?? '';
  const parts = [`${weekdayOf(date)} ${d} ${m}`];
  const n = day?.entries.length ?? 0;
  if (n) parts.push(`${n} expir${n === 1 ? 'y' : 'ies'}`);
  const marks = dayMarks(day);
  if (marks.market) parts.push('market holiday');
  else if (marks.public) parts.push('public holiday');
  return parts.join(', ');
}

const GridCell = memo(function GridCell({
  date,
  day,
  today,
  selected,
  onSelect,
}: {
  date: string;
  day: CalendarDay | undefined;
  today: boolean;
  selected: boolean;
  onSelect: (date: string) => void;
}) {
  const { colors } = useTheme();
  const marks = dayMarks(day);
  const dots = [
    marks.index ? colors.info : null,
    marks.stocks ? colors.textFaint : null,
    marks.commodity ? colors.warning : null,
  ].filter((c): c is string => c != null);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={cellLabel(date, day)}
      onPress={() => onSelect(date)}
      className="flex-1 p-0.5"
      style={{ height: CELL_HEIGHT }}
    >
      <View
        className={cn(
          'flex-1 items-center rounded-lg pt-1',
          marks.market
            ? 'bg-danger-wash dark:bg-danger-wash-dark'
            : marks.public
              ? 'bg-warning-wash dark:bg-warning-wash-dark'
              : null,
        )}
      >
        <View
          className={cn(
            'h-[30px] w-[30px] items-center justify-center rounded-full',
            selected
              ? 'bg-brand-strong dark:bg-brand-strong-dark'
              : today
                ? 'border border-brand'
                : null,
          )}
        >
          <Text
            className={cn(
              'text-[13px]',
              selected
                ? 'font-bold text-white'
                : marks.market
                  ? 'font-semibold text-danger-600 dark:text-danger-dark'
                  : today
                    ? 'font-bold text-brand-text dark:text-brand-text-dark'
                    : 'text-ink dark:text-ink-dark',
            )}
            style={NUM}
          >
            {Number(date.slice(8, 10))}
          </Text>
        </View>
        <View className="mt-1 flex-row gap-[3px]" style={{ height: DOT }}>
          {dots.map((color) => (
            <View
              key={color}
              style={{ width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: color }}
            />
          ))}
        </View>
      </View>
    </Pressable>
  );
});

export function MonthGrid({
  weeks,
  byDate,
  today,
  selected,
  onSelect,
  dimmed,
}: {
  weeks: (string | null)[][];
  byDate: ReadonlyMap<string, CalendarDay>;
  today: string;
  selected: string | null;
  onSelect: (date: string) => void;
  /** The marks belong to a month still loading (none are drawn). */
  dimmed: boolean;
}) {
  return (
    <View style={dimmed ? { opacity: 0.55 } : undefined}>
      <View className="flex-row">
        {WEEKDAY_INITIALS.map((d, i) => (
          <Text
            // Two S and two T: the index is the identity.
            key={`${d}${i}`}
            className="flex-1 pb-1.5 text-center text-[11px] font-semibold text-ink-faint dark:text-ink-dark-faint"
          >
            {d}
          </Text>
        ))}
      </View>
      {weeks.map((week) => (
        <View key={week.find((d) => d) ?? 'blank'} className="flex-row">
          {week.map((date, i) =>
            date ? (
              <GridCell
                key={date}
                date={date}
                day={byDate.get(date)}
                today={date === today}
                selected={date === selected}
                onSelect={onSelect}
              />
            ) : (
              <View key={`blank-${i}`} className="flex-1" style={{ height: CELL_HEIGHT }} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

/* ── Legend ───────────────────────────────────────────────────────────────────────────── */

export function CalendarLegend({ className }: { className?: string }) {
  const { colors } = useTheme();
  const dot = (color: string, label: string) => (
    <View key={label} className="flex-row items-center gap-1.5">
      <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
    </View>
  );
  const swatch = (box: string, label: string) => (
    <View key={label} className="flex-row items-center gap-1.5">
      <View className={cn('h-3 w-3 rounded-[4px]', box)} />
      <Text className="text-[11px] text-ink-muted dark:text-ink-dark-muted">{label}</Text>
    </View>
  );
  return (
    <View className={cn('flex-row flex-wrap gap-x-4 gap-y-2', className)}>
      {dot(colors.info, 'Index')}
      {dot(colors.textFaint, 'Stocks')}
      {dot(colors.warning, 'Commodities')}
      {swatch('bg-danger-wash dark:bg-danger-wash-dark', 'Market holiday')}
      {swatch('bg-warning-wash dark:bg-warning-wash-dark', 'Public holiday')}
    </View>
  );
}

/* ── Day events (selected day + agenda) ─────────────────────────────────────────────── */

function EntryMark({ entry }: { entry: ExpiryEntry }) {
  if (entry.kind === 'commodity')
    return <CommodityGlyph underlying={entry.underlying ?? ''} size={30} />;
  if (entry.kind === 'index') {
    return <IndexGlyph underlying={entry.underlying ?? ''} exchange={entry.exchange} size={30} />;
  }
  return (
    <View
      accessible={false}
      className="items-center justify-center bg-surface-sunk dark:bg-surface-sunk-dark"
      style={{ width: 30, height: 30, borderRadius: 9 }}
    >
      <Text className="text-[9px] font-extrabold text-ink-muted dark:text-ink-dark-muted">STK</Text>
    </View>
  );
}

function EntryRow({
  entry,
  date,
  daysToExpiry,
  contract,
}: {
  entry: ExpiryEntry;
  date: string;
  daysToExpiry: number | null;
  contract: ContractFilter;
}) {
  const router = useRouter();
  const underlying = entry.underlying;
  // An index or a commodity opens its chain AT this expiry when options expire then (else its
  // futures); the stock line is a count, not one instrument, and opens nothing.
  const opens = entry.kind !== 'stocks' && underlying != null;
  const toOptions = entry.hasOptions && contract !== 'futures';
  const sub = [
    contractLabel(entry),
    exchangeLabel(entry.exchange),
    entry.kind === 'stocks' ? `${entry.count} stock${entry.count === 1 ? '' : 's'}` : null,
    daysToExpiry != null && daysToExpiry >= 0 ? dteLabel(daysToExpiry) : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Pressable
      accessibilityRole={opens ? 'button' : undefined}
      accessibilityLabel={`${entry.label}, ${sub}${opens ? (toOptions ? ', opens the option chain' : ', opens its futures') : ''}`}
      disabled={!opens}
      onPress={
        opens && underlying
          ? () => router.push(calendarEntryHref(entry.exchange, underlying, date, toOptions))
          : undefined
      }
      className="min-h-[44px] flex-row items-center gap-3 rounded-lg active:opacity-70"
    >
      <EntryMark entry={entry} />
      <View className="min-w-0 flex-1">
        <Text
          className={cn(
            'text-sm font-semibold',
            opens ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
          )}
          numberOfLines={1}
        >
          {entry.label}
        </Text>
        <Text
          className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted"
          numberOfLines={1}
          style={NUM}
        >
          {sub}
        </Text>
      </View>
    </Pressable>
  );
}

function HolidayRow({ holiday }: { holiday: CalendarHoliday }) {
  const { colors } = useTheme();
  const market = holiday.kind === 'market';
  const Icon = market ? CalendarX : Flag;
  return (
    <View
      accessible
      accessibilityLabel={`${holiday.name}, ${holidaySessionLabel(holiday)}${holiday.note ? `, ${holiday.note}` : ''}`}
      className="min-h-[44px] flex-row items-center gap-3"
    >
      <View
        className={cn(
          'items-center justify-center',
          market
            ? 'bg-danger-wash dark:bg-danger-wash-dark'
            : 'bg-warning-wash dark:bg-warning-wash-dark',
        )}
        style={{ width: 30, height: 30, borderRadius: 9 }}
      >
        <Icon size={15} color={market ? colors.danger : colors.warning} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold text-ink dark:text-ink-dark" numberOfLines={1}>
          {holiday.name}
        </Text>
        <Text className="mt-0.5 text-xs text-ink-muted dark:text-ink-dark-muted">
          {holidaySessionLabel(holiday)}
          {holiday.note ? ` · ${holiday.note}` : ''}
        </Text>
      </View>
    </View>
  );
}

/** Everything on one date: its expiries, then its holidays. */
export function DayEvents({ day, contract }: { day: CalendarDay; contract: ContractFilter }) {
  if (!day.entries.length && !day.holidays.length) {
    return (
      <Text className="py-2 text-[13px] text-ink-muted dark:text-ink-dark-muted">
        No expiries or holidays
      </Text>
    );
  }
  return (
    <View className="gap-1.5">
      {day.entries.map((entry) => (
        <EntryRow
          key={`${entry.kind}:${entry.exchange}:${entry.underlying ?? 'stocks'}`}
          entry={entry}
          date={day.date}
          daysToExpiry={day.daysToExpiry}
          contract={contract}
        />
      ))}
      {day.holidays.map((holiday, i) => (
        <HolidayRow key={`${holiday.kind}:${holiday.name}:${i}`} holiday={holiday} />
      ))}
    </View>
  );
}

/** The selected date, under the grid: Groww's "tap a day, read it below". */
export function SelectedDay({ day, contract }: { day: CalendarDay; contract: ContractFilter }) {
  return (
    <View className="mt-3 border-t border-line pt-3 dark:border-line-dark">
      <Text className="mb-1.5 text-[13px] font-semibold text-ink-muted dark:text-ink-dark-muted">
        {dayHeading(day.date)}
      </Text>
      <DayEvents day={day} contract={contract} />
    </View>
  );
}

/** One agenda date: the day number and weekday, then its events. */
export const AgendaDay = memo(function AgendaDay({
  day,
  contract,
  active,
  onSelect,
}: {
  day: CalendarDay;
  contract: ContractFilter;
  active: boolean;
  onSelect: (date: string) => void;
}) {
  return (
    <View
      className={cn(
        'flex-row gap-3 px-3.5 py-3',
        active && 'bg-surface-sunk dark:bg-surface-sunk-dark',
      )}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Show ${dayHeading(day.date)} on the calendar`}
        onPress={() => onSelect(day.date)}
        hitSlop={4}
        className="w-10 items-center pt-1"
      >
        <Text
          className={cn(
            'text-[17px] font-bold',
            active ? 'text-brand-text dark:text-brand-text-dark' : 'text-ink dark:text-ink-dark',
          )}
          style={NUM}
        >
          {Number(day.date.slice(8, 10))}
        </Text>
        <Text className="text-[11px] text-ink-faint dark:text-ink-dark-faint">
          {weekdayOf(day.date)}
        </Text>
      </Pressable>
      <View className="min-w-0 flex-1">
        <DayEvents day={day} contract={contract} />
      </View>
    </View>
  );
});
