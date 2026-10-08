// Mirrored from the web client: features/strategies/services/strategies.service.ts (and
// features/indices/services/indices.service.ts for the universe picker). Field names are
// identical to the server's strategy rule DSL (server/src/modules/strategies/rules/rules.types.ts).
//
// UNITS: every number from the API is a whole PERCENT, trade returns included (3.1 = +3.1%).

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
    /** Names liquid enough that next-open fills are plausible. */
    tradeableOnly?: boolean;
  };
}

/** How a backtest is simulated. Changing it marks results stale, exactly as editing rules does. */
export interface BacktestSettings {
  /** Cost per side, basis points (0–100). */
  costBps: number;
  /** Equal-weight portfolio slots (1–50); a signal with every slot full is skipped. */
  maxOpenPositions: number;
}

export const DEFAULT_BACKTEST_SETTINGS: BacktestSettings = { costBps: 15, maxOpenPositions: 8 };

export type BacktestStatus = 'never-run' | 'queued' | 'running' | 'complete' | 'failed';
export type RunPhase = BacktestStatus | 'stalled';

/** A run's state, answered with the queue consulted — `stalled` is a job that vanished. */
export interface RunState {
  phase: RunPhase;
  /** Set for failures and for runs that look stuck. */
  message: string | null;
  /** Keep polling while true. */
  active: boolean;
}

export type VerdictTone = 'good' | 'warn' | 'bad' | 'unknown';

/** The out-of-sample check in one sentence. */
export interface SplitVerdict {
  tone: VerdictTone;
  text: string;
}

/** A lint finding on a rule ("RSI > 0 is always true"), with its dotted path. */
export interface RuleWarning {
  path: string;
  message: string;
}

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
  symbolsWithTrades?: number;
}

export interface StrategySummary {
  id: string;
  name: string;
  description: string | null;
  chips: string[];
  /** The universe as short phrases ("NSE", "Nifty 50 members"). Optional for an older server. */
  universe?: string[];
  status: BacktestStatus;
  /** Optional for an older server — fall back to `status`. */
  runState?: RunState;
  lastError: string | null;
  ranAt: string | null;
  /** The rules or the backtest settings changed since these numbers were produced. */
  resultsStale: boolean;
  staleReason?: 'rules' | 'settings' | null;
  templateId: string | null;
  /** null until a backtest has produced numbers. */
  metrics: StrategyMetrics | null;
  verdict?: SplitVerdict | null;
  equitySpark: number[];
  settings?: BacktestSettings;
  createdAt?: string;
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
  /** PERCENT (3.1 = +3.1%) — the response converts the stored fraction. */
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
  /** Optional for an older run. */
  verdict?: SplitVerdict;
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
  /** Narrowings that were unavailable, so a wider universe was scanned. */
  fellBack?: string[];
}

export interface StrategyDetail extends StrategySummary {
  rules: StrategyRules;
  /** The stored rules in English, rendered server-side. */
  readback: string;
  /** Each entry condition in words. Optional for an older server. */
  entry?: string[];
  exits?: string[];
  /** Lint on the stored rules. */
  warnings?: RuleWarning[];
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
  /** The strategy's new state (queued) — optional for an older server. */
  strategy?: StrategySummary;
}

export interface RunStaleResult {
  queued: number;
  alreadyRunning: number;
  /** Beyond the 30-per-call cap — press again. */
  deferred: number;
}

/** POST /strategies/preview — never a 422: an invalid draft is the normal state of a form. */
export interface RulesPreview {
  valid: boolean;
  issues: { path: string; message: string }[];
  warnings: RuleWarning[];
  readback: string | null;
  chips: string[];
  entry: string[];
  exits: string[];
  universe: string[];
  warmupBars: number | null;
  rules: StrategyRules | null;
}

export interface CreateStrategyBody {
  name: string;
  description?: string | null;
  rules?: StrategyRules;
  templateId?: string;
  settings?: Partial<BacktestSettings>;
}

