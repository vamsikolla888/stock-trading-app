/**
 * Number formatting for an Indian market app: INR, Indian digit grouping (12,48,360),
 * and percentages expressed in percent units (1.24 means 1.24%, as the API sends them).
 * Every formatter renders missing or non-finite input as an em dash rather than "NaN".
 */

export const EMPTY_VALUE = '—';
/** Typographic minus, as in the design — reads as "minus" to screen readers like "-" does. */
const MINUS = '−';

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormat(
  minimumFractionDigits: number,
  maximumFractionDigits: number,
): Intl.NumberFormat {
  const key = `${minimumFractionDigits}:${maximumFractionDigits}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits, maximumFractionDigits });
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 24815.4 → "24,815.40"; 1248360 → "12,48,360.00". */
export function formatNumber(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return numberFormat(decimals, decimals).format(value);
}

/** 1285.6 → "₹1,285.60"; negative values keep a leading minus: "−₹120.00". */
export function formatINR(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const formatted = `₹${numberFormat(decimals, decimals).format(Math.abs(value))}`;
  return value < 0 ? `${MINUS}${formatted}` : formatted;
}

/** Always signed, for P&L: "+₹18,260.00" / "−₹1,240.50" / "₹0.00". */
export function formatSignedINR(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const formatted = `₹${numberFormat(decimals, decimals).format(Math.abs(value))}`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `${MINUS}${formatted}`;
  return formatted;
}

/** Indian short scale for tight spaces: 1248360 → "₹12.48L", 25600000 → "₹2.56Cr". */
export function formatINRCompact(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs >= 1e7) return `${sign}₹${numberFormat(0, 2).format(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${numberFormat(0, 2).format(abs / 1e5)}L`;
  return `${sign}₹${numberFormat(0, 2).format(abs)}`;
}

/** Percent units in, unsigned out: 1.24 → "1.24%". */
export function formatPercent(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return `${numberFormat(decimals, decimals).format(value)}%`;
}

/** Percent units in, signed out: 1.24 → "+1.24%", -0.41 → "−0.41%". */
export function formatSignedPercent(value: number | null | undefined, decimals = 2): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const formatted = `${numberFormat(decimals, decimals).format(Math.abs(value))}%`;
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `${MINUS}${formatted}`;
  return formatted;
}

/** Whole shares with Indian grouping: 1200 → "1,200". */
export function formatQuantity(value: number | null | undefined): string {
  return formatNumber(value, 0);
}

/** Large counts (volume): 1234567 → "12.35L". */
export function formatCompactNumber(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  const abs = Math.abs(value);
  const sign = value < 0 ? MINUS : '';
  if (abs >= 1e7) return `${sign}${numberFormat(0, 2).format(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}${numberFormat(0, 2).format(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}${numberFormat(0, 1).format(abs / 1e3)}K`;
  return `${sign}${numberFormat(0, 0).format(abs)}`;
}

/** Stand-in shown while the user has hidden their portfolio values. */
export const MASKED_VALUE = '••••••';

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}
