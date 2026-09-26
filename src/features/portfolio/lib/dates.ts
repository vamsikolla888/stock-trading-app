/**
 * Dates for the books (orders, trades, statements) as IST calendar days, whatever the
 * phone's own timezone: a trading day is an exchange concept, and a viewer abroad would
 * otherwise see one session split across two days. Computed by hand from a fixed +5:30
 * offset (India has no DST) rather than through Intl's timeZone option, so the output is
 * identical on every JS engine and in tests.
 */

const IST_OFFSET_MS = 330 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function istDate(ms: number): Date {
  return new Date(ms + IST_OFFSET_MS);
}

/** YYYY-MM-DD of the IST calendar day `offsetDays` before `now`. */
export function istToday(offsetDays = 0, now: number = Date.now()): string {
  return istDate(now - offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** YYYY-MM-DD of the IST calendar day an ISO timestamp falls on; null for a bad input. */
export function istDateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? istDate(ms).toISOString().slice(0, 10) : null;
}

function parseDay(date: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  if (!match) return null;
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

/** "3 Mar 2026" (or "3 Mar" within the current year when `short`). */
export function formatDay(date: string | null | undefined, now: number = Date.now()): string {
  if (!date) return '—';
  const parts = parseDay(date);
  if (!parts) return date;
  const month = MONTHS[parts.m - 1] ?? '';
  const thisYear = Number(istToday(0, now).slice(0, 4));
  return parts.y === thisYear ? `${parts.d} ${month}` : `${parts.d} ${month} ${parts.y}`;
}

/** "Today" / "Yesterday" / "Mon, 3 Mar" for a YYYY-MM-DD trading day. */
export function dayLabel(date: string, now: number = Date.now()): string {
  if (date === istToday(0, now)) return 'Today';
  if (date === istToday(1, now)) return 'Yesterday';
  const parts = parseDay(date);
  if (!parts) return date;
  const weekday = WEEKDAYS[new Date(Date.UTC(parts.y, parts.m - 1, parts.d)).getUTCDay()];
  return `${weekday}, ${formatDay(date, now)}`;
}

/** "2:05 PM" in IST; a dash when unknown. */
export function istTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '—';
  const date = istDate(ms);
  const hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const suffix = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${h12}:${minutes} ${suffix}`;
}

/** "2:05 PM" today, "3 Mar, 2:05 PM" on any other day — for "as of" stamps. */
export function formatAsOf(iso: string | null | undefined, now: number = Date.now()): string {
  const day = istDateOf(iso);
  if (!day) return '—';
  return day === istToday(0, now) ? istTime(iso) : `${formatDay(day, now)}, ${istTime(iso)}`;
}

/** "Mar 26" for a YYYY-MM month key. */
export function monthLabel(month: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return month;
  return `${MONTHS[Number(match[2]) - 1] ?? ''} ${match[1]!.slice(2)}`;
}

/** Epoch ms of UTC midnight for a YYYY-MM-DD day — chart x values. */
export function dayToMs(date: string): number {
  const parts = parseDay(date);
  return parts ? Date.UTC(parts.y, parts.m - 1, parts.d) : Number.NaN;
}

export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${count} ${count === 1 ? word : pluralWord}`;
}
