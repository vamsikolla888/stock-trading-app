/**
 * The index-options bot (Agents › Index trading), as the app reads it after normalisation
 * (lib/normalize.ts). Two server modules feed it, both admin-only:
 *   - /agents/index-trading/* (server/src/modules/agents) — read-only analytics over the bot's
 *     records: money in rupees, rates in PERCENT (0–100);
 *   - /ai-autotrade/* (server/src/modules/ai-autotrade) — the bot's own controls and raw rows,
 *     whose probabilities are FRACTIONS (normalised to percent here, so one view type serves both).
 * Every field exists after normalisation; unknown figures are null, never invented.
 */

export type ModeFilter = 'all' | 'paper' | 'live';
export type RangeKey = 'today' | '7d' | '30d' | '90d' | 'all';
export type BotMode = 'paper' | 'live';

export interface EdgeView {
  samples: number;
  wins: number;
  /** Percent (0–100). */
  observedWinRate: number;
  /** Wilson 95% lower bound of the win rate, percent. */
  wilsonLower95: number;
  /** Win rate needed to break even after estimated charges, percent. */
  breakEvenRate: number;
  /** Rupees per trade at the lower bound. */
  expectedNetAtLowerBound: number | null;
  /** Whether the risk engine let it through; null when not recorded. */
  allowed: boolean | null;
}

export interface OrderView {
  id: string | null;
  status: string | null;
  price: number | null;
  quantity: number | null;
  at: string | null;
}

export type TradePhase = 'open' | 'closed' | 'review' | 'rejected' | 'resolved';
export type ExitReason = 'target' | 'stop' | 'time';

export interface TradeRow {
  intentId: string;
  day: string;
  mode: BotMode;
  underlying: string;
  tradingSymbol: string;
  /** CE / PE. */
  kind: string;
  lots: number | null;
  quantity: number | null;
  plannedEntry: number | null;
  stop: number | null;
  target: number | null;
  rewardRisk: number | null;
  entryPrice: number | null;
  exitPrice: number | null;
  /** Live exits are a broker OCO: the price is derived from Groww's realised P&L. */
  exitPriceDerived: boolean;
  status: string;
  phase: TradePhase;
  exitReason: ExitReason | null;
  gross: number | null;
  charges: number | null;
  net: number | null;
  enteredAt: string | null;
  exitedAt: string | null;
  holdMinutes: number | null;
  pnlSource: 'paper-estimate' | 'broker-realised';
  reason: string;
  edge: EdgeView | null;
  entryOrder: OrderView | null;
  exitOrder: OrderView | null;
  smartOrderStatus: string | null;
}

export interface TradeStats {
  entries: number;
  closed: number;
  open: number;
  review: number;
  rejected: number;
  wins: number;
  losses: number;
  winRate: number | null;
  gross: number | null;
  charges: number | null;
  net: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  best: number | null;
  worst: number | null;
  maxDrawdown: number | null;
  avgHoldMinutes: number | null;
  streak: { kind: 'win' | 'loss'; length: number } | null;
  exits: Record<ExitReason, number>;
}

export interface DailyPoint {
  /** IST calendar day, YYYY-MM-DD. */
  day: string;
  net: number;
  trades: number;
  cumulative: number;
}

export interface Breakdown {
  key: string;
  label: string;
  trades: number;
  wins: number;
  winRate: number | null;
  net: number;
}

export interface ArgumentView {
  underlying: string | null;
  /** The researcher's own 0–100 score, not a probability. */
  conviction: number | null;
  evidence: string[];
  challenge: string;
  reason: string;
}

export type TraderAction = 'BUY_CALL' | 'BUY_PUT' | 'HOLD';

export interface DebateView {
  decision: {
    action: TraderAction;
    underlying: string | null;
    /** Percent of premium. */
    stopPct: number | null;
    targetPct: number | null;
    confidence: number | null;
    reason: string;
  };
  bullish: ArgumentView | null;
  bearish: ArgumentView | null;
  rebuttal: ArgumentView | null;
}

