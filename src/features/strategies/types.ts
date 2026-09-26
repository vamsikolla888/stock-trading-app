// Mirrored from the web client: features/strategies/services/strategies.service.ts (and
// features/indices/services/indices.service.ts for the universe picker). Field names are
// identical to the server's strategy rule DSL (server/src/modules/strategies/strategy-rules.ts).

import type { StockIndexTags } from '@/features/market/types';

export type PriceField = 'close' | 'open' | 'high' | 'low' | 'volume';

export type IndicatorName =
  | 'SMA'
  | 'EMA'
  | 'WMA'
  | 'DEMA'
  | 'TEMA'
  | 'RSI'
  | 'RSI_MA'
  | 'MACD'
  | 'MACD_SIGNAL'
  | 'MACD_HIST'
  | 'MFI'
  | 'MOMENTUM'
  | 'ADX'
  | 'ADX_MA'
  | 'PLUS_DI'
  | 'MINUS_DI'
  | 'SUPERTREND'
  | 'VORTEX_PLUS'
  | 'VORTEX_MINUS'
  | 'BB_UPPER'
  | 'BB_MIDDLE'
  | 'BB_LOWER'
  | 'BB_WIDTH'
  | 'ATR'
  | 'VOL_SMA'
  | 'VOL_OSC'
  | 'VWAP'
  | 'VWAP_MA'
  | 'MID'
  | 'HIGHEST_HIGH'
  | 'LOWEST_LOW';

export type Comparator = '>' | '<' | '>=' | '<=' | 'crossesAbove' | 'crossesBelow';

export type ConstantOperand = { kind: 'constant'; value: number };
export type PriceOperand = {
  kind: 'price';
  field: PriceField;
  multiplier?: number;
  offset?: number;
};
export type IndicatorOperand = {
  kind: 'indicator';
  name: IndicatorName;
  period?: number;
  fast?: number;
  slow?: number;
  signal?: number;
  stdDev?: number;
  multiplier?: number;
  offset?: number;
};

export type Operand = ConstantOperand | PriceOperand | IndicatorOperand;

export interface Condition {
  left: Operand;
  op: Comparator;
  right: Operand;
}

export type UniverseExchange = 'NSE' | 'BSE' | 'ALL';

export interface StrategyRules {
  entry: { all: Condition[] };
  exit: {
    any: Condition[];
    targetPct?: number;
    stopLossPct?: number;
    maxHoldBars?: number;
  };
  universe: {
    exchange: UniverseExchange;
    minPrice?: number;
    maxSymbols?: number;
    /** Optional, never null — the server's universe schema is strict; absence means unset. */
    indexKey?: string;
    /** Same absence-means-unset rule as `indexKey`. */
    fnoOnly?: boolean;
  };
}

export type BacktestStatus = 'never-run' | 'queued' | 'running' | 'complete' | 'failed';

export interface StrategyMetrics {
  totalTrades: number;
  winRate: number;
  /** null when there were no losing trades — distrust the sample; never render as ∞. */
  profitFactor: number | null;
  maxDrawdownPct: number;
  /** null when the tested window is under a year. */
  cagrPct: number | null;
  totalReturnPct: number;
  expectancyPct: number;
}

export interface StrategySummary {
  id: string;
  name: string;
  description: string | null;
  chips: string[];
  status: BacktestStatus;
  lastError: string | null;
  ranAt: string | null;
  /** The rules have been edited since these numbers were produced. */
  resultsStale: boolean;
  templateId: string | null;
  /** null until a backtest has produced numbers. */
  metrics: StrategyMetrics | null;
  equitySpark: number[];
  updatedAt: string;
}

export type ExitReason = 'target' | 'stop' | 'signal' | 'timeStop' | 'endOfData';

export interface BacktestTrade {
  exchange: string;
  symbol: string;
  /** Unix seconds. */
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  barsHeld: number;
  returnPct: number;
  exitReason: ExitReason;
}

export interface SymbolStats {
  exchange: string;
  symbol: string;
  trades: number;
  winRate: number;
  profitFactor: number | null;
  totalReturnPct: number;
}

export interface SplitStat {
  label: 'in-sample' | 'out-of-sample';
  trades: number;
  winRate: number;
  profitFactor: number | null;
  expectancyPct: number;
  totalReturnPct: number;
  from: number | null;
  to: number | null;
}

export interface BacktestAnalysis {
  exitReasons: {
    reason: ExitReason;
    trades: number;
    sharePct: number;
    avgReturnPct: number;
    totalReturnPct: number;
  }[];
  avgBarsHeldWinners: number;
  avgBarsHeldLosers: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  sharpe: number | null;
  sortino: number | null;
  drawdown: {
    depthPct: number;
    durationDays: number;
    /** null when it never recovered — must not render as 0. */
    recoveryDays: number | null;
    peakAt: number | null;
    troughAt: number | null;
  } | null;
  monthly: { period: string; trades: number; returnPct: number }[];
  splits: SplitStat[];
  bestTrades: BacktestTrade[];
  worstTrades: BacktestTrade[];
  topSymbolProfitSharePct: number | null;
  topSymbol: string | null;
}

export interface EquityPoint {
  /** Unix seconds. */
  t: number;
  v: number;
}

