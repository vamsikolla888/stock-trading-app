import type { IndexQuote } from '@/features/market/types';

/**
 * An index's move since the previous close, in points and percent. Derived from
 * ltp/prevClose when both are present, so the two numbers always agree with the level
 * on screen; the feed's own change fields are the fallback.
 */
export function indexChange(index: IndexQuote): { points: number | null; pct: number | null } {
  const { ltp, prevClose } = index;
  if (
    typeof ltp === 'number' &&
    Number.isFinite(ltp) &&
    typeof prevClose === 'number' &&
    Number.isFinite(prevClose) &&
    prevClose > 0
  ) {
    const points = ltp - prevClose;
    return { points, pct: (points / prevClose) * 100 };
  }
  return { points: index.change ?? null, pct: index.changePct ?? null };
}
