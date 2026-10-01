// Mirrored from the web client (features/paper-trading/services/paper.service.ts), which
// mirrors server/src/modules/paper-trading. Field names are the server's. The nullables are
// the contract: null means "unknown" and renders as a dash, never as zero.

export type PaperSide = 'BUY' | 'SELL';
export type PaperOrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';

/**
 * The paper account's two PRODUCTS — delivery (CNC) and intraday (MIS). ONE wallet funds both
 * (server paper-wallet.service.ts); each keeps its own P&L category. F&O is not part of the paper
 * account — the F&O sandbox has its own pool (features/derivatives).
 */
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
  /** SELL: net of both sides' charges. */
  realisedPnl: number | null;
  /** SELL: at the trade price, before charges. Null on a sell booked before it was recorded. */
  grossPnl?: number | null;
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
  /** Own money committed on a buy — THE figure the wallet's cash is checked against. */
  marginRequired: number;
  cashDelta?: number;
  /** The WALLET's cash — one wallet funds both products. */
  cashBefore: number;
  cashAfter: number;
  /** Cash not held by other open buy orders — what a new buy may spend. */
  availableCash: number;
  blockedCash?: number;
  leverage?: number;
  /** availableCash × this product's leverage. Optional for an older server. */
  buyingPower?: number;
  heldQuantity: number;
  sellableQuantity: number;
  maxQuantity: number;
  /** SELL only: at the trade price, before charges. */
  grossPnl?: number | null;
  /** SELL only: net of this sell's charges and the buy charges of the shares it closes. */
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
  /**
   * The price the shares were BOUGHT at — charges excluded, as a broker shows it, so a stock
   * bought and not yet moved shows ₹0.00. On a legacy row (`basisTracked: false`) it still
   * includes the buy charges.
   */
  avgPrice: number;
  /** Buy-side charges paid on the held shares. Optional for an older server. */
  buyCharges?: number;
  /** (cost + buy charges) / quantity — what recovers everything paid so far. */
  breakEvenPrice?: number;
  basisTracked?: boolean;
  ltp: number | null;
  /** The snapshot's previous close — today's move works after hours too. */
  prevClose?: number | null;
  /** Shares of the row bought TODAY (IST) and their trade value — measured from the price paid. */
  todayBoughtQty?: number;
  todayBuyValue?: number;
  /** Market value − cost at the trade price: BEFORE charges. */
  unrealisedPnl: number | null;
  /** Against own funds, not the notional. */
  unrealisedPct: number | null;
  /** unrealisedPnl − buyCharges. */
  netUnrealisedPnl?: number | null;
  currentValue: number | null;
  /** quantity × avgPrice. */
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

/** The ONE wallet both products trade from. */
export interface WalletSummary {
  /** Every rupee put in: opening capital + wallet changes. */
  capital: number;
  cash: number;
  /** Held by resting BUY orders of either product — still inside `cash`. */
  blockedCash: number;
  /** cash − blockedCash: what a new order can draw on. */
  availableCash: number;
  holdingsValue: number;
  borrowed: number;
  /** cash + holdingsValue − borrowed. */
  value: number;
  realisedPnl: number;
  unrealisedPnl: number;
  charges: number;
  /** realisedPnl + unrealisedPnl − charges. */
  netPnl: number;
  netPnlPct: number | null;
  /** availableCash × the MIS leverage. */
  intradayBuyingPower: number;
  /** Negative cash as a positive number — only ever after a forced intraday square-off. */
  marginShortfall: number;
  resetAt: string | null;
  /** When two old separately-funded pools were merged into this wallet. */
  mergedAt: string | null;
}

/** One product's book and P&L category. */
export interface ProductSummary {
  segment: CashSegment;
  label: string;
  product: 'CNC' | 'MIS';
  leverage: number;
  positionCount: number;
  openOrderCount: number;
  /** Open positions at the price paid. */
  investedValue: number;
  /** investedValue − borrowed. */
  ownFunds: number;
  borrowed: number;
  currentValue: number;
  /** Before charges. */
  unrealisedPnl: number;
  /** Closed trades, before charges. */
  realisedPnl: number;
  /** Closed trades after both sides' charges, as booked. */
  realisedNetPnl: number;
  /** Closed trades booked TODAY (IST), before charges. Optional for an older server. */
  todayRealisedPnl?: number;
  charges: number;
  openBuyCharges: number;
  netPnl: number;
  blockedCash: number;
  /** EVERY fill, buys included. Never a denominator — see closedTradeCount. */
  tradeCount: number;
  closedTradeCount: number;
}

