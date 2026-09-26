import { istDayKey } from '@/features/home/lib/istTime';
import type { Candle, StockDetail, StockListing } from '@/features/market/types';

// Adapted from the web client's features/stock-analysis/lib/priceView.ts for a screen fed by
// the polled detail alone (no per-symbol socket on mobile): one set of precedence rules for
// every price figure on the stock page.

/** Zero or negative is the feed's "nothing yet", never a price. */
export function usable(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export interface StockPriceView {
  ltp: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** The IST session (`YYYY-MM-DD`) `volume` belongs to when it isn't today's. */
  volumeSession: string | null;
  yearHigh: number | null;
  yearLow: number | null;
}

export function stockPriceView(
  detail: StockDetail | null | undefined,
  lastDailyBar: Candle | null | undefined,
  todayIst: string,
): StockPriceView {
  const ltp = usable(detail?.ltp);
  const prevClose = usable(detail?.prevClose);

  // Measured from the price and its own previous close so the two numbers always agree;
  // the server's fields only when there is no usable previous close.
  let change: number | null = null;
  let changePct: number | null = null;
  if (ltp !== null && prevClose !== null) {
    change = ltp - prevClose;
    changePct = (change / prevClose) * 100;
  } else if (ltp !== null) {
    change = detail?.changeAbs ?? null;
    changePct = detail?.changePct ?? null;
  }

  // The day's range, stretched to contain the live price: a trade at 912 means the high is
  // at least 912, whatever an older snapshot said.
  const open = usable(detail?.open);
  const baseHigh = usable(detail?.high);
  const baseLow = usable(detail?.low);
  const high = baseHigh !== null ? Math.max(baseHigh, ltp ?? baseHigh) : null;
  const low = baseLow !== null ? Math.min(baseLow, ltp ?? baseLow) : null;

  // Volume: the snapshot's when it was refreshed today (it is kept current for the most
  // traded names), else the latest daily bar labelled with its session. An old snapshot
  // figure must never pose as today's.
  let volume: number | null = null;
  let volumeSession: string | null = null;
  if (usable(detail?.volume) !== null && istDayKey(detail?.volumeAsOf) === todayIst) {
    volume = detail?.volume ?? null;
  } else if (lastDailyBar && usable(lastDailyBar.volume) !== null) {
    volume = lastDailyBar.volume;
    const day = istDayKey(lastDailyBar.time * 1000);
    volumeSession = day === todayIst ? null : day;
  }

  // The server's 52-week range stretched by today's trading.
  const yearlyHigh = usable(detail?.yearlyHigh);
  const yearlyLow = usable(detail?.yearlyLow);
  const yearHigh = yearlyHigh !== null ? Math.max(yearlyHigh, high ?? 0, ltp ?? 0) : null;
  const yearLow =
    yearlyLow !== null
      ? Math.min(yearlyLow, low ?? Number.POSITIVE_INFINITY, ltp ?? Number.POSITIVE_INFINITY)
      : null;

  return {
    ltp,
    prevClose,
    change,
    changePct,
    open,
    high,
    low,
    volume,
    volumeSession,
    yearHigh,
    yearLow,
  };
}

/** Where `value` sits between `low` and `high`, 0–100; null when the range is unusable. */
export function rangePosition(
  low: number | null,
  high: number | null,
  value: number | null,
): number | null {
  if (low === null || high === null || value === null || !(high > low)) return null;
  return Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100));
}

/** Every listing's symbol, this one first, deduplicated — the server takes at most three. */
export function sentimentSymbols(
  symbol: string,
  listings: readonly StockListing[] | undefined,
): string[] {
  return [...new Set([symbol, ...(listings ?? []).map((listing) => listing.symbol)])].slice(0, 3);
}

/** News is tagged with the NSE ticker; a BSE page asks with its NSE twin when there is one. */
export function newsSymbolFor(
  symbol: string,
  exchange: string,
  listings: readonly StockListing[] | undefined,
): string {
  if (exchange === 'NSE') return symbol;
  return listings?.find((listing) => listing.exchange === 'NSE')?.symbol ?? symbol;
}

export type SentimentMood = 'positive' | 'negative' | 'mixed';

/** −1 … +1 net sentiment → how it reads. */
export function sentimentMood(net: number): SentimentMood {
  if (net >= 0.2) return 'positive';
  if (net <= -0.2) return 'negative';
  return 'mixed';
}

export const MOOD_LABEL: Record<SentimentMood, string> = {
  positive: 'Mostly positive',
  negative: 'Mostly negative',
  mixed: 'Mixed',
};

/** "+0.35" / "−0.20" / "0.00". */
export function formatNet(net: number): string {
  const sign = net > 0 ? '+' : net < 0 ? '−' : '';
  return `${sign}${Math.abs(net).toFixed(2)}`;
}

/** Scales RSI (fixed 0–100 axis) into an SVG path across `width` × `height`. */
export function rsiPath(
  values: readonly number[],
  width: number,
  height: number,
  inset = 2,
): string {
  const finite = values.filter((value) => Number.isFinite(value));
  if (finite.length < 2 || width <= 0 || height <= 0) return '';
  const stepX = width / (finite.length - 1);
  const toY = (value: number) =>
    inset + (1 - Math.min(100, Math.max(0, value)) / 100) * (height - inset * 2);
  return finite
    .map(
      (value, index) =>
        `${index === 0 ? 'M' : 'L'}${(index * stepX).toFixed(1)} ${toY(value).toFixed(1)}`,
    )
    .join(' ');
}
