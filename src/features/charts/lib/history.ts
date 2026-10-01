import type { Candle } from '@/features/market/types';

const valid = (bar: Candle) =>
  Number.isFinite(bar.time) &&
  bar.open > 0 &&
  bar.high > 0 &&
  bar.low > 0 &&
  bar.close > 0 &&
  Number.isFinite(bar.volume);

/** Pages (newest first) → one ascending series, de-duplicated where pages meet. */
export function mergeHistory(pages: readonly (readonly Candle[])[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (let p = pages.length - 1; p >= 0; p--) {
    for (const bar of pages[p]!) if (valid(bar)) byTime.set(bar.time, bar);
  }
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}
