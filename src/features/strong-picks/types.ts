// Mirrored from the web client (client/src/features/strong-picks/services/strong-picks.service.ts)
// and the server (modules/recommendations/strong-pick.read.ts). GET /recommendations/strong-picks.
// Every payload passes through lib/normalize.ts, so the shapes below always hold — including the
// v2 fields (2026-10-04), which are null/empty on older picks and absent on an older server.

import type { MarketRegime } from '@/features/strategies/types';

/** The market regime comes from Institutional Breakout Swing's evening scan (a platform strategy). */
export type { MarketRegime };

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

  // ── v2 — categories, evidence and outcome. Null/empty on picks from before. ──
  /** The day it was published (YYYY-MM-DD, IST). */
  date: string;
  category: PickCategory | null;
  direction: 'long';
  /** 'trigger' = buy only above entryLow (the swing strategy's level); 'band' = the 09:30 band. */
  entryMode: 'band' | 'trigger';
  /** Sessions the pick is followed for (intraday 1, options 3, futures 5, equity 10). */
  horizonDays: number;
  /** Sessions since publication, the publication day counting as 1. */
  sessionsElapsed: number;
  /** Every source that put this stock forward. */
  sources: string[];
  swing: PickSwing | null;
  news: PickNews[];
  fundamentals: PickFundamentals | null;
  contract: PickContract | null;
  /** One line from the AI on what could go wrong. Rendered verbatim. */
  riskNote: string;
  outcome: PickOutcome | null;
  /** Trigger picks: when the price first traded through the trigger. */
  triggeredAt: string | null;
}

export type PickCategory = 'equity' | 'intraday' | 'futures' | 'options';
export type OutcomeStatus = 'open' | 'target' | 'stop' | 'time' | 'not-triggered';

/** The F&O contract a Futures or Options pick is expressed through. */
export interface PickContract {
  tradingSymbol: string;
  kind: 'FUT' | 'CE' | 'PE';
  strike: number | null;
  expiry: string;
  lotSize: number;
  /** Premium (options) or price (futures) when published; null when unquoted. */
  ltp: number | null;
  /** One lot's premium outlay (options) or notional value (futures). */
  lotValue: number | null;
}

/** Where the pick ended (or stands) — settled once by the monitor. */
export interface PickOutcome {
  status: OutcomeStatus;
  entryPrice: number | null;
  exitPrice: number | null;
  returnPct: number | null;
  /** 0–1 of the way from entry to target, by the best price seen. */
  progressToTarget: number | null;
  resolved: boolean;
  resolvedAt: string | null;
}

/** The swing strategy's checklist for a pick it found. */
export interface PickSwing {
  grade: string;
  score: number | null;
  trigger: string;
  passed: string[];
  warnings: string[];
}

export interface PickNews {
  title: string;
  sentiment: string | null;
  at: string | null;
  url: string | null;
  publisher: string | null;
}

export interface PickFundamentals {
  verdict: string | null;
  ratingPct: number | null;
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
  /** Earlier picks still inside their horizon. Empty on an older server. */
  active: StrongPick[];
  /** From the latest evening swing scan; null before one (or on an older server). */
  regime: MarketRegime | null;
  marketOpen: boolean;
  /** Must be rendered: carries the "estimated, never scored" statement. */
  caveats: string[];
  nextRunAt?: string;
}

/** POST /recommendations/strong-picks/monitor/sweep — samples the picks now. */
export interface MonitorSweepResult {
  date: string;
  picks: number;
  sampled: number;
  unpriced: number;
  newTargetHits: number;
  newStopHits: number;
  /** Why nothing was sampled (e.g. "Market is closed."); null when it ran. */
  skipped: string | null;
}

/** POST /recommendations/strong-picks/generate (admin) — re-runs the 09:30 review. */
export interface GenerateStrongPicksResult {
  jobId: string;
  alreadyRunning: boolean;
  date: string;
}

// ── Results (GET /recommendations/strong-picks/analytics?days=7..180) ──────────────────

/** One set of picks added up. Rates are over CLOSED picks only; null before any close. */
export interface ScoreLine {
  picks: number;
  open: number;
  notTriggered: number;
  targets: number;
  stops: number;
  timeExits: number;
  /** Closed with a positive return. */
  profitable: number;
  /** Targets + stops + time exits. */
  closed: number;
  successRate: number | null;
  /** Targets as a share of target-or-stop resolutions. */
  targetHitRate: number | null;
  avgReturnPct: number | null;
  /** Open picks currently in profit, percent of open picks with a price. */
  openInProfitPct: number | null;
}

export interface AnalyticsEntry {
  date: string;
  symbol: string;
  name: string;
  category: PickCategory;
  status: OutcomeStatus;
  entryPrice: number | null;
  exitPrice: number | null;
  lastPrice: number | null;
  returnPct: number | null;
  progressToTarget: number | null;
  horizonDays: number;
}

export interface StrongPickAnalytics {
  days: number;
  since: string;
  /** False while the latest day's session is still trading. */
  sessionClosed: boolean;
  /** The latest publication day in the window, with each pick's row. */
  today: (ScoreLine & { date: string; entries: AnalyticsEntry[] }) | null;
  overall: ScoreLine;
  byCategory: (ScoreLine & { category: PickCategory })[];
  /** Newest first. */
  byDay: (ScoreLine & { date: string })[];
}
