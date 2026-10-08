import type { HoldingSummary, PortfolioReview, ReviewAction } from '@/features/agents/types';

/**
 * The AI portfolio review beside a holding, wherever the holding is shown (web:
 * agents/lib/agentsView.ts, "the review beside a holding"). Free of React so each rule is pinned
 * by a test. A verdict is research, never an order.
 */

export interface HoldingReviews {
  index: Map<string, HoldingSummary>;
  data: PortfolioReview | null;
  /** The first answer has not arrived — show nothing rather than "not reviewed". */
  isLoading: boolean;
  /** The review could not be read; marks are left out instead of claiming "not reviewed". */
  isError: boolean;
  /** The server predates the review — the whole thing hides. */
  outdated: boolean;
}

/** What each rating asks of the reader, in plain words — still a research prompt, never an order. */
export const VERDICT_HINT: Record<ReviewAction, string> = {
  CONSIDER_ADD: 'The evidence argues for adding to the position.',
  HOLD: 'The evidence argues for keeping the position as it is.',
  CONSIDER_SELL: 'The evidence argues for a second look at the position size.',
  NEEDS_REVIEW: 'The evidence was not enough for a view.',
};

/** The review's key for a holding — `EXCHANGE:SYMBOL`, as the review list keys it. */
export const reviewKey = (exchange: string, symbol: string) =>
  `${exchange}:${symbol}`.trim().toUpperCase();

/** Every reviewed holding by its key. */
export function reviewIndex(
  holdings: readonly HoldingSummary[] | null | undefined,
): Map<string, HoldingSummary> {
  return new Map((holdings ?? []).map((h) => [h.key.toUpperCase(), h]));
}

/**
 * What to show beside a holding. A verdict in force wins, even while a newer review runs
 * (`updating`) or a newer one failed; only a holding with NO verdict yet reads as reviewing,
 * failed or not reviewed — never a made-up Hold.
 */
export type ReviewMarkView =
  | {
      kind: 'verdict';
      action: ReviewAction;
      at: string;
      updating: boolean;
      changedFrom: ReviewAction | null;
    }
  | { kind: 'reviewing' }
  | { kind: 'failed'; error: string | null }
  | { kind: 'none' };

export function reviewMark(summary: HoldingSummary | null | undefined): ReviewMarkView {
  if (!summary) return { kind: 'none' };
  if (summary.current) {
    return {
      kind: 'verdict',
      action: summary.current.action,
      at: summary.current.at,
      updating: Boolean(summary.inFlight),
      changedFrom: summary.changed && summary.lastChange ? summary.lastChange.from : null,
    };
  }
  if (summary.inFlight) return { kind: 'reviewing' };
  if (summary.lastFailure) return { kind: 'failed', error: summary.lastFailure.error };
  return { kind: 'none' };
}

export type ReviewTally = Record<ReviewAction, number> & {
  reviewing: number;
  none: number;
  total: number;
  /** The newest verdict among these holdings. */
  latestAt: string | null;
};

/** How a book's holdings stand in the review — every holding lands in exactly one bucket. */
export function reviewTally(
  holdings: readonly { exchange: string; symbol: string }[],
  index: ReadonlyMap<string, HoldingSummary>,
): ReviewTally {
  const tally: ReviewTally = {
    CONSIDER_ADD: 0,
    HOLD: 0,
    CONSIDER_SELL: 0,
    NEEDS_REVIEW: 0,
    reviewing: 0,
    none: 0,
    total: 0,
    latestAt: null,
  };
  const seen = new Set<string>();
  for (const holding of holdings) {
    const key = reviewKey(holding.exchange, holding.symbol);
    if (seen.has(key)) continue;
    seen.add(key);
    tally.total += 1;
    const mark = reviewMark(index.get(key));
    if (mark.kind === 'verdict') {
      tally[mark.action] += 1;
      if (!tally.latestAt || mark.at > tally.latestAt) tally.latestAt = mark.at;
    } else if (mark.kind === 'reviewing') tally.reviewing += 1;
    else tally.none += 1;
  }
  return tally;
}