export type FunnelKey = 'scanned' | 'debated' | 'proposed' | 'checked' | 'edge' | 'ordered';
export type RunOutcome = 'ordered' | 'hold' | 'error' | 'running';

export interface TraceStep {
  step: string;
  /** true passed · false stopped here · null noted (a test scan reports and carries on). */
  ok: boolean | null;
  detail: string;
  at: string | null;
}

/** One scan — a scheduled or manual check, or a test scan (`dryRun`). */
export interface RunView {
  id: string;
  at: string | null;
  status: string;
  outcome: RunOutcome;
  stage: FunnelKey;
  reason: string;
  /** Why it held, grouped (decision log only; null on a raw run). */
  group: { key: string; label: string } | null;
  action: TraderAction | null;
  underlying: string | null;
  confidence: number | null;
  edge: EdgeView | null;
  debate: DebateView | null;
  mode: BotMode | null;
  dryRun: boolean;
  trace: TraceStep[];
}

export interface FunnelStage {
  key: FunnelKey;
  label: string;
  hint: string;
  count: number;
  /** Percent of the stage before; null for the first. */
  ofPrevious: number | null;
}

export interface ReasonGroup {
  key: string;
  label: string;
  count: number;
  /** Percent of finished scans that did not trade. */
  share: number;
  latest: { reason: string; at: string | null };
}

export interface BotSummarySettings {
  enabled: boolean;
  mode: BotMode;
  cadenceMinutes: number | null;
  maxTradesPerDay: number | null;
  maxDailyLoss: number | null;
  maxRiskPerTrade: number | null;
  maxLots: number | null;
  configured: boolean;
}

/** GET /agents/index-trading/overview */
export interface IndexOverview {
  mode: ModeFilter;
  range: RangeKey;
  settings: BotSummarySettings;
  aiConfigured: boolean;
  /**
   * Whether a scan can reach the debate NOW — a configured AI service can still be down. Null
   * from a server that does not report it (then only `aiConfigured` is known).
   */
  aiReady: boolean | null;
  /** Why it cannot, in the server's words. */
  aiReason: string | null;
  stats: TradeStats;
  today: { entries: number; net: number | null };
  daily: DailyPoint[];
  byUnderlying: Breakdown[];
  byKind: Breakdown[];
  byExit: Breakdown[];
  byHour: Breakdown[];
  funnel: { stages: FunnelStage[]; running: number };
  reasons: ReasonGroup[];
  latestRun: RunView | null;
  open: TradeRow[];
  attention: TradeRow[];
  caveat: string | null;
}

/** GET /agents/index-trading/trades */
export interface IndexTrades {
  mode: ModeFilter;
  range: RangeKey;
  rows: TradeRow[];
  stats: TradeStats;
  truncated: boolean;
  caveat: string | null;
}

export type DecisionOutcome = 'all' | 'ordered' | 'hold' | 'error';

export interface DecisionCounts {
  all: number;
  ordered: number;
  hold: number;
  error: number;
  running: number;
}

/** GET /agents/index-trading/decisions — one page. */
export interface IndexDecisions {
  runs: RunView[];
  nextBefore: string | null;
  counts: DecisionCounts;
  reasons: ReasonGroup[];
}

/* ── controls (/ai-autotrade) ── */

/** The numeric settings PUT /ai-autotrade/settings takes (zod-validated, `.strict()`). */
export interface BotNumbers {
  cadenceMinutes: number;
  maxLots: number;
  maxPremium: number;
  maxRiskPerTrade: number;
  /** Percent of the premium a stop may risk, 5–10. The server's hard cap is 10. */
  maxStopLossPct: number;
  maxDailyLoss: number;
  maxTradesPerDay: number;
  minFutureVolume: number;
  minOptionVolume: number;
  minFutureMovePct: number;
  minRewardRisk: number;
  minNetTarget: number;
  minBacktestSamples: number;
  minProbabilityEdge: number;
}

