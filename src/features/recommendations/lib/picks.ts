import type { Recommendation, RecommendationReview } from '@/features/insights/types';

export type PickSource = 'news' | 'historical';

export const SOURCE_LABEL: Record<PickSource, string> = {
  news: 'News',
  historical: 'Pre-market',
};

/** Picks without a `source` predate the field and came from the news funnel. */
export function sourceOf(pick: Pick<Recommendation, 'source'>): PickSource {
  return pick.source === 'historical' ? 'historical' : 'news';
}

export function countBySource(picks: readonly Pick<Recommendation, 'source'>[]) {
  let news = 0;
  let historical = 0;
  for (const pick of picks) {
    if (sourceOf(pick) === 'historical') historical += 1;
    else news += 1;
  }
  return { news, historical };
}

/**
 * Where the price sits between stop (0) and target (100) — the pick's progress. Null when a
 * level is missing or the levels are inverted, so nothing is drawn rather than a guess.
 */
export function levelProgress(
  price: number | null | undefined,
  stop: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (price == null || stop == null || target == null) return null;
  if (![price, stop, target].every(Number.isFinite) || target <= stop) return null;
  const pct = ((price - stop) / (target - stop)) * 100;
  return Math.min(100, Math.max(0, pct));
}

/** Upside from the price to the target, in percent; null when either is unknown. */
export function upsidePct(
  price: number | null | undefined,
  target: number | null | undefined,
): number | null {
  if (price == null || target == null || !(price > 0) || !Number.isFinite(target)) return null;
  return ((target - price) / price) * 100;
}

/** The engine's own setup-score band, as a word (never a probability). */
export function scoreWord(conf: number): 'High' | 'Good' | 'Fair' {
  if (conf >= 85) return 'High';
  if (conf >= 75) return 'Good';
  return 'Fair';
}

export function reviewFor(
  reviews: readonly RecommendationReview[] | undefined,
  pick: Pick<Recommendation, 'sym' | 'exch'>,
): RecommendationReview | undefined {
  return reviews?.find((review) => review.symbol === pick.sym && review.exchange === pick.exch);
}

export const VERDICT: Record<
  RecommendationReview['verdict'],
  { label: string; tone: 'success' | 'warning' | 'danger' }
> = {
  CONFIRM: { label: 'Cross-check: confirmed', tone: 'success' },
  TRIM: { label: 'Cross-check: size down', tone: 'warning' },
  DROP: { label: 'Cross-check: dropped', tone: 'danger' },
};

/** The last `count` finite closes of a candle series, oldest first — a card's sparkline. */
export function recentCloses(
  candles: readonly { close: number }[] | null | undefined,
  count = 24,
): number[] {
  if (!candles) return [];
  return candles
    .map((candle) => candle.close)
    .filter((close) => typeof close === 'number' && Number.isFinite(close))
    .slice(-count);
}
