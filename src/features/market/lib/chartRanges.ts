import type { ChartPoint } from '@/components/market/PriceChart';

import type { Candle } from '../types';

export type ChartRange = '1D' | '1W' | '1M' | '1Y' | '5Y';

export const CHART_RANGES: readonly { key: ChartRange; label: string }[] = [
  { key: '1D', label: '1D' },
  { key: '1W', label: '1W' },
  { key: '1M', label: '1M' },
  { key: '1Y', label: '1Y' },
  { key: '5Y', label: '5Y' },
];

/**
 * Range → candle request. The server resamples (weekly bars from daily), returns the latest
 * `count` bars, and rate-limits candles to 30/min — so each range is one request, cached.
 * 1Y is exactly what the technical summary needs (250 daily bars ⊇ the 200-DMA), so the
 * Analysis tab shares its cache entry instead of making a second call.
 */
export const RANGE_REQUEST: Record<
  ChartRange,
  { minutesPerBar: number; count: number; staleMs: number }
> = {
  '1D': { minutesPerBar: 5, count: 80, staleMs: 60_000 },
  '1W': { minutesPerBar: 30, count: 70, staleMs: 5 * 60_000 },
  '1M': { minutesPerBar: 60, count: 160, staleMs: 10 * 60_000 },
  '1Y': { minutesPerBar: 1440, count: 250, staleMs: 30 * 60_000 },
  '5Y': { minutesPerBar: 10080, count: 260, staleMs: 60 * 60_000 },
};

const IST_OFFSET_SECONDS = 19_800;

function istDay(unixSeconds: number): number {
  return Math.floor((unixSeconds + IST_OFFSET_SECONDS) / 86_400);
}

/** 1D keeps only the latest IST session — the server returns bars regardless of date. */
export function candlesToPoints(candles: readonly Candle[], range: ChartRange): ChartPoint[] {
  let bars = candles;
  if (range === '1D' && candles.length > 0) {
    const lastDay = istDay(candles[candles.length - 1]!.time);
    bars = candles.filter((candle) => istDay(candle.time) === lastDay);
  }
  return bars
    .filter((candle) => Number.isFinite(candle.close))
    .map((candle) => ({ time: candle.time * 1000, value: candle.close }));
}

const POINT_FORMATS: Record<ChartRange, Intl.DateTimeFormatOptions> = {
  '1D': { hour: 'numeric', minute: '2-digit' },
  '1W': { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' },
  '1M': { day: 'numeric', month: 'short' },
  '1Y': { day: 'numeric', month: 'short', year: 'numeric' },
  '5Y': { day: 'numeric', month: 'short', year: 'numeric' },
};

/**
 * Scrub label for a point, in IST. Shifted by the fixed +05:30 offset and formatted as
 * UTC (India has no DST), so it doesn't depend on the device's time-zone database.
 */
export function formatPointTime(timeMs: number, range: ChartRange): string {
  return new Intl.DateTimeFormat('en-IN', { ...POINT_FORMATS[range], timeZone: 'UTC' }).format(
    new Date(timeMs + IST_OFFSET_SECONDS * 1000),
  );
}
