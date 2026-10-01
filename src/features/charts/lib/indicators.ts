import type { Candle } from '@/features/market/types';

/**
 * Technical indicators for the chart — the web client's shared/lib/indicators.ts, line for line,
 * so a study reads the same number on both. One change: VWAP's session boundary is IST arithmetic
 * rather than Intl time zones (not guaranteed on every Hermes build).
 */

/** Simple moving average — null until `period` values have accumulated. */
export function sma(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i]!;
    if (i >= period) sum -= values[i - period]!;
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average, seeded with the SMA of the first `period` values (the conventional
 * seeding — an unseeded EMA drifts for the first few dozen bars). Null until that seed point.
 */
export function ema(values: readonly number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let seed = 0;
  for (let i = 0; i < period; i++) seed += values[i]!;
  seed /= period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** EMA over a series with a leading run of nulls (MACD's own line), re-aligned to its indices. */
function emaSkippingLeadingNulls(values: readonly (number | null)[], period: number) {
  const firstValid = values.findIndex((v) => v != null);
  const out: (number | null)[] = new Array<number | null>(values.length).fill(null);
  if (firstValid === -1) return out;
  const tailEma = ema(values.slice(firstValid) as number[], period);
  for (let i = 0; i < tailEma.length; i++) out[firstValid + i] = tailEma[i]!;
  return out;
}

/**
 * Wilder's RSI — smoothed average gain/loss, as every charting platform computes RSI(14). Null
 * until `period` deltas have accumulated; a flat run reads neutral (50), not a division by zero.
 */
export function rsi(closes: readonly number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  if (closes.length <= period) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    if (delta > 0) avgGain += delta;
    else avgLoss -= delta;
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = rsiFromAverages(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const delta = closes[i]! - closes[i - 1]!;
    avgGain = (avgGain * (period - 1) + (delta > 0 ? delta : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (delta < 0 ? -delta : 0)) / period;
    out[i] = rsiFromAverages(avgGain, avgLoss);
  }
  return out;
}

function rsiFromAverages(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) return 50;
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export interface MacdResult {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
}

/** MACD(12, 26, 9): the fast/slow EMA spread, its own EMA as the signal, and their difference. */
export function macd(
  closes: readonly number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const line = closes.map((_, i) => {
    const f = fast[i];
    const s = slow[i];
    return f != null && s != null ? f - s : null;
  });
  const signal = emaSkippingLeadingNulls(line, signalPeriod);
  const histogram = closes.map((_, i) => {
    const m = line[i];
    const s = signal[i];
    return m != null && s != null ? m - s : null;
  });
  return { macd: line, signal, histogram };
}

export interface BollingerBandsResult {
  upper: (number | null)[];
  middle: (number | null)[];
  lower: (number | null)[];
}

/** Bollinger Bands: the SMA ± k population standard deviations (Bollinger's specification). */
export function bollingerBands(
  closes: readonly number[],
  period = 20,
  stdDevMultiplier = 2,
): BollingerBandsResult {
  const middle = sma(closes, period);
  const upper: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  const lower: (number | null)[] = new Array<number | null>(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const mean = middle[i] as number;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) variance += (closes[j]! - mean) ** 2;
    const stdDev = Math.sqrt(variance / period);
    upper[i] = mean + stdDevMultiplier * stdDev;
    lower[i] = mean - stdDevMultiplier * stdDev;
  }
  return { upper, middle, lower };
}

const IST_OFFSET_S = 330 * 60;

/**
 * Session VWAP — cumulative typical price × volume over cumulative volume, reset at each IST day
 * (a within-session measure). Null while the session's volume is still zero.
 */
export function vwap(candles: readonly Candle[]): (number | null)[] {
  const out: (number | null)[] = new Array<number | null>(candles.length).fill(null);
  let session = Number.NaN;
  let cumPV = 0;
  let cumVolume = 0;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const day = Math.floor((c.time + IST_OFFSET_S) / 86_400);
    if (day !== session) {
      session = day;
      cumPV = 0;
      cumVolume = 0;
    }
    cumPV += ((c.high + c.low + c.close) / 3) * c.volume;
    cumVolume += c.volume;
    out[i] = cumVolume > 0 ? cumPV / cumVolume : null;
  }
  return out;
}

/** Heikin-Ashi candles from regular OHLC; the first bar seeds from its own OHLC. */
export function heikinAshi(candles: readonly Candle[]): Candle[] {
  const out: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i]!;
    const prev = out[i - 1];
    const close = (c.open + c.high + c.low + c.close) / 4;
    const open = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    out.push({
      time: c.time,
      open,
      high: Math.max(c.high, open, close),
      low: Math.min(c.low, open, close),
      close,
      volume: c.volume,
    });
  }
  return out;
}