export interface UpdateStrategyBody {
  name?: string;
  description?: string | null;
  rules?: StrategyRules;
  settings?: Partial<BacktestSettings>;
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
  /** Lint on a kept rule. */
  warnings?: string[];
  /** Saved as this strategy / screener; null = not saved (a kept candidate can still be). */
  savedId?: string | null;
}

/** `waiting` = parked behind an open AI breaker; `error` says why. */
export type GenerationStatus =
  'queued' | 'waiting' | 'generating' | 'validating' | 'complete' | 'failed';

export function isGenerationActive(status: GenerationStatus | undefined): boolean {
  return (
    status === 'queued' ||
    status === 'waiting' ||
    status === 'generating' ||
    status === 'validating'
  );
}

export interface GenerationView {
  id: string;
  status: GenerationStatus;
  error: string | null;
  input: {
    kind: 'strategy' | 'screener';
    packId?: string | null;
    count: number;
    theme: string | null;
    exchange: string;
    minPrice: number | null;
    fnoOnly?: boolean;
    indexKey?: string | null;
    tradeableOnly?: boolean;
  };
  proposed: number;
  /** How many passed every gate. Optional for an older server. */
  kept?: number;
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
  indexKey?: string | null;
  tradeableOnly?: boolean;
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
  /** Every match, before `limit`. */
  total?: number;
  universeSize: number;
  skippedForInsufficientBars: number;
  asOfBarTime: number | null;
  /** Narrowings that were unavailable, so a wider universe was scanned. */
  fellBack?: string[];
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
  indices?: StockIndexTags;
}