/** GET /paper/portfolio — one product's book, with the shared wallet it draws on. */
export interface PaperPortfolio {
  segment: CashSegment;
  product: 'CNC' | 'MIS';
  segmentLabel: string;
  leverage: number;
  /** The shared wallet — identical whichever product was asked for. */
  wallet: WalletSummary;
  /** THIS product's book. */
  book: ProductSummary;
  positions: PaperPosition[];
  openOrders: PaperOrder[];
  /** The WALLET's figures, flattened. */
  startingCapital: number;
  cash: number;
  availableCash: number;
  equity: number;
  totalPnl: number;
  totalPnlPct: number;
  /** THIS product's figures, flattened from `book`. */
  investedValue: number;
  currentValue: number;
  borrowed: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalCharges: number;
  tradeCount: number;
  closedTradeCount: number;
  marketOpen: boolean;
  /** Non-null when a fresh MIS entry would be refused. Rendered verbatim. */
  intradayEntryBlockedReason: string | null;
  /** Minutes to the 15:15 square-off, only while the window is open. */
  minutesToSquareOff: number | null;
  /** The wallet's negative cash, if a forced intraday square-off left it in debit. */
  marginShortfall: number;
  pricesAsOf: string | null;
  resetAt: string | null;
}

/** GET /paper/segments — the one wallet and both products, from one snapshot read. */
export interface SegmentOverview {
  wallet: WalletSummary & {
    openingCapital: number;
    capitalAdded: number;
    positionCount: number;
    openOrderCount: number;
  };
  /** Delivery and intraday, each a P&L category. */
  segments: ProductSummary[];
  marketOpen: boolean;
  pricesAsOf: string | null;
  /** Positions with no snapshot price, carried at cost. */
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
  /** Intraday borrowing outstanding at the close. Optional for an older server. */
  borrowed?: number;
  /** cash + holdingsValue − borrowed. NULL = unknown. A gap, never cash and never 0. */
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
  /** The whole WALLET — delivery and intraday spend the same cash. */
  scope: 'wallet' | 'equity-delivery';
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

export interface ChargeTotals {
  byComponent: Record<ChargeComponent, number>;
  /** Charges on fills booked before itemisation — the total is real, the split was never kept. */
  unitemised: number;
  lineRounding: number;
  buy: number;
  sell: number;
  total: number;
}

/** Capital → every charge line → P&L by product → wallet value. */
export type BridgeKind = 'start' | 'charge' | 'realised' | 'unrealised' | 'residual' | 'end';

export interface BridgeStep {
  key: string;
  label: string;
  kind: BridgeKind;
  segment: CashSegment | null;
  /** Signed movement (the start and end rows carry their level). */
  amount: number;
  /** Running level after this step. */
  after: number;
}

export interface WalletBridge {
  steps: BridgeStep[];
  capital: number;
  charges: number;
  realisedPnl: number;
  unrealisedPnl: number;
  netPnl: number;
  expected: number;
  walletValue: number;
  residual: number;
  status: ReconcileStatus;
  roundingAllowance: number;
}

/** Where the capital went — lines that add up to it. */
export type AllocationKind = 'cash' | 'invested' | 'charge' | 'realised' | 'residual';

export interface AllocationLine {
  key: string;
  label: string;
  hint: string;
  kind: AllocationKind;
  segment: CashSegment | null;
  /** Signed; realised PROFIT is negative (it came back into the cash above). */
  amount: number;
}

export interface CapitalAllocation {
  capital: number;
  lines: AllocationLine[];
  accountedFor: number;
  residual: number;
  status: ReconcileStatus;
}

/** One product as a P&L category. */
export interface AnalyticsCategory {
  segment: CashSegment;
  label: string;
  product: 'CNC' | 'MIS';
  /** Closed trades at the trade price, before charges. */
  realisedPnl: number;
  /** After both sides' charges, as booked. */
  realisedNetPnl: number;
  unrealisedPnl: number;
  charges: ChargeTotals;
  netPnl: number;
  openPositions: number;
  investedValue: number;
  ownFunds: number;
  marketValue: number;
  borrowed: number;
  bought: number;
  sold: number;
  leverageDrawn: number;
  leverageRepaid: number;
  buys: number;
  sells: number;
  winners: number;
  losers: number;
  winRatePct: number | null;
  unmatchedSells: number;
}

export type DistributionCategory =
  'free-cash' | 'blocked-cash' | 'equity-holdings' | 'intraday-positions';

export interface DistributionLine {
  key: string;
  label: string;
  segment: CashSegment | null;
  exchange: string | null;
  symbol: string | null;
  companyName: string | null;
  quantity: number | null;
  ltp: number | null;
  /** False = no price; carried at cost so the wallet still adds up. */
  priced: boolean;
  marketValue: number;
  costValue: number;
  borrowed: number;
  /** What this line contributes to the wallet. Can be negative (a shortfall). */
  value: number;
  unrealisedPnl: number;
}

export interface DistributionCategoryView {
  category: DistributionCategory;
  label: string;
  value: number;
  /** Share of the wallet; the shares sum to exactly 100.00. Null when negative. */
  pct: number | null;
  lines: DistributionLine[];
}

export type LedgerKind = 'OPENING' | 'CAPITAL' | 'BUY' | 'SELL';

export interface LedgerEntry {
  id: string;
  /** The product of a fill; null on the opening and on wallet changes. */
  segment: CashSegment | null;
  kind: LedgerKind;
  at: string | null;
  exchange: string | null;
  symbol: string | null;
  companyName?: string | null;
  quantity: number | null;
  price: number | null;
  tradeValue: number;
  chargesTotal: number;
  borrowed?: number;
  repaid?: number;
  cashChange: number;
  /** The WALLET's balance after this entry. */
  cashAfter: number;
  /** SELL: before charges. */
  grossPnl?: number | null;
  /** SELL: net of both sides' charges. */
  realisedPnl: number | null;
  source: string | null;
  exitReason: string | null;
  note: string | null;
}

export interface TradeStats {
  closingFills: number;
  winners: number;
  losers: number;
  winRatePct: number | null;
  grossProfit: number;
  grossLoss: number;
  /** NULL = no losing trade to divide by. Never render as infinity. */
  profitFactor: number | null;
  avgWin: number | null;
  avgLoss: number | null;
  expectancy: number | null;
  chargesPctOfGrossProfit: number | null;
}

export interface WalletReconciliation {
  replayedCash: number;
  storedCash: number;
  difference: number;
  status: ReconcileStatus;
  excludedBeforeReset: number;
  positionMismatches: { key: string; storedQuantity: number; replayedQuantity: number }[];
  legacyPositions: number;
}

export interface PaperAnalytics {
  profileId: string;
  asOf: string;
  pricesAsOf: string | null;
  marketOpen: boolean;
  wallet: {
    openingCapital: number;
    capitalAdded: number;
    capital: number;
    cash: number;
    blockedCash: number;
    availableCash: number;
    holdingsValue: number;
    borrowed: number;
    value: number;
    realisedPnl: number;
    unrealisedPnl: number;
    charges: number;
    netPnl: number;
    returnPct: number | null;
    mergedAt: string | null;
    resetAt: string | null;
  };
  bridge: WalletBridge;
  allocation: CapitalAllocation;
  categories: AnalyticsCategory[];
  /** `distribution.total === wallet.value`, to the paisa. */
  distribution: {
    total: number;
    categories: DistributionCategoryView[];
    hasNegative: boolean;
    negativeTotal: number;
    unpricedPositions: number;
  };
  charges: ChargeTotals;
  trades: TradeStats;
  /** Oldest first. */
  ledger: LedgerEntry[];
  reconciliation: WalletReconciliation;
  methodology: string[];
}

// ── Wallet (Settings → Paper wallet) ─────────────────────────────────────────────────────

export interface WalletChange {
  id: string;
  /** Signed — positive is a deposit, negative a withdrawal. */
  amount: number;
  capitalBefore: number;
  capitalAfter: number;
  at: string;
  /** Set on a change made to one of the two old pools before they were merged. */
  legacyPool?: CashSegment | null;
}

/** GET /paper/wallet — the ONE wallet of a profile. */
export interface PaperWallet {
  profileId: string;
  /** The configured wallet — every rupee put in. */
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
  mergedAt: string | null;
  changes: WalletChange[];
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
