import type { Candle } from '@/features/market/types';

/**
 * Deciding the cheapest correct message for the chart page (TradingChart → web/bridge.js):
 *   - 'tick'  only the forming bar changed, or exactly one new bar opened after it — each series
 *             updates its last point;
 *   - 'data' with `prepended` > 0 — older history arrived on the left; redraw, keep the view;
 *   - 'data' otherwise — a different series or settings: redraw in full.
 */

/** What the chart page was last sent. */
export interface SentSeries {
  seriesKey: string;
  config: string;
  bars: readonly Candle[];
}

/** How `next` relates to what the page already has — the cheapest correct message. */
export function classifyUpdate(
  prev: SentSeries | null,
  next: SentSeries,
): { kind: 'tick'; appended: boolean } | { kind: 'data'; prepended: number } {
  if (!prev || prev.seriesKey !== next.seriesKey || prev.config !== next.config) {
    return { kind: 'data', prepended: 0 };
  }
  const a = prev.bars;
  const b = next.bars;
  if (a.length === 0 || b.length === 0) return { kind: 'data', prepended: 0 };
  const aFirst = a[0]!.time;
  const aLast = a[a.length - 1]!.time;
  const bFirst = b[0]!.time;
  const bLast = b[b.length - 1]!.time;
  if (bFirst === aFirst && b.length === a.length && bLast === aLast) {
    return { kind: 'tick', appended: false };
  }
  if (bFirst === aFirst && b.length === a.length + 1 && b[b.length - 2]!.time === aLast) {
    return { kind: 'tick', appended: true };
  }
  if (bFirst < aFirst && bLast >= aLast) {
    const prepended = b.findIndex((bar) => bar.time === aFirst);
    return { kind: 'data', prepended: prepended > 0 ? prepended : 0 };
  }
  return { kind: 'data', prepended: 0 };
}
