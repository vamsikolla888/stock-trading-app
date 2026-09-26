// Mirrored from the web client: features/recommendations/services/recommendations.service.ts,
// features/strong-picks/services/strong-picks.service.ts, features/signals/services/signals.service.ts,
// features/strategies/services/strategies.service.ts. Only fields the app renders are listed.

export type RiskLevel = 'Low' | 'Medium' | 'High';

export interface Recommendation {
  sym: string;
  name: string;
  exch: string;
  conf: number;
  allocationPercent: number;
  risk: RiskLevel;
  lo: number | null;
  hi: number | null;
  target: number | null;
  stop: number | null;
  exp: number | null;
  hold: string;
  sent: number;
  ltp: number | null;
  why: { head: string; text: string }[];
  caveat: string;
  source?: 'news' | 'historical';
}

export type SessionKind = 'CURRENT' | 'WEEKEND' | 'AWAITING_TODAY' | 'NONE';

export interface SessionResolution {
  effectiveDate: string | null;
  requestedDate: string;
  kind: SessionKind;
  ageDays: number;
  label: string;
}

export type ReviewVerdict = 'CONFIRM' | 'TRIM' | 'DROP';

export interface RecommendationReview {
  symbol: string;
  exchange: string;
  verdict: ReviewVerdict;
  reviewScore: number;
  reasoning: string;
  contradictions: string[];
  confirmations: string[];
  invalidation: string;
  reviewedAt: string;
}

/** GET /recommendations/today */
export interface CurrentRecommendationsResponse {
  date: string;
  recommendations: Recommendation[];
  reason: string | null;
  session?: SessionResolution;
  reviews?: RecommendationReview[];
}

export interface MonitorVerdict {
  headline: string;
  detail: string;
  stale: boolean;
}

export interface StrongPick {
  symbol: string;
  exchange: string;
  name: string;
  rank: number;
  entryLow: number | null;
  entryHigh: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  rewardRisk: number | null;
  monitor: { verdict: MonitorVerdict; lastPrice: number | null } | null;
  /** Ordinal ranking signal — never render as a probability. */
  modelSetupScore: number;
  /** Measured rate; null until enough outcomes exist. */
  winProbability: number | null;
  probabilitySampleSize: number;
  conviction: number;
  rationale: string;
  invalidation: string;
  caveat: string;
}

export interface StrongPicksResponse {
  date: string;
  picks: StrongPick[];
  generatedAt: string | null;
  run: {
    status: string;
    verdict: string;
    considered: number;
    published: number;
    finishedAt: string | null;
  };
  lastPublished: { date: string; count: number } | null;
  marketOpen: boolean;
  caveats: string[];
}

export type SignalAction = 'BUY' | 'SELL' | 'WATCH';

export interface Signal {
  date: string;
  screenerKey: string;
  screenerName: string;
  exchange: string;
  symbol: string;
  companyName: string | null;
  ltp: number | null;
  changePct: number | null;
  hitRatePct: number | null;
  sampleTrades: number | null;
  avgReturnPct: number | null;
  holdDays: number | null;
  action: SignalAction;
  conviction: number;
  rationale: string;
  invalidation: string;
}

export interface SignalsResponse {
  date: string;
  signals: Signal[];
}

export type BacktestStatus = 'never-run' | 'queued' | 'running' | 'complete' | 'failed';

export interface StrategySummary {
  id: string;
  name: string;
  description: string | null;
  chips: string[];
  status: BacktestStatus;
  ranAt: string | null;
  resultsStale: boolean;
  metrics: {
    totalTrades: number;
    winRate: number;
    profitFactor: number | null;
    maxDrawdownPct: number;
    cagrPct: number | null;
    totalReturnPct: number;
  } | null;
  equitySpark: number[];
  updatedAt: string;
}