export interface PairingResult {
  strategyId: string;
  strategyName: string;
  entryText: string[];
  candidates: ScreenerCandidate[];
  bestStocks: PairedStock[];
  universeSize: number;
  asOfBarTime: number | null;
  /** Whether the AI sentences were asked for and delivered. */
  explained?: boolean;
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

// ── Platform ("house") strategies ──────────────────────────────────────────────────────
// Mirrors server/src/modules/house-strategies (the registry and its routes),
// swing-setups/house-strategy.views.ts and intraday-strategies/bb-midband.views.ts. Run by the
// platform for everyone: the daily swing (Institutional Breakout Swing) and the 5-minute
// intraday Bollinger Mid-Band Thrust. Every payload passes through lib/houseNormalize.ts or
// lib/intradayNormalize.ts, so the shapes below always hold.

export const SWING_KEY = 'institutional-breakout-swing' as const;
export const BB_KEY = 'bb-midband-5m' as const;
export type SwingStrategyKey = typeof SWING_KEY;
export type IntradayStrategyKey = typeof BB_KEY;
export type HouseStrategyKey = SwingStrategyKey | IntradayStrategyKey;
/** The list's order on the server: the intraday strategy first. */
export const HOUSE_STRATEGY_KEYS: readonly HouseStrategyKey[] = [BB_KEY, SWING_KEY];

export type HouseStrategyKind = 'daily-swing' | 'intraday';

/** A stock the backtest says the strategy has a measured edge on (the card's "Works on"). */
export interface WorksOnStock {
  symbol: string;
  trades: number;
  winRate: number;
  /** Mean net trade, percent. */
  avgReturnPct: number;
  profitFactor: number | null;
}

export interface HouseStockCounts {
  tested: number;
  traded: number;
  works: number;
  avoid: number;
}

export type DeploymentModeTag = 'paper' | 'live';

/** One of the caller's own current deployments of a platform strategy — for PAPER/LIVE chips. */
export interface HouseDeploymentRef {
  id: string;
  mode: DeploymentModeTag;
  status: 'active' | 'paused' | 'stopped';
}

export type RegimeState = 'risk-on' | 'cautious' | 'risk-off' | 'unknown';

/** Nifty against its 50/200-day averages — measured by the evening swing scan. */
export interface MarketRegime {
  state: RegimeState;
  close: number | null;
  dma50: number | null;
  dma200: number | null;
  vix: number | null;
  return21Pct: number | null;
  return63Pct: number | null;
  /** Rendered verbatim. */
  detail: string;
  /** The scan day it was measured on, when the server says. */
  asOf: string | null;
}

export type ScanStatus = 'completed' | 'no-data' | 'failed';

/** One evening scan in the day picker. */
export interface ScanDay {
  date: string;
  status: ScanStatus;
  setups: number;
  gradeA: number;
  regime: RegimeState;
}

export type HouseMetrics = StrategyMetrics & {
  wins: number;
  losses: number;
  symbolsWithTrades: number;
  firstTradeAt: number | null;
  lastTradeAt: number | null;
};

export interface HouseBacktest {
  status: ScanStatus;
  ranAt: string | null;
  from: string | null;
  to: string | null;
  sessions: number;
  metrics: HouseMetrics | null;
  equitySpark: number[];
  verdict: SplitVerdict | null;
}

export interface HouseStrategySummary {
  key: HouseStrategyKey;
  kind: HouseStrategyKind;
  name: string;
  short: string;
  description: string;
  /** "Daily", "5 min" — empty from a server older than the field. */
  timeframe: string;
  /** "Swing · up to 10 sessions", "Intraday" — empty from an older server. */
  holding: string;
  schedule: string;
  universe: string;
  /** The swing's newest evening scan; null for the intraday strategy. */
  latestScan: ScanDay | null;
  backtest: HouseBacktest | null;
  /** Best first, at most six. */
  worksOn: WorksOnStock[];
  stocks: HouseStockCounts | null;
  /** The caller's own current deployments of it. */
  deployments: HouseDeploymentRef[];
}

export type SwingGrade = 'A' | 'B' | 'C';
export type SwingTrigger = 'breakout' | 'pullback';
export type SetupStatus =
  'target' | 'stop' | 'time' | 'not-triggered' | 'gapped' | 'invalidated' | 'open' | 'pending';

/** One setup the replay found, and how it ended. */
export interface ReplaySetup {
  symbol: string;
  date: string;
  grade: SwingGrade;
  score: number | null;
  trigger: SwingTrigger;
  entry: number | null;
  stop: number | null;
  target: number | null;
  riskPct: number | null;
  regime: RegimeState;
  status: SetupStatus;
  entryDate: string | null;
  exitDate: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
  /** Net of costs, percent. */
  returnPct: number | null;
  /** The move in units of the planned risk. */
  r: number | null;
}

/** A grade's or a setup type's record over the replay. */
export interface ReplayLine {
  setups: number;
  trades: number;
  winRate: number | null;
  expectancyPct: number | null;
  avgR: number | null;
}

/** The scan's thresholds — the Rules tab is written from these, never from copy. */
export interface SwingConfig {
  minAvgTradedValueCr: number;
  minPrice: number;
  minDayMovePct: number;
  idealMaxDayMovePct: number;
  maxDayMovePct: number;
  minCloseLocation: number;
  minVolumeRatio: number;
  strongVolumeRatio: number;
  breakoutLookback: number;
  longBreakoutLookback: number;
  pullbackTolerancePct: number;
  minRiskPct: number;
  maxRiskPct: number;
  targetR: number;
  extendedFromEma20Pct: number;
  horizonDays: number;
  maxChasePct: number;
  lookbackBars: number;
}

export type SetupCounts = Record<SetupStatus, number> & { setups: number; triggered: number };

export interface HouseReplay {
  status: ScanStatus;
  runAt: string | null;
  durationMs: number | null;
  from: string | null;
  to: string | null;
  sessions: number;
  universe: { label: string; size: number; withBars: number };
  counts: SetupCounts;
  byGrade: Record<SwingGrade, ReplayLine>;
  byTrigger: Record<SwingTrigger, ReplayLine>;
  error: string | null;
  /** The backtest in the same shape as a saved strategy's run. */
  run: StrategyRun | null;
  /** The newest setups (up to 200), newest first. */
  setups: ReplaySetup[];
}

export interface HouseStrategyDetail extends HouseStrategySummary {
  /** Null only when the server sent an incomplete config — the Rules tab then says so. */
  config: SwingConfig | null;
  scanDays: ScanDay[];
  replay: HouseReplay | null;
  /** How the replay was done — rendered verbatim. */
  caveats: string[];
}

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'na';
export type CheckGroup = 'liquidity' | 'move' | 'trend' | 'catalyst' | 'plan';

export interface SwingCheck {
  key: string;
  label: string;
  group: CheckGroup;
  status: CheckStatus;
  /** Must pass for the stock to qualify; a soft check moves the score only. */
  hard: boolean;
  /** Rendered verbatim. */
  detail: string;
}

export interface SwingPlan {
  trigger: SwingTrigger;
  entry: number | null;
  stop: number | null;
  target: number | null;
  target3R: number | null;
  riskPerShare: number | null;
  riskPct: number | null;
  rewardRisk: number | null;
  atr: number | null;
  horizonDays: number | null;
}

export interface SwingSetupMetrics {
  close: number | null;
  dayChangePct: number | null;
  closeLocation: number | null;
  volumeRatio: number | null;
  avgTradedValueCr: number | null;
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  high20: number | null;
  high50: number | null;
  rs21Pct: number | null;
  rs63Pct: number | null;
  distanceFromEma20Pct: number | null;
}

/** One stock the evening scan qualified for the next session. */
export interface SwingSetup {
  symbol: string;
  exchange: string;
  name: string;
  sector: string | null;
  fno: boolean;
  score: number | null;
  grade: SwingGrade;
  trigger: SwingTrigger;
  plan: SwingPlan;
  metrics: SwingSetupMetrics;
  checks: SwingCheck[];
}

export type SectorState = 'strong' | 'neutral' | 'weak' | 'unknown';

export interface SectorStrength {
  key: string;
  label: string;
  members: number;
  medianReturn21Pct: number | null;
  breadthAboveEma50Pct: number | null;
  state: SectorState;
}

export interface SwingNearMiss {
  symbol: string;
  name: string;
  score: number | null;
  /** The hard check it failed, in words. */
  failedOn: string;
}

/** One evening's scan — the setups for the next session. */
export interface SwingScan {
  date: string;
  status: ScanStatus;
  runAt: string | null;
  durationMs: number | null;
  regime: MarketRegime;
  sectors: SectorStrength[];
  universe: { label: string; size: number; withBars: number; current: number };
  /** Stocks still standing after each hard check, in order. */
  funnel: { key: string; label: string; remaining: number }[];
  setups: SwingSetup[];
  nearMisses: SwingNearMiss[];
  error: string | null;
}

/** POST /strategies/house/:key/{scan,replay} (admin). */
export interface HouseJobResult {
  jobId: string;
  alreadyQueued: boolean;
}

// ── The intraday platform strategy (Bollinger Mid-Band Thrust, 5-minute) ───────────────
// server/src/modules/intraday-strategies/bb-midband.rules.ts and bb-midband.views.ts.

/** `improved` adds the platform's filters; `base` is the owner's rules exactly as stated. */
export type VariantKey = 'improved' | 'base';
export type UniverseKey = 'nifty50' | 'nifty500';
export type IntradayExit = 'upper-band' | 'stop' | 'mid-band' | 'square-off' | 'end-of-data';
export type StockVerdict = 'works' | 'mixed' | 'avoid' | 'thin';
export type Rejection = 'window' | 'volume' | 'trend' | 'vwap' | 'room' | 'limit' | 'risk';

export interface IntradayTrade {
  symbol: string;
  /** YYYY-MM-DD (IST). */
  day: string;
  /** Unix seconds. */
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  stop: number | null;
  qty: number;
  /** Rupees on the trade's own quantity (₹1 lakh a trade). */
  grossPnl: number;
  charges: number;
  slippage: number;
  netPnl: number;
  /** Net, percent. */
  returnPct: number;
  /** An IntradayExit; kept as sent so a newer reason still reads (as itself). */
  exit: string;
  holdMinutes: number;
  volumeRatio: number | null;
  mfePct: number;
  maePct: number;
}

export interface IntradayStockRow {
  symbol: string;
  trades: number;
  wins: number;
  winRate: number;
  avgReturnPct: number;
  totalReturnPct: number;
  netPnl: number;
  profitFactor: number | null;
  avgWinPct: number;
  avgLossPct: number;
  avgHoldMinutes: number;
  maxLosingStreak: number;
  firstHalfPct: number | null;
  secondHalfPct: number | null;
  verdict: StockVerdict;
  score: number;
}

/** Green crosses → each filter's rejections → trades. */
export interface IntradayFunnel {
  crosses: number;
  green: number;
  rejected: Record<Rejection, number>;
  taken: number;
}

export interface IntradayBucket {
  key: string;
  label: string;
  trades: number;
  winRate: number | null;
  avgReturnPct: number | null;
  totalReturnPct: number;
}

export interface IntradayAnalytics {
  byHour: IntradayBucket[];
  byExit: (IntradayBucket & { sharePct: number })[];
  byWeekday: IntradayBucket[];
  costs: {
    grossPnl: number;
    charges: number;
    slippage: number;
    netPnl: number;
    perTrade: number;
    shareOfGrossPct: number | null;
  };
  hold: { avgMinutes: number; winnersMinutes: number; losersMinutes: number };
  excursion: { avgMfePct: number; avgMaePct: number; winnersGaveBackPct: number | null };
  days: {
    traded: number;
    positive: number;
    positivePct: number | null;
    best: { day: string; netPnl: number } | null;
    worst: { day: string; netPnl: number } | null;
  };
}

export interface LineStats {
  trades: number;
  winRate: number | null;
  avgReturnPct: number | null;
  profitFactor: number | null;
  totalReturnPct: number;
  netPnl: number;
  stocksWorking: number;
}

/** One improvement removed from the improved variant — and what keeping it is worth. */
export interface AblationLine extends LineStats {
  key: string;
  label: string;
  addsAvgReturnPct: number | null;
  addsWinRate: number | null;
  addsTrades: number;
}

export interface VariantRules {
  label: string;
  entry: string[];
  exit: string[];
}

export interface IntradayVariant {
  key: VariantKey;
  label: string;
  line: LineStats;
  /** The backtest in a saved strategy's run shape. */
  run: StrategyRun;
  funnel: IntradayFunnel;
  analytics: IntradayAnalytics;
  /** Every traded stock, ranked (works first). */
  stocks: IntradayStockRow[];
  /** Newest first (the run keeps 300). */
  recentTrades: IntradayTrade[];
  rules: { entry: string[]; exit: string[] };
}

/** The manual re-test on the intraday-strategy queue. */
export interface RefreshJob {
  /** waiting / active / delayed / completed / failed, or null when there is no manual job. */
  state: string | null;
  queuedAt: string | null;
  finishedAt: string | null;
  failedReason: string | null;
  /** Workers listening on the queue now; 0 = nothing will run it; null = unknown. */
  workers: number | null;
}

export interface IntradayData {
  universe: { label: string; size: number };
  stocks: number;
  sessions: number;
  bars: number;
  from: string | null;
  to: string | null;
}

export interface IntradayStrategyDetail extends HouseStrategySummary {
  kind: 'intraday';
  universeKey: UniverseKey;
  universes: { key: UniverseKey; label: string }[];
  job: RefreshJob | null;
  status: ScanStatus | null;
  runAt: string | null;
  durationMs: number;
  error: string | null;
  data: IntradayData | null;
  costs: { notionalInr: number; slippageBps: number } | null;
  variants: Partial<Record<VariantKey, IntradayVariant>>;
  /** Written by the server from the engine's own config, for both variants, even before a run. */
  rules: Record<VariantKey, VariantRules>;
  ablations: AblationLine[];
  /** The candle sync before the run — only its failure is shown. */
  sync: { at: string | null; error: string | null } | null;
  caveats: string[];
}

/** GET /strategies/house/:key/stocks/:symbol — every backtested trade of one stock, newest first. */
export interface StockTradesResult {
  symbol: string;
  variant: VariantKey;
  universe: UniverseKey;
  trades: IntradayTrade[];
}
