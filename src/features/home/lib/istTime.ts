/**
 * Clock and calendar formatting in IST, independent of the device's time zone: every
 * instant is shifted by the fixed +05:30 offset (India has no DST) and read back with the
 * UTC getters, so a phone set to any zone prints the market's own time. Formatting is
 * assembled by hand rather than through Intl so the output is identical on every engine.
 */

const IST_OFFSET_MS = 330 * 60_000;
const OPEN_MINUTE = 9 * 60 + 15;
const DAY_MS = 86_400_000;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

type DateInput = string | number | Date | null | undefined;

function toDate(input: DateInput): Date | null {
  if (input === null || input === undefined || input === '') return null;
  const date = input instanceof Date ? input : new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The instant as a Date whose UTC fields read as IST wall-clock fields. */
function istFields(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MS);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "14:05" (24-hour, IST), or null for a missing/invalid time. */
export function formatIstTime(input: DateInput, withSeconds = false): string | null {
  const date = toDate(input);
  if (!date) return null;
  const ist = istFields(date);
  const base = `${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`;
  return withSeconds ? `${base}:${pad(ist.getUTCSeconds())}` : base;
}

/** "26 Sep" (IST), or null. */
export function formatIstDate(input: DateInput): string | null {
  const date = toDate(input);
  if (!date) return null;
  const ist = istFields(date);
  return `${ist.getUTCDate()} ${MONTHS[ist.getUTCMonth()]}`;
}

/** "26 Sep, 14:05" (IST), or null. */
export function formatIstDateTime(input: DateInput): string | null {
  const date = toDate(input);
  if (!date) return null;
  return `${formatIstDate(date)}, ${formatIstTime(date)}`;
}

/** "Mon 09:30" (IST), or null. */
export function formatIstWeekdayTime(input: DateInput): string | null {
  const date = toDate(input);
  if (!date) return null;
  return `${WEEKDAYS[istFields(date).getUTCDay()]} ${formatIstTime(date)}`;
}

/** The IST calendar day as `YYYY-MM-DD`. */
export function istDayKey(input: DateInput): string | null {
  const date = toDate(input);
  if (!date) return null;
  const ist = istFields(date);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** "YYYY-MM-DD" (an IST session day) → "12 Sep"; the input back when it doesn't parse. */
export function formatSessionDay(day: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const month = MONTHS[Number(match[2]) - 1];
  return month ? `${Number(match[3])} ${month}` : day;
}

/**
 * The next 09:15 IST on a weekday. Before 09:15 on a weekday that is today; from 09:15
 * onwards it is the next weekday. Not holiday-aware — no exchange calendar exists
 * client-side, so a holiday reads as the day after it. Callers should say "opens", never
 * promise a date the exchange hasn't confirmed.
 */
export function nextMarketOpen(now: Date = new Date()): Date {
  const ist = istFields(now);
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  let day = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate());
  if (minute >= OPEN_MINUTE) day += DAY_MS;
  for (let guard = 0; guard < 7; guard++) {
    const weekday = new Date(day).getUTCDay();
    if (weekday !== 0 && weekday !== 6) break;
    day += DAY_MS;
  }
  return new Date(day + OPEN_MINUTE * 60_000 - IST_OFFSET_MS);
}

/** "today 09:15", "tomorrow 09:15" or "Mon 09:15" — when the next session opens, in IST. */
export function formatNextOpen(open: Date, now: Date = new Date()): string {
  const openDay = istDayKey(open);
  const time = formatIstTime(open) ?? '09:15';
  if (openDay === istDayKey(now)) return `today ${time}`;
  if (openDay === istDayKey(new Date(now.getTime() + DAY_MS))) return `tomorrow ${time}`;
  return `${WEEKDAYS[istFields(open).getUTCDay()]} ${time}`;
}
