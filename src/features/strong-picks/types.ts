// Mirrored from the web client (client/src/features/strong-picks/services/strong-picks.service.ts)
// and the server (modules/recommendations/strong-pick.read.ts). GET /recommendations/strong-picks.

export type MarketSegment = 'equity' | 'intraday' | 'fno';

export interface SegmentVerdict {
  segment: MarketSegment;
  suitable: boolean;
  /** Rendered verbatim — the numbers that decided it. */
  reason: string;
  /** `inferred` is judged from DAILY bars (no intraday history exists) — shown differently. */
  confidence: 'exact' | 'inferred';
}

/** What the stock did between 09:15 and 09:30. */
export type OpenStructure = 'holding' | 'extended' | 'breaking-down' | 'unclear';

export type PickState =
  'unpriced' | 'awaiting-entry' | 'in-band' | 'above-band' | 'working' | 'target-hit' | 'stop-hit';

export type PickSuggestion = 'NO_PRICE' | 'WAIT' | 'ENTER' | 'HOLD' | 'TAKE_PROFIT' | 'EXIT';

export interface MonitorVerdict {
  state: PickState;
  suggestion: PickSuggestion;
  headline: string;
  /** Rendered verbatim — written on the server so the two can't disagree. */
  detail: string;
  /** 0–1 of the way from entry to target, by the BEST price seen since publication. */
  progressToTarget: number | null;
  movePct: number | null;
  /** The price is older than the monitor's tolerance. */
  stale: boolean;
  spannedBothLevels: boolean;
}

export interface PickMonitor {
  verdict: MonitorVerdict;
  lastPrice: number | null;
  priceAsOf: string | null;
  highSincePublish: number | null;
  lowSincePublish: number | null;
  targetHitAt: string | null;
  stopHitAt: string | null;
  lastSampledAt: string | null;
  /** A monitor that stopped must never look like a quiet stock. */
  minutesSinceSample: number | null;
  samples: number;
}

export interface StrongPick {
  symbol: string;
  exchange: string;
  name: string;
  /** 1 = best; dense. */
  rank: number;
  segments: MarketSegment[];
  /** All three, including the ones that did NOT qualify. */
  segmentVerdicts: SegmentVerdict[];
  openPrice: number | null;
  priceAtDecision: number | null;
  windowHigh: number | null;
  windowLow: number | null;
  gapPct: number | null;
  openMovePct: number | null;
  volumeShareOfTypicalDay: number | null;
  structure: OpenStructure;
  observationSummary: string;
  source: string;
  entryLow: number | null;
  entryHigh: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  rewardRisk: number | null;
  atr: number | null;
  stopClamped: 'none' | 'widened-to-min' | 'tightened-to-max';
  monitor: PickMonitor | null;
  /** Ordinal AI ranking signal — never render as a probability. */
  modelSetupScore: number;
  /** Measured target-before-stop rate (0–100); null until enough outcomes exist. */
  winProbability: number | null;
  probabilitySampleSize: number;
  probabilityBasis: 'target-before-stop' | 'insufficient-history';
  /** 1–5 ordinal. */
  conviction: number;
  rationale: string;
  /** What would prove this wrong. Rendered verbatim. */
  invalidation: string;
  caveat: string;
}

export type StrongPickRunStatus =
  | 'published'
  | 'nothing-survived-open'
  | 'nothing-cleared-floor'
  | 'no-candidates'
  | 'analysis-failed'
  | 'not-configured'
  | 'not-run-yet';

export type RejectionStage =
  | 'open-filter'
  | 'levels'
  | 'score-floor'
  | 'calibration-floor'
  | 'probability-floor'
  | 'unreadable'
  | 'model';

export interface StrongPickRejection {
  symbol: string;
  exchange: string;
  stage: RejectionStage | string;
  reason: string;
}

/** What the 09:30 pass did, whether or not it published. `verdict` is rendered verbatim. */
export interface StrongPickRun {
  status: StrongPickRunStatus;
  verdict: string;
  considered: number;
  consideredBySource: { source: string; count: number }[];
  survivedOpen: number;
  reachedModel: number;
  published: number;
  rejections: StrongPickRejection[];
  minSetupScore: number;
  minCalibratedWinRate: number;
  unavailableSources: { source: string; reason: string }[];
  finishedAt: string | null;
}

export interface StrongPicksResponse {
  date: string;
  picks: StrongPick[];
  generatedAt: string | null;
  run: StrongPickRun;
  /** The most recent day that published when today has none — a pointer, never today's answer. */
  lastPublished: { date: string; count: number } | null;
  marketOpen: boolean;
  /** Must be rendered: carries the "estimated, never scored" statement. */
  caveats: string[];
  nextRunAt?: string;
}
