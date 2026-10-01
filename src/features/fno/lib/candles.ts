import type { Candle } from '@/features/market/types';

import type { FnoCandle, FnoCandleInterval, FnoChain, FnoContract, FnoFutures } from '../types';

import { dateTimeIst, dayHeading, expiryLabel, formatStrike, todayIst } from './format';

/**
 * The option-chain price chart (the web's UnderlyingChartPanel): the underlying by default,
 * the picked contract once one is picked. Pure, so the windowing, the live fold and the
 * anchor choice are pinned by tests rather than by eye.
 */

export interface ChartInterval {
  key: FnoCandleInterval;
  label: string;
  /** Look-back per request — inside the server's per-interval cap (fno.dto CANDLE_MAX_DAYS). */
  days: number;
  /** Bar length. */
  seconds: number;
  intraday: boolean;
}

/** Same intervals and look-backs as the web chart. */
export const CHART_INTERVALS: readonly ChartInterval[] = [
  { key: '1minute', label: '1m', days: 2, seconds: 60, intraday: true },
  { key: '5minute', label: '5m', days: 5, seconds: 300, intraday: true },
  { key: '15minute', label: '15m', days: 20, seconds: 900, intraday: true },
  { key: '1hour', label: '1H', days: 60, seconds: 3_600, intraday: true },
  { key: '1day', label: '1D', days: 180, seconds: 86_400, intraday: false },
];

export const DEFAULT_CHART_INTERVAL: FnoCandleInterval = '5minute';

/**
 * Bars drawn at most. A phone is ~350 pt wide: 120 bars keeps each candle about 3 pt — still
 * readable, and a light SVG. Two days of 1-minute bars (~750) would be sub-pixel slivers.
 */
export const MAX_CHART_BARS = 120;

export function chartInterval(key: FnoCandleInterval): ChartInterval {
  return CHART_INTERVALS.find((i) => i.key === key) ?? CHART_INTERVALS[1]!;
}

/** The request window ending now, epoch seconds. Computed per fetch, so a refetch reaches new bars. */
export function candleWindow(
  key: FnoCandleInterval,
  nowMs: number = Date.now(),
): { from: number; to: number } {
  const to = Math.floor(nowMs / 1000);
  return { from: to - chartInterval(key).days * 86_400, to };
}

const isPrice = (v: number) => Number.isFinite(v) && v > 0;

/** Server bars → the chart's candles: the latest `max`, unknown volume as 0, malformed bars dropped. */
export function toChartCandles(bars: readonly FnoCandle[], max: number = MAX_CHART_BARS): Candle[] {
  const out: Candle[] = [];
  for (const b of bars) {
    if (!Number.isFinite(b.time) || ![b.open, b.high, b.low, b.close].every(isPrice)) continue;
    out.push({
      time: b.time,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume != null && b.volume > 0 ? b.volume : 0,
    });
  }
  return out.slice(-max);
}

/**
 * The polled price folded into the bar it belongs to: inside the last bar's window its close
 * moves to `ltp` and its high/low widen to include it. A price past that window is NOT opened
 * as a new bar here — the next candles refetch brings the real one; a bar invented between
 * polls would lose its true open on the next poll. Returns the same array when nothing
 * changes, so a memoised chart does not redraw.
 */
export function foldLivePrice(
  candles: Candle[],
  ltp: number | null,
  nowSec: number,
  barSeconds: number,
): Candle[] {
  if (candles.length === 0 || ltp == null || !isPrice(ltp)) return candles;
  const last = candles[candles.length - 1]!;
  if (nowSec < last.time || nowSec >= last.time + barSeconds) return candles;
  const high = Math.max(last.high, ltp);
  const low = Math.min(last.low, ltp);
  if (last.close === ltp && last.high === high && last.low === low) return candles;
  return [...candles.slice(0, -1), { ...last, close: ltp, high, low }];
}

/**
 * The listed contract that names the underlying to the candles API (an underlying is charted
 * through one of its derivatives). Options: the ATM call, else the ATM put, else any listed
 * leg, else the nearest future; futures: the nearest future. Same order as the web.
 */
export function chartAnchor(
  tab: 'options' | 'futures',
  chain: Pick<FnoChain, 'rows' | 'atmStrike'> | null | undefined,
  futures: Pick<FnoFutures, 'futures'> | null | undefined,
): FnoContract | null {
  const nearestFuture = futures?.futures[0]?.contract ?? null;
  if (tab === 'futures') return nearestFuture;
  const rows = chain?.rows ?? [];
  const atm = chain?.atmStrike != null ? rows.find((r) => r.strike === chain.atmStrike) : undefined;
  const listed = rows.find((r) => r.call?.contract || r.put?.contract);
  return (
    atm?.call?.contract ??
    atm?.put?.contract ??
    listed?.call?.contract ??
    listed?.put?.contract ??
    nearestFuture
  );
}

/** "25,100 CE" / "06 Oct Fut" — a picked contract, short enough for a chip. */
export function contractChipLabel(c: Pick<FnoContract, 'kind' | 'strike' | 'expiry'>): string {
  if (c.kind === 'FUT') return `${expiryLabel(c.expiry)} Fut`;
  return `${c.strike != null ? formatStrike(c.strike) : ''} ${c.kind}`.trim();
}

/** "01 Oct, 10:35" for an intraday bar, "Thu, 01 Oct 2026" for a daily one (IST). */
export function barTimeLabel(timeSec: number, intraday: boolean): string {
  const ms = timeSec * 1000;
  return intraday ? dateTimeIst(ms) : dayHeading(todayIst(ms));
}