export type BotNumberKey = keyof BotNumbers;

export interface BotSettings extends BotNumbers {
  enabled: boolean;
  /** The EFFECTIVE mode — a stored 'live' without an approval runs as test. */
  mode: BotMode;
}

/** A row of status.recent — a raw AutoIntent. */
export interface BotIntent {
  intentId: string;
  tradingSymbol: string;
  status: string;
  mode: BotMode;
  entry: number | null;
  stop: number | null;
  target: number | null;
  netPnl: number | null;
  createdAt: string | null;
}

/** GET /ai-autotrade/status */
export interface BotStatus {
  settings: BotSettings;
  readiness: {
    aiConfigured: boolean;
    /** The AI service answers now (null: the server does not say). */
    aiReady: boolean | null;
    aiReason: string | null;
    liveAvailable: boolean;
    /** A build-time lock on the server: live cannot be deployed at all. */
    paperOnly: boolean;
    note: string | null;
  };
  mode: BotMode;
  storedLiveUnapproved: boolean;
  liveApproved: { at: string | null; by: string | null } | null;
  testStartedAt: string | null;
  testResults: { since: string | null; stats: TradeStats; lastEntryAt: string | null };
  /** The exact words POST /deploy-live wants typed. Null on a server that does not send it. */
  deployPhrase: string | null;
  month: string | null;
  monthEstimatedNet: number | null;
  afterAssumedApiFee: number | null;
  assumedMonthlyGrowwApiFee: number | null;
  pnlCaveat: string | null;
  recent: BotIntent[];
  runs: RunView[];
  dryRuns: RunView[];
}

/** POST /ai-autotrade/run */
export interface RunNowResult {
  status: string;
  reason: string | null;
}

/* ── backtest (/agents/index-trading/backtest) ── */

export type BacktestUnderlying = 'NIFTY' | 'BANKNIFTY';
export type BacktestDays = 30 | 60 | 90;

/** One replayed trade: the first qualifying hourly setup of a session, on Groww's candles. */
export interface BacktestTrade {
  /** IST calendar day, YYYY-MM-DD. */
  day: string;
  signalAt: string | null;
  entryAt: string | null;
  exitAt: string | null;
  /** The index move from the previous close that triggered it, percent. */
  movePct: number | null;
  spot: number | null;
  kind: 'CE' | 'PE';
  expiry: string | null;
  strike: number | null;
  growwSymbol: string;
  entry: number;
  exit: number;
  /** Null when the server names an exit this app does not know. */
  exitReason: ExitReason | null;
  /** Gross premium return, percent. */
  returnPct: number;
  volumeAtEntry: number | null;
}

export interface BacktestSummary {
  trades: number;
  wins: number;
  losses: number;
  flats: number;
  /** Percent (0–100). */
  winRate: number | null;
  averageReturnPct: number | null;
  /** Compounded gross premium return over every trade, percent. */
  grossReturnPct: number;
  maxDrawdownPct: number;
  profitFactor: number | null;
  exits: Record<ExitReason, number>;
}

/** After each trade: its return and the compounded equity, starting from 100. */
export interface BacktestPoint {
  day: string;
  returnPct: number;
  equity: number;
}

export interface IndexBacktest {
  underlying: BacktestUnderlying;
  requestedDays: BacktestDays;
  period: { from: string | null; to: string | null; sessions: number };
  source: { name: string; url: string | null; generatedAt: string | null; cached: boolean };
  rules: {
    scanTimes: string[];
    signal: string | null;
    entry: string | null;
    stopPct: number | null;
    targetPct: number | null;
    maxHoldMinutes: number | null;
    minOptionVolume: number | null;
  };
  coverage: {
    setups: number;
    trades: number;
    noSignal: number;
    missingContract: number;
    missingOptionData: number;
  };
  summary: BacktestSummary;
  curve: BacktestPoint[];
  trades: BacktestTrade[];
  /** The server's own limits of the replay, verbatim. */
  caveats: string[];
}
