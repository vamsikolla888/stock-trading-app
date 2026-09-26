import {
  EMPTY_VALUE,
  formatCompactNumber,
  formatNumber,
  formatPercent,
} from '@/lib/utils/formatters';

/**
 * Formatting shared by the F&O screens (live and paper). Centralised because each of these
 * has a wrong answer that looks plausible: an IV shown as "0.17%" instead of "17.2%", a null
 * greek shown as "0.00", an expiry drifting a day because of the device's time zone. Dates
 * are computed in IST arithmetic, never with the device's locale or zone.
 */

export const DASH = EMPTY_VALUE;
const MINUS = '−';
const IST_OFFSET_MS = 5.5 * 60 * 60_000;
const DAY_MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const isNum = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v);

/** Implied volatility, fraction → percent. NULL IS NOT ZERO: no IV reproduces the quote. */
export function ivPct(iv: number | null | undefined): string {
  if (!isNum(iv)) return DASH;
  return `${(iv * 100).toFixed(1)}%`;
}

/** A greek to fixed places, or a dash — greeks are null whenever IV is. */
export function greek(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH;
  return v < 0 ? `${MINUS}${Math.abs(v).toFixed(digits)}` : v.toFixed(digits);
}

/** A greek with an explicit sign — delta and theta read for direction as much as size. */
export function signedGreek(v: number | null | undefined, digits = 2): string {
  if (!isNum(v)) return DASH;
  if (v > 0) return `+${v.toFixed(digits)}`;
  if (v < 0) return `${MINUS}${Math.abs(v).toFixed(digits)}`;
  return v.toFixed(digits);
}

function parseIsoDate(iso: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

/** "06 Oct" — an expiry as a trader reads it off a contract. */
export function expiryLabel(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]}`;
}

/** "Tue, 06 Oct 2026" — the expiry calendar's day heading. */
export function dayHeading(iso: string): string {
  const p = parseIsoDate(iso);
  if (!p) return iso;
  const weekday = WEEKDAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
  return `${weekday}, ${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]} ${p.y}`;
}

/** "5d" / "today" / "expired" — days to expiry, short enough for a chip. */
export function dteLabel(days: number | null | undefined): string {
  if (!isNum(days)) return DASH;
  if (days < 0) return 'expired';
  if (days === 0) return 'today';
  return `${days}d`;
}

/** Today's IST calendar date, YYYY-MM-DD. */
export function todayIst(now: number = Date.now()): string {
  return new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Calendar days from today (IST) to an expiry. Only for labelling expiries the user has not
 * selected — the chain carries the server's own `daysToExpiry` for the selected one.
 */
export function daysUntil(iso: string, now: number = Date.now()): number {
  const target = parseIsoDate(iso);
  const today = parseIsoDate(todayIst(now));
  if (!target || !today) return 0;
  const a = Date.UTC(target.y, target.m - 1, target.d);
  const b = Date.UTC(today.y, today.m - 1, today.d);
  return Math.round((a - b) / DAY_MS);
}

function toMs(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** "14:05" (IST), optionally with seconds. */
export function timeIst(value: string | number | null | undefined, seconds = false): string {
  const ms = toMs(value);
  if (ms == null) return DASH;
  const d = new Date(ms + IST_OFFSET_MS);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return seconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
}

/** "26 Sep, 14:05" (IST). */
export function dateTimeIst(value: string | number | null | undefined): string {
  const ms = toMs(value);
  if (ms == null) return DASH;
  const d = new Date(ms + IST_OFFSET_MS);
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]}, ${timeIst(ms)}`;
}

/** Open interest / volume in Indian short form: 12,40,000 → "12.4L". */
export function compactQty(n: number | null | undefined): string {
  return formatCompactNumber(n);
}

/** A strike with Indian grouping, decimals only when the strike has them (2.5, 1,250). */
export function formatStrike(strike: number | null | undefined): string {
  if (!isNum(strike)) return DASH;
  return formatNumber(strike, Number.isInteger(strike) ? 0 : 2);
}

/** An index LEVEL has no rupee sign: 24,815.40. */
export function level(n: number | null | undefined, digits = 2): string {
  return formatNumber(n, digits);
}

/** "+35.60 (0.15%)" — Groww's change line; the sign carries direction, not colour alone. */
export function changeLine(
  change: number | null | undefined,
  pct: number | null | undefined,
): string {
  if (!isNum(change)) {
    if (!isNum(pct)) return DASH;
    const sign = pct > 0 ? '+' : pct < 0 ? MINUS : '';
    return `${sign}${formatPercent(Math.abs(pct))}`;
  }
  const sign = change > 0 ? '+' : change < 0 ? MINUS : '';
  const move = `${sign}${formatNumber(Math.abs(change))}`;
  return isNum(pct) ? `${move} (${formatPercent(Math.abs(pct))})` : move;
}

/** "NIFTY 25,100 CE" / "NIFTY FUT" — how a contract reads on a ticket or a row. */
export function contractTitle(c: {
  underlying: string;
  kind: 'CE' | 'PE' | 'FUT';
  strike: number | null;
}): string {
  if (c.kind === 'FUT') return `${c.underlying} FUT`;
  return `${c.underlying} ${c.strike != null ? formatStrike(c.strike) : ''} ${c.kind}`
    .replace(/\s+/g, ' ')
    .trim();
}

/** "NIFTY 29 Sep Fut" — how Groww titles a future. */
export function futureTitle(label: string, expiry: string): string {
  return `${label} ${expiryLabel(expiry)} Fut`;
}

/** "NSE" / "BSE" / "MCX" for an F&O exchange code. */
export function venueOf(exchange: string): string {
  if (exchange === 'BFO') return 'BSE';
  if (exchange === 'MCX') return 'MCX';
  return 'NSE';
}

/** "2 lots" / "1 lot". */
export function lotsLabel(lots: number): string {
  return `${lots} lot${Math.abs(lots) === 1 ? '' : 's'}`;
}
