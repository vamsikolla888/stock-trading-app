import type { ChartInterval } from '@/features/charts/lib/config';
import type { Candle } from '@/features/market/types';

import type { FnoCandle, FnoCandleInterval, FnoExchange } from '../types';

/**
 * The underlying's own screen — an index or an F&O stock, charted like a trading terminal. Its
 * bars come from the F&O candles API (`target: 'underlying'`), which charts an underlying through
 * any listed contract of it and falls back from Groww to the platform feed server-side. Pure, so
 * the windows, caps and session logic are pinned by tests.
 */

/**
 * The cash/index listing behind each index underlying — the server's GROWW_INDEX_SYMBOLS
 * (brokers/groww/groww-parse.ts). An index without derivatives is not here: there is no contract
 * to chart it through.
 */
const INDEX_UNDERLYINGS: Readonly<Record<string, { exchange: FnoExchange; underlying: string }>> = {
  'NSE:NIFTY 50': { exchange: 'NFO', underlying: 'NIFTY' },
  'NSE:NIFTY BANK': { exchange: 'NFO', underlying: 'BANKNIFTY' },
  'NSE:NIFTY FIN SERVICE': { exchange: 'NFO', underlying: 'FINNIFTY' },
  'NSE:NIFTY MID SELECT': { exchange: 'NFO', underlying: 'MIDCPNIFTY' },
  'BSE:SENSEX': { exchange: 'BFO', underlying: 'SENSEX' },
  'BSE:BANKEX': { exchange: 'BFO', underlying: 'BANKEX' },
};

/** The F&O underlying an index quote stands for, or null when it has no derivatives. */
export function indexUnderlying(
  exchange: string,
  symbol: string,
): { exchange: FnoExchange; underlying: string } | null {
  return INDEX_UNDERLYINGS[`${exchange}:${symbol}`.toUpperCase()] ?? null;
}

/** The server's per-request span for each interval (fno.dto CANDLE_MAX_DAYS). */
export const FNO_MAX_DAYS: Readonly<Record<FnoCandleInterval, number>> = {
  '1minute': 30,
  '3minute': 30,
  '5minute': 30,
  '15minute': 90,
  '30minute': 90,
  '1hour': 180,
  '1day': 180,
  '1week': 180,
};

export type UnderlyingRange = '1D' | '1W' | '1M' | '3M' | '6M' | '1Y';

export interface UnderlyingRangeSpec {
  key: UnderlyingRange;
  label: string;
  interval: FnoCandleInterval;
  /** Calendar days of history the range draws. */
  days: number;
  /** Bar length in seconds — the live fold needs it. */
  barSeconds: number;
  intraday: boolean;
}

/**
 * Groww's ranges, each one request where the cap allows (1Y is two). 1D asks for five days so a
 * Monday — or the morning after a holiday — still has the previous session to measure from.
 */
export const UNDERLYING_RANGES: readonly UnderlyingRangeSpec[] = [
  { key: '1D', label: '1D', interval: '5minute', days: 5, barSeconds: 300, intraday: true },
  { key: '1W', label: '1W', interval: '30minute', days: 7, barSeconds: 1_800, intraday: true },
  { key: '1M', label: '1M', interval: '1hour', days: 31, barSeconds: 3_600, intraday: true },
  { key: '3M', label: '3M', interval: '1day', days: 92, barSeconds: 86_400, intraday: false },
  { key: '6M', label: '6M', interval: '1day', days: 182, barSeconds: 86_400, intraday: false },
  { key: '1Y', label: '1Y', interval: '1day', days: 365, barSeconds: 86_400, intraday: false },
];

export function underlyingRange(key: UnderlyingRange): UnderlyingRangeSpec {
  return UNDERLYING_RANGES.find((r) => r.key === key) ?? UNDERLYING_RANGES[0]!;
}

/**
 * `days` back from `nowSec`, split into windows the server accepts for `interval` — newest first,
 * contiguous, none longer than the cap.
 */
export function candleWindows(
  days: number,
  interval: FnoCandleInterval,
  nowSec: number,
): { from: number; to: number }[] {
  const cap = FNO_MAX_DAYS[interval] * 86_400;
  const start = nowSec - days * 86_400;
  const out: { from: number; to: number }[] = [];
  let to = nowSec;
  while (to > start) {
    const from = Math.max(start, to - cap);
    out.push({ from, to });
    to = from;
  }
  return out;
}

const IST_OFFSET_S = 19_800;
const istDay = (sec: number) => Math.floor((sec + IST_OFFSET_S) / 86_400);

/** API bars → chart candles: ascending, de-duplicated, malformed bars dropped, volume 0 if unknown. */
export function toCandles(pages: readonly (readonly FnoCandle[])[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const page of pages) {
    for (const b of page) {
      if (!Number.isFinite(b.time) || ![b.open, b.high, b.low, b.close].every((v) => v > 0)) {
        continue;
      }
      byTime.set(b.time, {
        time: b.time,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
        volume: b.volume != null && b.volume > 0 ? b.volume : 0,
      });
    }
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

/**
 * Intraday bars split at the last IST session: that session's bars (what 1D draws) and the
 * previous session's last close — the baseline the day's move is measured from, as Groww does.
 */
export function lastSession(bars: readonly Candle[]): {
  session: Candle[];
  prevClose: number | null;
} {
  const last = bars[bars.length - 1];
  if (!last) return { session: [], prevClose: null };
  const day = istDay(last.time);
  const firstToday = bars.findIndex((bar) => istDay(bar.time) === day);
  const prior = firstToday > 0 ? bars[firstToday - 1] : undefined;
  return { session: bars.slice(firstToday), prevClose: prior?.close ?? null };
}

/** The advanced chart's intervals on the F&O candles API, with the span each history page covers. */
export const FNO_CHART_INTERVAL: Readonly<
  Record<ChartInterval, { interval: FnoCandleInterval; pageDays: number }>
> = {
  '1m': { interval: '1minute', pageDays: 4 },
  '3m': { interval: '3minute', pageDays: 8 },
  '5m': { interval: '5minute', pageDays: 12 },
  '15m': { interval: '15minute', pageDays: 30 },
  '30m': { interval: '30minute', pageDays: 60 },
  '1h': { interval: '1hour', pageDays: 120 },
  '1D': { interval: '1day', pageDays: 180 },
  '1W': { interval: '1week', pageDays: 180 },
};
