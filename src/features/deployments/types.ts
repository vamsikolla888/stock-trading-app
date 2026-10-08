/**
 * Strategy DEPLOYMENTS — a strategy running on the caller's paper wallet or live broker.
 *
 * Two server engines answer the same questions in slightly different shapes, and the app reads
 * both into ONE model here (lib/normalize.ts) so one tab and one sheet serve every strategy:
 *
 *   swing     server/src/modules/swing-deployments — a user's own strategy
 *             (/strategies/:id/deployments) and the platform's Institutional Breakout Swing
 *             (/strategies/house/institutional-breakout-swing/deployments). Daily bars.
 *   intraday  server/src/modules/intraday-strategies/deployment.* — the platform's Bollinger
 *             Mid-Band Thrust (/strategies/house/bb-midband-5m/deployments). 5-minute bars, with
 *             a universe, a rule variant and a daily loss limit of its own.
 *
 * Fields one engine does not have are null (or empty) on the other's rows.
 */

export type DeployMode = 'paper' | 'live';
export type DeployStatus = 'active' | 'paused' | 'stopped';
export type RunnerState = 'running' | 'market-closed' | 'not-running' | 'stopped';
export type BrokerId = 'mstock' | 'groww';
export type DeployEngine = 'swing' | 'intraday';

/** The platform strategies that can be deployed. */
export type DeployPlatformKey = 'institutional-breakout-swing' | 'bb-midband-5m';
export const SWING_PLATFORM_KEY: DeployPlatformKey = 'institutional-breakout-swing';
export const INTRADAY_PLATFORM_KEY: DeployPlatformKey = 'bb-midband-5m';
export const DEPLOY_PLATFORM_KEYS: readonly DeployPlatformKey[] = [
  SWING_PLATFORM_KEY,
  INTRADAY_PLATFORM_KEY,
];

/** Whose deployments: a user's own strategy, or a platform strategy by key. */
export type DeployTarget =
  { kind: 'strategy'; strategyId: string } | { kind: 'platform'; key: DeployPlatformKey };

/** The intraday strategy's rule variants and universes (server: bb-midband.rules.ts). */
export type VariantKey = 'improved' | 'base';
export type UniverseKey = 'nifty50' | 'nifty500';
export type StockVerdict = 'works' | 'mixed' | 'avoid' | 'thin';

/** A trade's life: planned / waiting are swing-only (an order for the next open, a resting
 *  buy-above trigger); cancelled is a plan that never became a trade. */
export type DeployTradeStatus =
  | 'planned'
  | 'waiting'
  | 'pending-entry'
  | 'open'
  | 'pending-exit'
  | 'closed'
  | 'cancelled'
  | 'failed';

/** Why a trade ended — swing: stop / target / signal / time; intraday: upper-band / stop /
 *  mid-band / square-off / loss-limit; both: manual / stopped. */
export type DeployExitReason =
  | 'stop'
  | 'target'
  | 'signal'
  | 'time'
  | 'upper-band'
  | 'mid-band'
  | 'square-off'
  | 'loss-limit'
  | 'manual'
  | 'stopped';

export type DeployEventKind =
  | 'start'
  | 'plan'
  | 'signal'
  | 'skip'
  | 'order'
  | 'fill'
  | 'exit'
  | 'cancel'
  | 'error'
  | 'halt'
  | 'info';

/** A swing deployment's last evening plan. */
export interface PlanSummary {
  barDate: string;
  forSession: string;
  at: string | null;
  entries: number;
  exits: number;
  skipped: number;
  signals: number;
  note: string | null;
}

export interface Deployment {
  id: string;
  engine: DeployEngine;
  source: 'strategy' | 'platform';
  strategyKey: string;
  strategyId: string | null;
  strategyName: string | null;
  mode: DeployMode;
  status: DeployStatus;
  /** Swing: empty = every stock the strategy's rules allow. Intraday: never empty. */
  symbols: string[];
  capitalPerTrade: number;
  maxOpenPositions: number;
  maxEntriesPerDay: number;
  broker: BrokerId | null;
  startedAt: string;
  stoppedAt: string | null;
  liveApprovedAt: string | null;
  lastTickAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  runner: { state: RunnerState; message: string | null };
  /* swing */
  lastPlan: PlanSummary | null;
  /** The strategy's rules were edited after this deployment took its copy. */
  rulesChanged: boolean;
  /* intraday */
  variant: VariantKey | null;
  universe: UniverseKey | null;
  maxEntriesPerStockPerDay: number | null;
  dailyLossLimit: number | null;
  haltedToday: boolean;
  haltReason: string | null;
}