export interface StrategyRun {
  runId: string;
  ranAt: string;
  metrics: StrategyMetrics & {
    wins: number;
    losses: number;
    avgWinPct: number;
    avgLossPct: number;
    symbolsWithTrades: number;
    firstTradeAt: number | null;
    lastTradeAt: number | null;
  };
  /** Null on runs recorded before the analysis existed. */
  analysis: BacktestAnalysis | null;
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  symbolStats: SymbolStats[];
  universeSize: number;
  skippedForInsufficientBars: number;
  durationMs: number;
  costBps: number;
  maxOpenPositions: number;
}

export interface StrategyDetail extends StrategySummary {
  rules: StrategyRules;
  /** The stored rules in English, rendered server-side. */
  readback: string;
  run: StrategyRun | null;
  /** Engine-level caveats, rendered verbatim. */
  caveats: string[];
}

export interface StrategyTemplate {
  id: string;
  name: string;
  summary: string;
  notes: string;
  rules: StrategyRules;
  readback: string;
  chips: string[];
}

export type IndicatorCategory =
  'overlap studies' | 'oscillators' | 'trend' | 'volatility' | 'volume indicators' | 'price';

export type OperandParam = 'period' | 'stdDev' | 'macd' | 'signal' | 'fastSlow';

export interface CatalogEntry {
  id: string;
  label: string;
  description: string;
  category: IndicatorCategory;
  params: OperandParam[];
  operand: Operand;
  caveat?: string;
}

export type SuggestionTag =
  'Scalping' | 'Trend Following' | 'Longterm' | 'Trend Reversal' | 'Breakout' | 'Mean Reversion';

export interface PrebuiltSuggestion {
  id: string;
  indicatorId: string;
  bias: 'bullish' | 'bearish';
  tag: SuggestionTag;
  /** Rendered server-side from the condition itself. */
  label: string;
  condition: Condition;
}

export interface StrategyCatalog {
  indicators: CatalogEntry[];
  suggestions: PrebuiltSuggestion[];
}

export interface EnqueueBacktestResult {
  enqueued: boolean;
  alreadyRunning: boolean;
  jobId: string;
}

export interface BacktestJobStatus {
  running: boolean;
  state: string | null;
  lastError: string | null;
}

export interface CreateStrategyBody {
  name: string;
  description?: string | null;
  rules?: StrategyRules;
  templateId?: string;
}

export interface UpdateStrategyBody {
  name?: string;
  description?: string | null;
  rules?: StrategyRules;
}

// ── AI generation ──────────────────────────────────────────────────────────────────────

export interface CandidateSample {
  symbolsTested: number;
  /** Trades for a strategy, matches for a screener. */
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancyPct: number | null;
}

export interface GeneratedCandidate {
  name: string;
  summary: string;
  weakness: string;
  verdict: 'kept' | 'rejected';
  reason: string | null;
  conditionText: string[];
  sample: CandidateSample | null;
}

export type GenerationStatus = 'queued' | 'generating' | 'validating' | 'complete' | 'failed';

export interface GenerationView {
  id: string;
  status: GenerationStatus;
  error: string | null;
  input: {
    kind: 'strategy' | 'screener';
    count: number;
    theme: string | null;
    exchange: string;
    minPrice: number | null;
  };
  proposed: number;
  candidates: GeneratedCandidate[];
  savedCount: number;
  savedIds: string[];
  tokensUsed: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface StartGenerationInput {
  kind: 'strategy' | 'screener';
  packId?: string | null;
  count: number;
  theme?: string | null;
  exchange: UniverseExchange;
  minPrice?: number | null;
  fnoOnly?: boolean;
}

export interface StrategyPack {
  id: string;
  label: string;
  description: string;
  kind: 'strategy' | 'screener';
  fnoOnly: boolean;
  setupCount: number;
  setups: { name: string; brief: string }[];
}

// ── Pointing a strategy at today ───────────────────────────────────────────────────────

export interface StrategyMatch {
  exchange: 'NSE' | 'BSE';
  symbol: string;
  companyName: string | null;
  ltp: number | null;
  changePct: number | null;
  /** Close of the bar the rule fired on — not a fill price. */
  signalClose: number;
  signalBarTime: number;
  metrics: Record<string, number>;
  recentCloses: number[];
  liquidity: number;
  atr?: number | null;
  indices?: StockIndexTags;
}

export interface StrategyMatchesResult {
  matches: StrategyMatch[];
  universeSize: number;
  skippedForInsufficientBars: number;
  asOfBarTime: number | null;
}

export interface ScreenerCandidate {
  key: string;
  name: string;
  kind: 'built-in' | 'custom';
  score: number;
  indicatorOverlapPct: number;
  directionAgreementPct: number;
  hitRatePct: number | null;
  sampleTrades: number | null;
  sharedIndicators: string[];
  conditionText: string[];
  currentMatches: number;
  why: string | null;
}

export interface PairedStock {
  exchange: string;
  symbol: string;
  companyName: string | null;
  ltp: number | null;
  changePct: number | null;
  signalClose: number;
  metrics: Record<string, number>;
  recentCloses: number[];
  alsoFlaggedBy: string[];
}

export interface PairingResult {
  strategyId: string;
  strategyName: string;
  entryText: string[];
  candidates: ScreenerCandidate[];
  bestStocks: PairedStock[];
  universeSize: number;
  asOfBarTime: number | null;
}

// ── Index catalogue (universe narrowing) ───────────────────────────────────────────────

export interface IndexSummary {
  key: string;
  label: string;
  shortLabel: string;
  category: string;
  exchange: string;
  constituentCount: number;
  caveat: string | null;
  broadRank: number | null;
  /** True when no membership could be imported — "unknown", never "none". */
  unavailable: boolean;
}
