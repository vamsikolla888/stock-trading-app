/**
 * IST date helpers for the Intelligence screens. India has no DST, so instants are shifted by
 * the fixed +05:30 offset and formatted as UTC — the same approach as the chart labels
 * (features/market/lib/chartRanges.ts), which keeps them independent of the device's
 * time-zone database.
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60_000;

const formatCache = new Map<string, Intl.DateTimeFormat>();

function formatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let format = formatCache.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' });
    formatCache.set(key, format);
  }
  return format;
}

function toMs(input: string | number | Date | null | undefined): number | null {
  if (input === null || input === undefined || input === '') return null;
  const ms = input instanceof Date ? input.getTime() : new Date(input).getTime();
  return Number.isFinite(ms) ? ms : null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** The IST trading day an instant falls on, as "YYYY-MM-DD"; null for missing/invalid input. */
export function istDayKey(input: string | number | Date | null | undefined): string | null {
  const ms = toMs(input);
  if (ms === null) return null;
  const ist = new Date(ms + IST_OFFSET_MS);
  return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}`;
}

/** Formats an instant (ISO string, epoch ms or Date) in IST. "—" for missing/invalid input. */
export function formatIst(
  input: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions,
): string {
  const ms = toMs(input);
  if (ms === null) return '—';
  return formatter(options).format(new Date(ms + IST_OFFSET_MS));
}

/** 24-hour IST clock time — "14:05". */
export function istClock(input: string | number | Date | null | undefined): string {
  return formatIst(input, { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** "22 Aug, 14:05" in IST. */
export function istDateTime(input: string | number | Date | null | undefined): string {
  return formatIst(input, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

/** A unix-seconds bar time as an IST date — "12 Aug 2025" (or without the year). */
export function barDate(unixSeconds: number | null | undefined, withYear = true): string {
  if (typeof unixSeconds !== 'number' || !Number.isFinite(unixSeconds) || unixSeconds <= 0) {
    return '—';
  }
  return formatIst(unixSeconds * 1000, {
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/**
 * A calendar day key ("2025-08-22") as words. Parsed as that date itself rather than as an
 * instant, so it can never slip to the previous day in a western time zone.
 */
export function formatDayKey(
  dayKey: string | null | undefined,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
): string {
  if (!dayKey || !/^\d{4}-\d{2}-\d{2}$/.test(dayKey)) return dayKey ?? '—';
  const ms = Date.parse(`${dayKey}T00:00:00Z`);
  if (!Number.isFinite(ms)) return dayKey;
  return formatter(options).format(new Date(ms));
}
