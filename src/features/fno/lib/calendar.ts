import type {
  CalendarHoliday,
  ExpiryCalendar,
  ExpiryDay,
  ExpiryEntry,
  HolidayMarket,
  HolidaySource,
} from '../types';

import { todayIst } from './format';

/**
 * The F&O month calendar (GET /fno/expiry-calendar?month=YYYY-MM) — the web's
 * FnoExpiryCalendar logic, pure so it is tested: the month grid, the filters, which marks a
 * day carries, and the agenda. Dates are plain YYYY-MM-DD strings in IST; nothing here reads
 * the device's time zone.
 */

export type CategoryFilter = 'all' | 'index' | 'stocks' | 'commodity';
export type ContractFilter = 'all' | 'options' | 'futures';
export type ExchangeFilter = 'all' | 'NFO' | 'BFO' | 'MCX';

export interface CalendarFilters {
  category: CategoryFilter;
  contract: ContractFilter;
  exchange: ExchangeFilter;
}

export const DEFAULT_FILTERS: CalendarFilters = {
  category: 'all',
  contract: 'all',
  exchange: 'all',
};

export const CATEGORY_OPTIONS: readonly { key: CategoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'index', label: 'Indices' },
  { key: 'stocks', label: 'Stocks' },
  { key: 'commodity', label: 'Commodities' },
];

export const CONTRACT_OPTIONS: readonly { key: ContractFilter; label: string }[] = [
  { key: 'all', label: 'Futures & options' },
  { key: 'options', label: 'Options' },
  { key: 'futures', label: 'Futures' },
];

export const EXCHANGE_OPTIONS: readonly { key: ExchangeFilter; label: string }[] = [
  { key: 'all', label: 'All exchanges' },
  { key: 'NFO', label: 'NSE' },
  { key: 'BFO', label: 'BSE' },
  { key: 'MCX', label: 'MCX' },
];

export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
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

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The server's `month` rule: YYYY-MM. */
export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && MONTH_RE.test(value);
}

/** This IST month, YYYY-MM. */
export function istMonth(now: number = Date.now()): string {
  return todayIst(now).slice(0, 7);
}