export interface DeployTrade {
  id: string;
  symbol: string;
  status: DeployTradeStatus;
  qty: number;
  stop: number | null;
  entryPrice: number | null;
  entryAt: string | null;
  exitReason: DeployExitReason | null;
  exitPrice: number | null;
  exitAt: string | null;
  grossPnl: number | null;
  charges: number | null;
  netPnl: number | null;
  returnPct: number | null;
  ltp: number | null;
  unrealised: number | null;
  unrealisedPct: number | null;
  error: string | null;
  signalClose: number | null;
  /* swing */
  signalDate: string | null;
  entryFrom: string | null;
  lastSession: string | null;
  trigger: number | null;
  target: number | null;
  refPrice: number | null;
  entryDay: string | null;
  sessionsHeld: number | null;
  exitPlan: { reason: DeployExitReason; decidedOn: string | null; level: number | null } | null;
  cancelReason: string | null;
  /* intraday */
  day: string | null;
  volumeRatio: number | null;
  /** Reached the upper band — sells on the next red candle. */
  armed: boolean;
}

export interface DeployEvent {
  at: string;
  kind: DeployEventKind;
  symbol: string | null;
  message: string;
}

export interface DeployStats {
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  grossPnl: number;
  charges: number;
  netPnl: number;
  avgReturnPct: number | null;
  best: number | null;
  worst: number | null;
  /** Swing: average sessions from entry to exit. */
  avgSessionsHeld: number | null;
  /** Intraday: sessions with a closed trade. */
  sessions: number | null;
  /** Orders the paper book or the broker refused. */
  failed: number;
  /** Swing: plans that never became trades. */
  cancelled: number;
  byExit: Record<string, number>;
}

export interface DeploymentDetail {
  deployment: Deployment;
  /** Swing: the money in the market now. */
  money: { invested: number; unrealised: number; unpriced: number } | null;
  /** Intraday: today's money and limits. */
  today: {
    realised: number;
    unrealised: number;
    total: number;
    openPositions: number;
    closedToday: number;
    entries: number;
    refused: number;
  } | null;
  stats: DeployStats;
  /** The backtest's own per-trade figure on the deployed stocks. */
  expected: {
    avgReturnPct: number;
    winRate: number | null;
    trades: number;
    /** Swing: measured on the rules being traded. */
    current: boolean | null;
    stocks: number | null;
  } | null;
  positions: DeployTrade[];
  /** Swing: orders for the next open and resting triggers. Empty for intraday. */
  orders: DeployTrade[];
  trades: DeployTrade[];
  events: DeployEvent[];
  quotesAsOf: string | null;
}

export interface LiveLimits {
  maxOrderValue: number;
  maxOpenPositions: number;
  maxDailyLoss: number;
  maxOrdersPerSymbolPerDay: number;
}

export interface BrokerLink {
  broker: BrokerId;
  connected: boolean;
  label: string | null;
}

export interface DeployDefaults {
  capitalPerTrade: number;
  maxOpenPositions: number;
  maxEntriesPerDay: number;
  /** Intraday only. */
  dailyLossLimit: number | null;
}

/** A backtested stock the picker offers (swing: the strategy's run; intraday: the page's). */
export interface DeployStockRow {
  symbol: string;
  trades: number;
  winRate: number | null;
  avgReturnPct: number | null;
  profitFactor: number | null;
  verdict: StockVerdict | null;
}

export interface DeployLive {
  limits: LiveLimits;
  masterSwitch: boolean;
  safeMode: boolean;
  brokers: BrokerLink[];
  /** The typed confirmation, exactly as the server wants it ("DEPLOY LIVE"); null if missing. */
  phrase: string | null;
  /** A user's strategy goes live only on rules a finished backtest measured. */
  needsBacktest: boolean;
}

export interface DeploymentList {
  engine: DeployEngine;
  deployments: Deployment[];
  defaults: Record<DeployMode, DeployDefaults>;
  /** Swing only — what is being deployed, in words, and its backtest. */
  strategy: {
    source: 'strategy' | 'platform';
    name: string;
    howItTrades: string[];
    universe: string;
    exits: string[] | null;
    backtest: {
      ran: boolean;
      current: boolean;
      avgReturnPct: number | null;
      winRate: number | null;
      trades: number;
    };
    stocks: DeployStockRow[];
  } | null;
  live: DeployLive;
}

/** One of the caller's current deployments (GET /strategies/deployments — daily engine only). */
export interface MyDeployment {
  id: string;
  strategyKey: string;
  strategyId: string | null;
  mode: DeployMode;
  status: DeployStatus;
}

/** The body of POST …/deployments. Intraday-only fields are left out for a swing target. */
export interface DeployInput {
  mode: DeployMode;
  symbols: string[];
  capitalPerTrade: number;
  maxOpenPositions: number;
  maxEntriesPerDay: number;
  variant?: VariantKey;
  universe?: UniverseKey;
  dailyLossLimit?: number;
  broker?: BrokerId;
  confirm?: string;
}

export interface SquareOffResult {
  /** Sold now. */
  squaredOff: number;
  /** Swing, market closed: to be sold at the next open. */
  atNextOpen: number;
}
