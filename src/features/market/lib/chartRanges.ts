import type { ChartPoint } from '@/components/market/PriceChart';
import { getErrorMessage, isApiError } from '@/types/api';

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

const isBar = (candle: Candle) =>
  Number.isFinite(candle.time) &&
  Number.isFinite(candle.open) &&
  Number.isFinite(candle.high) &&
  Number.isFinite(candle.low) &&
  Number.isFinite(candle.close);

/**
 * The bars a range draws. 1D keeps only the latest IST session — 80 five-minute bars reach
 * back into the previous day, and the server returns bars regardless of date. Bars with a
 * missing price are dropped so neither chart plots NaN.
 */
export function sessionCandles(candles: readonly Candle[], range: ChartRange): Candle[] {
  const bars = candles.filter(isBar);
  const last = bars[bars.length - 1];
  if (range !== '1D' || !last) return bars;
  const lastDay = istDay(last.time);
  return bars.filter((candle) => istDay(candle.time) === lastDay);
}

export function candlesToPoints(candles: readonly Candle[], range: ChartRange): ChartPoint[] {
  return sessionCandles(candles, range).map((candle) => ({
    time: candle.time * 1000,
    value: candle.close,
  }));
}

/**
 * What a chart says when its history can't be loaded. Candles come through the viewer's own
 * broker or the platform's: "no usable session" (404 / 409 BROKER_SESSION_EXPIRED) is a
 * state to explain, not a server sentence to echo.
 */
export function candlesErrorMessage(error: unknown): string {
  if (
    isApiError(error) &&
    (error.status === 404 || error.code === 'BROKER_SESSION_EXPIRED' || error.status === 409)
  ) {
    return 'Price history needs a live broker session, and none is available right now.';
  }
  return getErrorMessage(error, 'Price history couldn’t be loaded. Pull down to try again.');
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
  // Intl throws a RangeError on an invalid date rather than printing anything.
  if (!Number.isFinite(timeMs)) return '';
  return new Intl.DateTimeFormat('en-IN', { ...POINT_FORMATS[range], timeZone: 'UTC' }).format(
    new Date(timeMs + IST_OFFSET_SECONDS * 1000),
  );
}