/** `month` moved by `delta` months ("2026-12" + 1 → "2027-01"). */
export function shiftMonth(month: string, delta: number): string {
  const m = MONTH_RE.exec(month);
  if (!m) return month;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** "October 2026". */
export function monthLabel(month: string): string {
  const m = MONTH_RE.exec(month);
  return m ? `${MONTHS[Number(m[2]) - 1]} ${m[1]}` : month;
}

/** "Tue" for a YYYY-MM-DD date. */
export function weekdayOf(iso: string): string {
  const m = DATE_RE.exec(iso);
  if (!m) return '';
  return (
    WEEKDAYS[new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay()] ?? ''
  );
}

/**
 * The month as week rows, Sunday first (the web's grid): each cell a date, or null before the
 * 1st and after the last day. Only as many weeks as the month needs — four to six.
 */
export function monthWeeks(month: string): (string | null)[][] {
  const m = MONTH_RE.exec(month);
  if (!m) return [];
  const year = Number(m[1]);
  const monthNumber = Number(m[2]);
  const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const count = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const size = Math.ceil((offset + count) / 7) * 7;
  const cells = Array.from({ length: size }, (_, index) => {
    const day = index - offset + 1;
    return day > 0 && day <= count ? `${month}-${String(day).padStart(2, '0')}` : null;
  });
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/* ── Labels ───────────────────────────────────────────────────────────────────────────── */

export function contractLabel(entry: Pick<ExpiryEntry, 'hasOptions' | 'hasFutures'>): string {
  if (entry.hasOptions && entry.hasFutures) return 'Futures & options';
  return entry.hasFutures ? 'Futures' : 'Options';
}

export function exchangeLabel(exchange: ExpiryEntry['exchange']): string {
  return exchange === 'BFO' ? 'BSE' : exchange === 'MCX' ? 'MCX' : 'NSE';
}

/** "NSE · BSE · Market closed" / "MCX · Morning session closed" / "Public holiday". */
export function holidaySessionLabel(holiday: CalendarHoliday): string {
  if (holiday.kind === 'public') return 'Public holiday';
  const markets = holiday.markets.join(' · ');
  const closed =
    holiday.session === 'morning'
      ? 'Morning session closed'
      : holiday.session === 'evening'
        ? 'Evening session closed'
        : 'Market closed';
  return markets ? `${markets} · ${closed}` : closed;
}

/** The screen title follows the market filter, as the web's does. */
export function calendarTitle(category: CategoryFilter): string {
  if (category === 'commodity') return 'Commodities expiry calendar';
  if (category === 'index') return 'Index expiry calendar';
  return 'F&O calendar';
}

/* ── Filtering ────────────────────────────────────────────────────────────────────────── */

export function matchesEntry(entry: ExpiryEntry, f: CalendarFilters): boolean {
  return (
    (f.category === 'all' || entry.kind === f.category) &&
    (f.exchange === 'all' || entry.exchange === f.exchange) &&
    (f.contract === 'all' || (f.contract === 'options' ? entry.hasOptions : entry.hasFutures))
  );
}

/**
 * Whether a holiday belongs on the calendar under these filters. A public holiday always does
 * (it is not an exchange's); a trading holiday only when it closes a market the filters show —
 * NSE for NFO, BSE for BFO, MCX for commodities.
 */
export function matchesHoliday(holiday: CalendarHoliday, f: CalendarFilters): boolean {
  if (holiday.kind === 'public') return true;
  const wanted: HolidayMarket[] =
    f.exchange === 'NFO'
      ? ['NSE']
      : f.exchange === 'BFO'
        ? ['BSE']
        : f.exchange === 'MCX'
          ? ['MCX']
          : f.category === 'commodity'
            ? ['MCX']
            : f.category === 'index' || f.category === 'stocks'
              ? ['NSE', 'BSE']
              : ['NSE', 'BSE', 'MCX'];
  return holiday.markets.some((market) => wanted.includes(market));
}

export function isDefaultFilters(f: CalendarFilters): boolean {
  return f.category === 'all' && f.contract === 'all' && f.exchange === 'all';
}

/* ── The month view ───────────────────────────────────────────────────────────────────── */

export interface CalendarDay {
  date: string;
  entries: ExpiryEntry[];
  holidays: CalendarHoliday[];
  /** The server's days-to-expiry for a date with expiries; null on a holiday-only date. */
  daysToExpiry: number | null;
}

/** The calm markers a grid cell carries: one dot per expiry kind, a tint for a holiday. */
export interface DayMarks {
  index: boolean;
  stocks: boolean;
  commodity: boolean;
  /** An exchange (any session) is closed. */
  market: boolean;
  /** A gazetted public holiday. */
  public: boolean;
}

export function dayMarks(day: CalendarDay | undefined): DayMarks {
  const entries = day?.entries ?? [];
  const holidays = day?.holidays ?? [];
  return {
    index: entries.some((e) => e.kind === 'index'),
    stocks: entries.some((e) => e.kind === 'stocks'),
    commodity: entries.some((e) => e.kind === 'commodity'),
    market: holidays.some((h) => h.kind === 'market'),
    public: holidays.some((h) => h.kind === 'public'),
  };
}

export interface MonthView {
  /** Every date with something on it after filtering. */
  byDate: Map<string, CalendarDay>;
  /** The agenda: dates with an expiry or a holiday, plus the selected date, ascending. */
  agenda: CalendarDay[];
  expiryCount: number;
  holidayCount: number;
}

export function buildMonthView(
  cal: Pick<ExpiryCalendar, 'month' | 'days' | 'holidays'>,
  filters: CalendarFilters,
  selectedDate: string | null,
): MonthView {
  const byDate = new Map<string, CalendarDay>();
  const dayOf = (date: string): CalendarDay => {
    let day = byDate.get(date);
    if (!day) {
      day = { date, entries: [], holidays: [], daysToExpiry: null };
      byDate.set(date, day);
    }
    return day;
  };
  let expiryCount = 0;
  let holidayCount = 0;
  for (const d of cal.days) {
    const entries = d.entries.filter((e) => matchesEntry(e, filters));
    if (!entries.length) continue;
    const day = dayOf(d.date);
    day.entries = entries;
    day.daysToExpiry = d.daysToExpiry;
    expiryCount += entries.length;
  }
  for (const h of cal.holidays) {
    if (!matchesHoliday(h, filters)) continue;
    dayOf(h.date).holidays.push(h);
    holidayCount += 1;
  }
  const agenda = [...byDate.values()];
  if (selectedDate && selectedDate.startsWith(`${cal.month}-`) && !byDate.has(selectedDate)) {
    agenda.push({ date: selectedDate, entries: [], holidays: [], daysToExpiry: null });
  }
  agenda.sort((a, b) => a.date.localeCompare(b.date));
  return { byDate, agenda, expiryCount, holidayCount };
}

/** The published sources for the month's year; empty when the year has no official list yet. */
export function sourcesForMonth(sources: readonly HolidaySource[], month: string): HolidaySource[] {
  const year = Number(month.slice(0, 4));
  return sources.filter((s) => s.year === year);
}

/* ── Normalizer ───────────────────────────────────────────────────────────────────────── */

type Raw = Record<string, unknown>;
const isObj = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE_RE.test(v);

const KINDS: readonly ExpiryEntry['kind'][] = ['index', 'stocks', 'commodity'];
const EXCHANGES: readonly ExpiryEntry['exchange'][] = ['NFO', 'BFO', 'MCX'];
const MARKETS: readonly HolidayMarket[] = ['NSE', 'BSE', 'MCX'];
const SESSIONS: readonly NonNullable<CalendarHoliday['session']>[] = [
  'full-day',
  'morning',
  'evening',
];

function toEntry(v: unknown): ExpiryEntry | null {
  if (!isObj(v)) return null;
  const kind = KINDS.find((k) => k === v.kind);
  const exchange = EXCHANGES.find((e) => e === v.exchange);
  const label = str(v.label);
  if (!kind || !exchange || !label) return null;
  return {
    kind,
    exchange,
    underlying: str(v.underlying),
    label,
    count: Math.max(0, num(v.count) ?? 0),
    hasOptions: v.hasOptions === true,
    hasFutures: v.hasFutures === true,
  };
}

function toHoliday(v: unknown): CalendarHoliday | null {
  if (!isObj(v) || !isDate(v.date)) return null;
  const name = str(v.name);
  const kind = v.kind === 'public' || v.kind === 'market' ? v.kind : null;
  if (!name || !kind) return null;
  const markets = Array.isArray(v.markets)
    ? MARKETS.filter((m) => (v.markets as unknown[]).includes(m))
    : [];
  // A trading holiday that names no market says nothing a filter could place — dropped.
  if (kind === 'market' && markets.length === 0) return null;
  return {
    date: v.date,
    name,
    kind,
    markets: kind === 'public' ? [] : markets,
    session: kind === 'public' ? null : (SESSIONS.find((s) => s === v.session) ?? 'full-day'),
    note: str(v.note),
  };
}

/**
 * The calendar response, parsed defensively for `month`. Anything malformed is dropped, not
 * guessed; days and holidays outside the month are dropped too — an older server ignores
 * `?month=` and answers its 45-day window, which must not paint next month's expiries here.
 */
export function normalizeExpiryCalendar(raw: unknown, month: string): ExpiryCalendar {
  const data = isObj(raw) ? raw : {};
  const inMonth = (date: string) => date.startsWith(`${month}-`);
  const days: ExpiryDay[] = (Array.isArray(data.days) ? data.days : [])
    .map((d): ExpiryDay | null => {
      if (!isObj(d) || !isDate(d.date) || !inMonth(d.date)) return null;
      const entries = (Array.isArray(d.entries) ? d.entries : [])
        .map(toEntry)
        .filter((e): e is ExpiryEntry => e !== null);
      return entries.length
        ? { date: d.date, daysToExpiry: num(d.daysToExpiry) ?? 0, entries }
        : null;
    })
    .filter((d): d is ExpiryDay => d !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const holidays = (Array.isArray(data.holidays) ? data.holidays : [])
    .map(toHoliday)
    .filter((h): h is CalendarHoliday => h !== null && inMonth(h.date));
  const holidaySources = (Array.isArray(data.holidaySources) ? data.holidaySources : [])
    .map((s): HolidaySource | null => {
      if (!isObj(s)) return null;
      const label = str(s.label);
      const url = str(s.url);
      const year = num(s.year);
      return label && url && /^https:\/\//.test(url) && year != null ? { label, url, year } : null;
    })
    .filter((s): s is HolidaySource => s !== null);
  return {
    month,
    days,
    holidays,
    holidaySources,
    asOf: str(data.asOf) ?? new Date().toISOString(),
  };
}
