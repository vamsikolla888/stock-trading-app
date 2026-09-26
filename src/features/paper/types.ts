// Mirrored from the web client (features/paper-trading/services/paper.service.ts), which
// mirrors server/src/modules/paper-trading. Field names are the server's. The nullables are
// the contract: null means "unknown" and renders as a dash, never as zero.

export type PaperSide = 'BUY' | 'SELL';
export type PaperOrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';

/** The paper account's two separately-funded cash pools. Cash never moves between them. */
export type CashSegment = 'equity' | 'intraday';
export type PaperOrderStatus = 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';

export interface PaperProfile {
  id: string;
  name: string;
  strategy: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PaperChargeBreakdown {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebiFee: number;
  gst: number;
  stampDuty: number;
  /** Delivery SELL only, once per stock per day. */
  dpCharges: number;
  total: number;
}

export interface PaperOrderInput {
  segment: CashSegment;
  /** Omitted resolves to the caller's default profile server-side. */
  profileId?: string;
  exchange: 'NSE' | 'BSE';
  symbol: string;
  side: PaperSide;
  type: PaperOrderType;
  quantity: number;
  limitPrice?: number | null;
  triggerPrice?: number | null;
  /** Stored on the position; informational unless `bracket` is set. */
  targetPrice?: number | null;
  stopPrice?: number | null;
  /** Makes target and stop instructions the exit engine acts on. Buy only. */
  bracket?: boolean;
}

export interface PaperOrder {
  id: string;
  segment: CashSegment;
  exchange: string;
  symbol: string;
  companyName: string | null;
  side: PaperSide;
  type: PaperOrderType;
  quantity: number;
  limitPrice: number | null;
  triggerPrice: number | null;
  /** Set once a stop has fired. */
  triggeredAt?: string | null;
  status: PaperOrderStatus;
  filledPrice: number | null;
  filledAt: string | null;
  charges: number;
  chargesBreakdown?: PaperChargeBreakdown | null;
  borrowedDelta?: number;
  realisedPnl: number | null;
  note: string | null;
  source?: 'MANUAL' | 'STRATEGY' | 'AUTOTRADE';
  exitReason?: string | null;
  exitTriggerLevel?: number | null;
  createdAt: string;
}

/** POST /paper/orders/preview — writes nothing; safe to call as inputs change. */
export interface PaperOrderPreview {
  segment: CashSegment;
  product: 'CNC' | 'MIS';
  companyName?: string | null;
  referencePrice: number;
  pricesAsOf?: string | null;
  wouldRest: boolean;
  triggered?: boolean;
  grossValue: number;
  charges: number;
  chargesBreakdown: PaperChargeBreakdown;
  borrowed?: number;
  marginRequired: number;
  cashDelta?: number;
  cashBefore: number;
  cashAfter: number;
  availableCash: number;
  blockedCash?: number;
  leverage?: number;
  heldQuantity: number;
  sellableQuantity: number;
  maxQuantity: number;
  realisedPnl?: number | null;
  exitCharges?: PaperChargeBreakdown | null;
  roundTripCharges?: number | null;
  breakEvenPrice?: number | null;
  blockedReason: string | null;
  notices: string[];
}

export interface PaperPosition {
  segment: CashSegment;
  product: 'CNC' | 'MIS';
  exchange: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  /** Cost-inclusive average — the break-even price. */
  avgPrice: number;
  ltp: number | null;
  unrealisedPnl: number | null;
  /** Against own funds, not the notional. */
  unrealisedPct: number | null;
  currentValue: number | null;
  investedValue: number;
  borrowedAmount?: number;
  ownFunds?: number;
  leverage?: number | null;
  targetPrice?: number | null;
  stopPrice?: number | null;
  /** Whether the exit engine acts on the levels. False means they are reminders. */
  autoExit?: boolean;
  /** A leveraged position close to forced closure on the next sweep. */
  marginCall?: boolean;
  openedAt?: string;
}

export interface PaperPortfolio {
  segment: CashSegment;
  product?: 'CNC' | 'MIS';
  segmentLabel: string;
  leverage?: number;
  startingCapital: number;
  cash: number;
  investedValue: number;
  currentValue: number;
  borrowed?: number;
  equity?: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalPnl: number;
  totalPnlPct: number;
  totalCharges?: number;
  tradeCount?: number;
  closedTradeCount?: number;
  positions: PaperPosition[];
  openOrders: PaperOrder[];
  marketOpen: boolean;
  intradayEntryBlockedReason?: string | null;
  minutesToSquareOff?: number | null;
  marginShortfall?: number;
  pricesAsOf: string | null;
  resetAt?: string | null;
}

export interface SegmentSummary {
  segment: CashSegment;
  label: string;
  product: 'CNC' | 'MIS';
  leverage?: number;
  startingCapital: number;
  cash: number;
  deployed?: number;
  borrowed?: number;
  currentValue: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalCharges?: number;
  equity: number;
  totalPnl: number;
  totalPnlPct: number | null;
  positionCount: number;
  openOrderCount: number;
  utilisationPct?: number;
  marginShortfall?: number;
  resetAt?: string | null;
}

/** GET /paper/segments */
export interface SegmentOverview {
  segments: SegmentSummary[];
  /** Display only — none of this total is spendable in one pool. */
  combined: {
    startingCapital: number;
    cash: number;
    equity: number;
    realisedPnl: number;
    unrealisedPnl: number;
    totalCharges: number;
    totalPnl: number;
  };
  marketOpen: boolean;
  pricesAsOf: string | null;
  unpricedPositions?: number;
  caveats: string[];
}

export interface IntradaySweepResult {
  checked: number;
  squaredOff: number;
  marginCalled: number;
  staleClosed: number;
  unpriced: number;
  mode: 'hard-cutoff' | 'margin-watch' | 'idle';
}

// ── Performance (reconstructed equity curve) ─────────────────────────────────────────────

export interface EquityPointDay {
  date: string;
  /** Unix seconds at UTC midnight of `date`. */
  t: number;
  cash: number;
  holdingsValue: number | null;
  /** NULL = unknown. A gap, never cash and never 0. */
  equity: number | null;
  totalPnl: number | null;
  fillCount: number;
}

export interface EquityDrawdown {
  depthPct: number;
  durationDays: number;
  /** NULL = never recovered. */
  recoveryDays: number | null;
  peakDate: string;
  peakEquity: number;
  troughDate: string;
  troughEquity: number;
}

export interface ClosedTrade {
  orderId: string;
  exchange: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  closedOn: string;
  closedAt: string;
  exitPrice: number;
  entryBreakEven: number | null;
  charges: number;
  realisedPnl: number;
  returnPct: number | null;
  /** NULL = not determinable under weighted-average cost. */
  holdingDays: number | null;
  note: string | null;
}

export interface ClosedTradeStats {
  closedTradeCount: number;
  wins: number;
  losses: number;
  winRatePct: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  largestWin: number | null;
  largestLoss: number | null;
  expectancy: number | null;
  grossProfit: number;
  grossLoss: number;
  /** NULL means no losing trades — never infinity, never 0. */
  profitFactor: number | null;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
}

export interface PaperPerformance {
  scope: 'equity-delivery';
  past: {
    windowDays: number;
    fromDate: string;
    toDate: string;
    startingCapital: number;
    openingEquity: number | null;
    closingEquity: number | null;
    netPnl: number | null;
    netPnlPct: number | null;
    peakEquity: number | null;
    peakEquityDate: string | null;
    drawdown: EquityDrawdown | null;
    bestDay: { date: string; changePct: number } | null;
    worstDay: { date: string; changePct: number } | null;
    chargeDragPct: number | null;
  };
  equityCurve: EquityPointDay[];
  curveUnavailableReason: string | null;
  curveComplete: boolean;
  barsAsOf: string | null;
  today: string;
  capital: {
    startingCapital: number;
    deployedAtCost: number;
    cash: number;
    chargesPaid: number;
    realisedPnl: number;
    boughtValue: number;
    soldValue: number;
  };
  activity: {
    fillCount: number;
    buyFills: number;
    sellFills: number;
    rejectedCount: number;
    cancelledCount: number;
    restingCount: number;
    tradingDays: number;
    pricedDays: number;
    staleMarkDays: number;
  };
  closedTrades: ClosedTrade[];
  closedTradeStats: ClosedTradeStats;
  resetAt: string | null;
  windowClippedByReset: boolean;
  intradayActivityPresent?: boolean;
  methodology: string[];
}

// ── Analytics (every rupee) ──────────────────────────────────────────────────────────────

export type ReconcileStatus = 'exact' | 'rounding' | 'mismatch';
export const CHARGE_COMPONENTS = [
  'brokerage',
  'stt',
  'exchangeTxn',
  'sebiFee',
  'gst',
  'stampDuty',
  'dpCharges',
] as const;
export type ChargeComponent = (typeof CHARGE_COMPONENTS)[number];

export interface WalletIdentity {
  netCapital: number;
  realisedPnl: number;
  unrealisedPnl: number;
  expected: number;
  walletValue: number;
  residual: number;
  status: ReconcileStatus;
  roundingAllowance: number;
}

export interface ChargeTotals {
  byComponent: Record<ChargeComponent, number>;
  unitemised: number;
  lineRounding: number;
  buy: number;
  sell: number;
  total: number;
}

export type DistributionCategory =
  'equity-holdings' | 'equity-cash' | 'intraday-positions' | 'intraday-cash';

export interface DistributionCategoryView {
  category: DistributionCategory;
  segment: CashSegment;
  label: string;
  value: number;
  /** Share of the wallet; null when negative. */
  pct: number | null;
  lines: {
    key: string;
    label: string;
    symbol: string | null;
    exchange: string | null;
    value: number;
    priced: boolean;
  }[];
}

export interface AnalyticsPool {
  segment: CashSegment;
  label: string;
  openingCapital: number;
  capitalAdded: number;
  netCapital: number;
  cash: number;
  walletValue: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totals: { bought: number; sold: number };
  reconciliation: { status: ReconcileStatus; difference: number };
}

export type LedgerKind = 'OPENING' | 'CAPITAL' | 'BUY' | 'SELL';

export interface LedgerEntry {
  id: string;
  segment: CashSegment;
  kind: LedgerKind;
  at: string | null;
  exchange: string | null;
  symbol: string | null;
  quantity: number | null;
  price: number | null;
  tradeValue: number;
  chargesTotal: number;
  cashChange: number;
  cashAfter: number;
  realisedPnl: number | null;
  source: string | null;
  exitReason: string | null;
  note: string | null;
}

export interface PaperAnalytics {
  profileId: string;
  asOf: string;
  pricesAsOf: string | null;
  marketOpen: boolean;
  wallet: WalletIdentity & { returnPct: number | null };
  pools: AnalyticsPool[];
  distribution: {
    total: number;
    categories: DistributionCategoryView[];
    hasNegative: boolean;
    negativeTotal: number;
    unpricedPositions: number;
  };
  charges: ChargeTotals;
  trades: {
    closingFills: number;
    winners: number;
    losers: number;
    winRatePct: number | null;
    grossProfit: number;
    grossLoss: number;
    profitFactor: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    expectancy: number | null;
    chargesPctOfGrossProfit: number | null;
  };
  /** Oldest first. */
  ledger: LedgerEntry[];
  methodology: string[];
}

// ── Wallet (Settings → Paper wallet) ─────────────────────────────────────────────────────

export interface WalletPool {
  segment: CashSegment;
  label: string;
  capital: number;
  openingCapital: number;
  capitalAdded: number;
  cash: number;
  blockedCash: number;
  availableCash: number;
  /** The lowest the wallet can be set to right now (only free cash can be withdrawn). */
  minCapital: number;
  maxCapital: number;
  resetAt: string | null;
}

export interface PaperWallet {
  profileId: string;
  pools: WalletPool[];
  changes: {
    id: string;
    segment: CashSegment;
    amount: number;
    capitalBefore: number;
    capitalAfter: number;
    at: string;
  }[];
  total: number;
}

// ── Auto-trade ───────────────────────────────────────────────────────────────────────────

export type CandidateSource = 'recommendations' | 'strategy';

export interface AutoTradeConfig {
  enabled: boolean;
  candidateSource?: CandidateSource;
  strategyId?: string | null;
  /** Strategy source only: a pre-market quant + AI review acts as a risk veto. */
  quantAiReviewEnabled?: boolean;
  quantMinProbabilityPct?: number;
  targetAtrMultiple?: number;
  stopAtrMultiple?: number;
  deployPct: number;
  maxPositions: number;
  maxPerPositionPct: number;
  minCompositeScore: number;
  respectReviewVerdict: boolean;
  dailyLossHaltPct: number;
  drawdownHaltPct: number;
  defaultMaxHoldDays: number;
  exitOnTarget: boolean;
  exitOnStop: boolean;
  exitOnMaxHold: boolean;
}

export interface AutoTradeConfigResponse {
  configured: boolean;
  config: AutoTradeConfig;
  peakEquity: number | null;
  haltedReason: string | null;
  haltedAt: string | null;
  lastRunAt: string | null;
}

export interface AutoTradeEvent {
  orderId: string;
  side: PaperSide;
  exchange: string;
  symbol: string;
  companyName: string | null;
  quantity: number;
  price: number | null;
  charges: number;
  status: string;
  at: string;
  note: string | null;
  exitReason: string | null;
  exitTriggerLevel: number | null;
  realisedPnl: number | null;
}

export interface AutoTradeRoundTrip {
  exchange: string;
  symbol: string;
  companyName: string | null;
  entry: AutoTradeEvent;
  exit: AutoTradeEvent | null;
  rationale: string | null;
  reviewVerdict: string | null;
  compositeScore: number | null;
  targetPrice: number | null;
  stopPrice: number | null;
  holdingDays: number | null;
  realisedPnl: number | null;
  returnPct: number | null;
  currentPrice: number | null;
  unrealisedPnl: number | null;
  status: 'OPEN' | 'CLOSED';
}

export interface AutoTradeActivity {
  enabled: boolean;
  configured: boolean;
  haltedReason: string | null;
  haltedAt: string | null;
  lastRunAt: string | null;
  events: AutoTradeEvent[];
  roundTrips: AutoTradeRoundTrip[];
  openCount: number;
  closedCount: number;
  skippedToday: { reason: string; count: number; symbols: string[]; detail: string }[];
  caveats: string[];
}

export interface AutoTradeRunResult {
  ran: boolean;
  reason: string | null;
  date: string;
  candidatesConsidered: number;
  ordersPlaced: number;
  ordersRejected: number;
  exitsPlaced: number;
  skipped: { symbol: string; reason: string; detail: string }[];
  haltedBy: string | null;
  dryRun: boolean;
}

/** POST /paper/autotrade/ai-review — prepares today's review; never places an order. */
export interface AutoTradeAiReviewResult {
  prepared: boolean;
  reason: string | null;
  date: string;
  candidates: number;
  selected: number;
  provider: string | null;
  model: string | null;
}

/** The slice of GET /strategies the auto-trade source picker needs. */
export interface StrategyOption {
  id: string;
  name: string;
  resultsStale: boolean;
  /** Null until a backtest has run — "never run" and "found nothing" mean opposite things. */
  metrics: {
    totalTrades: number;
    winRate: number;
    totalReturnPct?: number;
    maxDrawdownPct?: number;
  } | null;
}

/** GET /market/quotes — used for the delivery book's previous closes (1-day returns). */
export interface QuoteRow {
  exchange: string;
  symbol: string;
  ltp: number | null;
  prevClose: number | null;
}
