// Mirrored from the web client (features/watchlists/services/watchlists.service.ts).

export type WatchlistKind = 'manual' | 'recommendations';

/** The first list from GET /watchlists is always this derived, read-only list. */
export const RECOMMENDATION_WATCHLIST_ID = 'recommendations';

/** Server limits (watchlist.model.ts). */
export const MAX_WATCHLISTS = 12;
export const MAX_WATCHLIST_ITEMS = 100;

export interface WatchlistListItem {
  id: string;
  name: string;
  itemCount: number;
  readOnly: boolean;
  kind: WatchlistKind;
  updatedAt: string | null;
}

export type UnpricedReason = 'NO_BASELINE' | 'NO_CURRENT_PRICE';

export type ReviewVerdict = 'CONFIRM' | 'TRIM' | 'DROP';

/**
 * The AI layer on a recommendation row. Scores are MODEL scores out of 100 — not
 * probabilities, never validated against outcomes. There is deliberately no fundamental
 * score: the platform holds no fundamental data.
 */
export interface WatchlistItemAi {
  compositeScore: number | null;
  technicalScore: number | null;
  newsSentimentScore: number | null;
  reasons: { head: string; text: string }[];
  rationale: string | null;
  /** The model's own stated risk — shown beside the score, not behind a tap. */
  caveat: string | null;
  riskLevel: string | null;
  capCategory: string | null;
  holdingPeriodDays: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  expectedMovementPercent: number | null;
  /** Null means never reviewed — which is NOT a CONFIRM. */
  reviewVerdict: ReviewVerdict | null;
  flaggedCount: number;
  firstFlaggedDate: string;
  lastFlaggedDate: string;
  sector: string | null;
  industry: string | null;
}

export interface AiTally {
  label: string;
  count: number;
}

export interface WatchlistAiSummary {
  scoredCount: number;
  avgCompositeScore: number | null;
  avgTechnicalScore: number | null;
  avgNewsSentimentScore: number | null;
  avgHoldingPeriodDays: number | null;
  topSector: AiTally | null;
  sectorBreakdown: AiTally[];
  riskBreakdown: AiTally[];
  /** Includes an explicit "not reviewed" row. */
  reviewBreakdown: AiTally[];
  flaggedToday: number;
  repeatFlagged: number;
  hasValidatedWinRate: false;
  scoreCaveat: string;
}

export interface WatchlistItem {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  companyName: string | null;
  addedAt: string;
  addedPrice: number | null;
  ltp: number | null;
  prevClose: number | null;
  changeSinceAddPct: number | null;
  changeSinceAddAbs: number | null;
  changeTodayPct: number | null;
  daysHeld: number | null;
  measured: boolean;
  unpricedReason: UnpricedReason | null;
  note: string | null;
  source: string | null;
  /** Daily closes, oldest first. Empty when there's no history — draw nothing, not a flat line. */
  sparkline: number[];
  /** Null on a stock added by hand — it was never scored. */
  ai?: WatchlistItemAi | null;
}

export interface WatchlistSummary {
  totalCount: number;
  /** The denominator of the since-added average — unmeasurable rows are excluded, not flat. */
  measuredCount: number;
  unmeasuredCount?: number;
  avgChangeSinceAddPct?: number | null;
  avgChangeTodayPct: number | null;
  todayMeasuredCount?: number;
  winners: number;
  losers: number;
  unchanged: number;
  best?: { exchange: string; symbol: string; changePct: number } | null;
  worst?: { exchange: string; symbol: string; changePct: number } | null;
}

export interface WatchlistView extends WatchlistListItem {
  items: WatchlistItem[];
  summary: WatchlistSummary;
  /** Null on a manual list — it has no AI layer at all. */
  ai?: WatchlistAiSummary | null;
  caveats: string[];
  pricesAsOf: string | null;
}

export interface WatchlistItemInput {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  note?: string | null;
}
