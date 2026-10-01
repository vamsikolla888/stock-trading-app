import type { Candle } from '@/features/market/types';

/**
 * Keeping a chart's LATEST candle live: every streamed price folds into the last bar, and when the
 * bar's interval runs out a new bar opens at that price — between the server's refreshes, which
 * only ever deliver bars as they stood when fetched. Ported from the web client
 * (features/fno/lib/liveCandles.ts) so both draw the same forming candle.
 */

const IST_OFFSET_S = 330 * 60;
const istDay = (sec: number) => Math.floor((sec + IST_OFFSET_S) / 86_400);

/**
 * One price folded into a series. Inside the last bar's window: close moves, high/low widen.
 * Past it: a new bar starts on the series' own grid, opening at that price — except across a
 * session boundary for intraday bars (a print after the close, or tomorrow's first, must not
 * extend today's chart). Returns the SAME array when nothing changed, so a chart need not redraw.
 */
export function applyLiveTick(
  bars: readonly Candle[],
  ltp: number,
  nowSec: number,
  bucketSec: number,
): readonly Candle[] {
  if (bars.length === 0 || !(ltp > 0) || !Number.isFinite(ltp) || !(bucketSec > 0)) return bars;
  const last = bars[bars.length - 1]!;
  if (nowSec < last.time) return bars; // clock skew: never rewrite an older bar with a newer price
  if (nowSec < last.time + bucketSec) {
    const high = Math.max(last.high, ltp);
    const low = Math.min(last.low, ltp);
    if (last.close === ltp && last.high === high && last.low === low) return bars;
    return [...bars.slice(0, -1), { ...last, close: ltp, high, low }];
  }
  const start = last.time + Math.floor((nowSec - last.time) / bucketSec) * bucketSec;
  if (bucketSec < 86_400 && istDay(start) !== istDay(last.time)) return bars;
  return [...bars, { time: start, open: ltp, high: ltp, low: ltp, close: ltp, volume: 0 }];
}

/**
 * A server refresh against the bars already live on screen: the server's series is the truth for
 * history, but its last bar is a snapshot — the extremes ticks reached since stay, and bars opened
 * live after its snapshot are kept until the server has them.
 */
export function reconcileBars(
  server: readonly Candle[],
  live: readonly Candle[],
): readonly Candle[] {
  if (server.length === 0 || live.length === 0) return server;
  const lastServer = server[server.length - 1]!;
  const same = live.find((bar) => bar.time === lastServer.time);
  const merged = same
    ? {
        ...lastServer,
        high: Math.max(lastServer.high, same.high),
        low: Math.min(lastServer.low, same.low),
      }
    : lastServer;
  const newer = live.filter((bar) => bar.time > lastServer.time);
  return [...server.slice(0, -1), merged, ...newer];
}

/**
 * The stateful part, as a tiny external store (read with useSyncExternalStore): a forming candle
 * must REMEMBER its open and the extremes ticks reached, which no re-derivation from "server bars
 * + current price" can. `seriesKey` names what the bars are (instrument + interval); when it
 * changes the live tail is dropped, never reconciled — two series share timestamps (15m and 1h at
 * 09:15), and merging their extremes would draw one range on the other.
 */
export class LiveCandleSeries {
  private bars: readonly Candle[];
  private key: string;
  private lastTick: { ltp: number; bucketSec: number } | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(bars: readonly Candle[], seriesKey: string) {
    this.bars = bars;
    this.key = seriesKey;
  }

  readonly getBars = (): readonly Candle[] => this.bars;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** New history from the server. The last live price is re-applied on top. */
  setHistory(server: readonly Candle[], seriesKey: string, nowSec: number): void {
    const sameSeries = seriesKey === this.key;
    this.key = seriesKey;
    if (!sameSeries) this.lastTick = null;
    let next = sameSeries ? reconcileBars(server, this.bars) : server;
    if (this.lastTick) {
      next = applyLiveTick(next, this.lastTick.ltp, nowSec, this.lastTick.bucketSec);
    }
    this.set(next);
  }

  /** A live price; null stops folding (market closed, feed off). */
  tick(ltp: number | null, nowSec: number, bucketSec: number): void {
    if (ltp === null) {
      this.lastTick = null;
      return;
    }
    this.lastTick = { ltp, bucketSec };
    this.set(applyLiveTick(this.bars, ltp, nowSec, bucketSec));
  }

  private set(next: readonly Candle[]): void {
    if (next === this.bars) return;
    this.bars = next;
    this.listeners.forEach((listener) => listener());
  }
}
