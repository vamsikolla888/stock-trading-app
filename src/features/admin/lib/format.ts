import type { StatusTone } from '@/features/settings/lib/status';
import { EMPTY_VALUE, formatNumber } from '@/lib/utils/formatters';

// Number labels for the ops panels. A missing measurement is always a dash, never 0 —
// "0ms" would claim an instant response that was never measured.

function isNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** 84 → "84ms", 1840 → "1.84s". */
export function formatMs(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${Math.round(value)}ms`;
}

/** 1536 → "2 KB", 5_242_880 → "5.0 MB". */
export function formatBytes(value: number | null | undefined): string {
  if (!isNumber(value) || value < 0) return EMPTY_VALUE;
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(2)} GB`;
  if (value >= 1024 ** 2) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  if (value >= 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${value} B`;
}

/** Whole counts with Indian grouping. */
export function formatCount(value: number | null | undefined): string {
  return formatNumber(value, 0);
}

/** Tokens and other large machine counts: 1_234_567 → "1.23M", 45_600 → "45.6k". */
export function formatTokens(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(Math.round(value));
}

/** 45 → "45s", 3700 → "1h 1m", 200000 → "2d 7h". */
export function formatUptime(seconds: number | null | undefined): string {
  if (!isNumber(seconds) || seconds < 0) return EMPTY_VALUE;
  if (seconds >= 86_400)
    return `${Math.floor(seconds / 86_400)}d ${Math.floor((seconds % 86_400) / 3600)}h`;
  if (seconds >= 3600)
    return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`;
  return `${Math.round(seconds)}s`;
}

/**
 * Throughput in whichever unit reads as a real number: a fixed "/s" shows most internal
 * traffic as "0.00/s", which looks like no traffic rather than a low rate.
 */
export function formatRate(perSecond: number | null | undefined): { value: string; unit: string } {
  if (!isNumber(perSecond) || perSecond <= 0) return { value: EMPTY_VALUE, unit: 'no traffic' };
  if (perSecond >= 1) return { value: perSecond.toFixed(2), unit: 'req/sec' };
  const perMinute = perSecond * 60;
  if (perMinute >= 1) return { value: perMinute.toFixed(1), unit: 'req/min' };
  return { value: (perSecond * 3600).toFixed(1), unit: 'req/hour' };
}

/** Percent with more digits near 100, where the difference matters (99.95 vs 99.5). */
export function formatUptimePct(value: number | null | undefined): string {
  if (!isNumber(value)) return EMPTY_VALUE;
  return `${value.toFixed(value >= 99.95 ? 3 : 2)}%`;
}

/** Uptime → tone: green at three nines, amber above 95%, red below; unknown is grey. */
export function uptimeTone(value: number | null | undefined): StatusTone {
  if (!isNumber(value)) return 'neutral';
  if (value >= 99.9) return 'ok';
  if (value >= 95) return 'warn';
  return 'bad';
}

/** One history bucket → tone. An unsampled bucket is a visible gap, not green. */
export function bucketTone(uptimePct: number | null, checks: number): StatusTone {
  if (checks === 0 || uptimePct === null) return 'neutral';
  if (uptimePct >= 99.9) return 'ok';
  if (uptimePct >= 50) return 'warn';
  return 'bad';
}

// Built on first use and reused: a chart labels every bar on each 30s refresh, and
// constructing an Intl.DateTimeFormat is slow on Hermes (a 90-day report has hundreds of bars).
const bucketFormats: Partial<Record<'hour' | 'day', Intl.DateTimeFormat>> = {};

function bucketFormat(bucket: 'hour' | 'day'): Intl.DateTimeFormat {
  const unit = bucket === 'hour' ? 'hour' : 'day';
  const format =
    bucketFormats[unit] ??
    new Intl.DateTimeFormat(
      'en-IN',
      unit === 'hour'
        ? { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }
        : { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' },
    );
  bucketFormats[unit] = format;
  return format;
}

/** Axis label for an hourly or daily bucket, in IST. */
export function bucketLabel(iso: string, bucket: 'hour' | 'day'): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  return bucketFormat(bucket).format(ms);
}

// ── Log levels (pino numeric levels) ──────────────────────────────────────────────────

export const LOG_LEVELS: readonly { value: number; label: string; tone: StatusTone }[] = [
  { value: 10, label: 'trace', tone: 'neutral' },
  { value: 20, label: 'debug', tone: 'neutral' },
  { value: 30, label: 'info', tone: 'info' },
  { value: 40, label: 'warn', tone: 'warn' },
  { value: 50, label: 'error', tone: 'bad' },
  { value: 60, label: 'fatal', tone: 'bad' },
];

/** Rounded DOWN to the nearest known level — a custom 35 is closer to "info" than "unknown". */
function levelEntry(level: number) {
  return [...LOG_LEVELS].reverse().find((entry) => level >= entry.value);
}

export function logLevelLabel(level: number): string {
  return levelEntry(level)?.label ?? String(level);
}

export function logLevelTone(level: number): StatusTone {
  return levelEntry(level)?.tone ?? 'neutral';
}
