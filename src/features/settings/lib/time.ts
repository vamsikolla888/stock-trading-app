/**
 * Date and duration labels for the settings, automations and admin screens. Server
 * timestamps are ISO strings; everything is shown in IST (the market's clock), with an
 * em dash for anything missing or unparseable — never "Invalid Date".
 */

const EMPTY = '—';
const TIME_ZONE = 'Asia/Kolkata';

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, ...options });
    formatters.set(key, cached);
  }
  return cached;
}

function toTime(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/** "26 Sept, 14:05" */
export function formatDateTime(iso: string | null | undefined): string {
  const ms = toTime(iso);
  if (ms === null) return EMPTY;
  return formatter('datetime', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(ms);
}

/** "26 Sept 2026" */
export function formatDate(iso: string | null | undefined): string {
  const ms = toTime(iso);
  if (ms === null) return EMPTY;
  return formatter('date', { day: 'numeric', month: 'short', year: 'numeric' }).format(ms);
}

/** "14:05:09" */
export function formatClock(value: string | number | null | undefined): string {
  const ms = typeof value === 'number' ? value : toTime(value);
  if (ms === null || !Number.isFinite(ms)) return EMPTY;
  return formatter('clock', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(ms);
}

/**
 * Short past-relative label — "just now", "3m ago", "2h ago", "5d ago" — then the date.
 * `now` is passed in (from useNow on screens) so rendering stays pure and ticks on its own.
 */
export function relativeTime(iso: string | null | undefined, now: number): string {
  const ms = toTime(iso);
  if (ms === null) return EMPTY;
  const diff = now - ms;
  if (diff < 0) return formatDateTime(iso);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDateTime(iso);
}

/** "in 3 h" / "in 12 min" / "40 min ago" — for expiries and next runs either side of now. */
export function relativeToNow(iso: string | null | undefined, now: number): string {
  const ms = toTime(iso);
  if (ms === null) return EMPTY;
  const diff = ms - now;
  const abs = Math.abs(diff);
  const text =
    abs >= 3_600_000
      ? `${Math.round(abs / 3_600_000)} h`
      : `${Math.max(1, Math.round(abs / 60_000))} min`;
  return diff >= 0 ? `in ${text}` : `${text} ago`;
}

/**
 * Elapsed time between two stamps: "850ms", "4.2s", "3m 5s". An open-ended span runs to
 * `now` when one is given, and is unknown (a dash) when it isn't.
 */
export function durationBetween(
  startIso: string | null | undefined,
  endIso: string | null | undefined,
  now?: number,
): string {
  const start = toTime(startIso);
  if (start === null) return EMPTY;
  const end = endIso ? toTime(endIso) : (now ?? null);
  if (end === null) return EMPTY;
  const ms = end - start;
  if (!Number.isFinite(ms) || ms < 0) return EMPTY;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
