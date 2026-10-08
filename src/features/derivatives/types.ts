/**
 * The simulated F&O paper book — mirrors the web client's derivatives.service.ts, which
 * mirrors server/src/modules/derivatives/* and paper-trading/paper-fno.service.ts.
 *
 * THE NULLS ARE THE POINT:
 *   - `lastPrice: null`   — the contract has NEVER traded. Not "worth nothing".
 *   - `impliedVolatility` — null when no volatility explains the quote. Not "zero vol".
 *   - `greeks: null`      — follows IV: no vol, no model, no delta.
 *   - `maxProfit`/`maxLoss: null` — UNLIMITED. Never render as a number.
 * IV IS A FRACTION on the wire (0.172 = 17.2%).
 */

/** Only `cash-snapshot` is a traded price of the underlying; the other two are back-solved. */
export type SpotSource =
  'implied-from-parity' | 'cash-snapshot' | 'implied-from-future' | 'unavailable';

export interface Greeks {
  price: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface OptionChainLeg {
  tradingsymbol: string;
  lotSize: number;
  lastPrice: number | null;
  impliedVolatility: number | null;
  greeks: Greeks | null;
  /** premium × lotSize — what one lot of this leg costs or collects. */
  contractValue: number | null;
  inTheMoney: boolean | null;
}

export interface OptionChainRow {
  strike: number;
  moneyness: number | null;
  call: OptionChainLeg | null;
  put: OptionChainLeg | null;
}

export type PaperExchange = 'NFO' | 'BFO';

export interface OptionChain {
  underlying: string;
  exchange: PaperExchange;
  isIndex: boolean;
  expiry: string;
  expiries: string[];
  daysToExpiry: number;
  spot: number | null;
  spotSource: SpotSource;
  spotNote: string | null;
  atmStrike: number | null;
  rows: OptionChainRow[];
  future: { tradingsymbol: string; lastPrice: number | null; lotSize: number } | null;
  totals: { callPremium: number; putPremium: number };
  caveats: string[];
  asOf: string;
}

export interface UnderlyingSummary {
  underlying: string;
  isIndex: boolean;
  expiryCount: number;
}

export type DerivativeKind = 'CE' | 'PE' | 'FUT';

export interface FnoPositionView {
  id: string;
  exchange: string;
  tradingsymbol: string;
  underlying: string;
  kind: DerivativeKind;
  strike: number;
  expiry: string;
  daysToExpiry: number;
  lotSize: number;
  /** SIGNED — negative is short. */
  lots: number;
  side: 'LONG' | 'SHORT';
  quantity: number;
  avgPrice: number;
  ltp: number | null;
  /** Where `ltp` came from, and when. Null on an older server (and when nothing priced it). */
  ltpSource: PaperPriceSource | null;
  ltpAsOf: string | null;
  /** In Groww's master under this symbol, so the screen can stream it (`fno:watch`). False on an
   *  older server — such a position keeps its polled price. */
  streamable: boolean;
  marginBlocked: number;
  realisedPnl: number;
  totalCharges: number;
  unrealisedPnl: number | null;
  currentValue: number | null;
  /** ALREADY scaled by quantity and signed for direction. */
  greeks: Greeks | null;
  impliedVolatility: number | null;
  underlyingSpot: number | null;
}

/** Where a paper price came from: the user's own live stream, Groww REST, or the platform feed. */
export type PaperPriceSource = 'stream' | 'groww' | 'platform';

export interface FnoBookTotals {
  marginBlocked: number;
  unrealisedPnl: number;
  /** GROSS realised P&L of every closed and settled trade since the last reset (a current
   *  server); an older one summed it over the OPEN positions only. */
  realisedPnl: number;
  /** Every charge paid since the last reset. */
  totalCharges: number;
  /** Null when nothing in the book could be greeked — "0" would claim a measured flat book. */
  netDelta: number | null;
  netGamma: number | null;
  netTheta: number | null;
  netVega: number | null;
}

/** The F&O wallet, read in the same request as the book (so one poll keeps it current). */
export interface FnoFunds {
  startingCapital: number;
  cash: number;
  /** Held back by PENDING orders. */
  reserved: number;
  /** cash − reserved — what a new order may draw on. */
  available: number;
  pendingOrders: number;
}

export interface FnoBook {
  positions: FnoPositionView[];
  totals: FnoBookTotals;
  /** Null on an older server — the screen reads the wallet endpoint instead. */
  funds: FnoFunds | null;
  ungreekedCount: number;
  /** The exchange session as the server sees it (09:15–15:30 IST, weekdays). Null when unsaid. */
  sessionOpen: boolean | null;
  caveats: string[];
  asOf: string | null;
}

export interface FnoCharges {
  brokerage: number;
  stt: number;
  exchangeTxn: number;
  sebiFee: number;
  gst: number;
  stampDuty: number;
  total: number;
}

export type FnoOrderType = 'MARKET' | 'LIMIT';
export type FnoOrderStatus = 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';

export interface FnoOrderView {
  id: string;
  exchange: string;
  tradingsymbol: string;
  underlying: string;
  kind: DerivativeKind;
  strike: number;
  expiry: string;
  lotSize: number;
  side: 'BUY' | 'SELL';
  lots: number;
  quantity: number;
  /** Absent on an older server, which only placed MARKET orders. */
  type?: FnoOrderType;
  /** Null for MARKET. */
  limitPrice?: number | null;
  /** The fill price. 0 while PENDING — never a real fill. */
  price: number;
  /**
   * A rejection arrives as a 201 with REJECTED and a `note` — a result, not an error. PENDING is
   * a resting LIMIT order, still waiting; CANCELLED was withdrawn before it filled.
   */
  status: FnoOrderStatus;
  /** Zeroed while PENDING. */
  charges: FnoCharges;
  marginDelta: number;
  /** NEGATIVE means premium was RECEIVED (a short). */
  premiumFlow: number;
  realisedPnl: number | null;
  /** PENDING only: the worst case it could need — held out of the wallet's free cash. */
  reservedAmount?: number;
  note: string | null;
  basketId: string | null;
  basketName: string | null;
  /** Where the fill price came from ('stream' | 'groww' | 'platform' | 'settlement'). */
  priceSource: string | null;
  /** A MARKET order placed outside the session — rests PENDING until the next open. */
  afterHours: boolean;
  /** The cash this fill moved (+ credit / − debit). Null while resting and on older orders. */
  cashDelta: number | null;
  /** An expiry settlement row the book wrote itself — no order was placed. */
  settlement: boolean;
  createdAt: string;
}

/** POST /derivatives/orders/preview — what an order would do, from placement's own code. */
export type FnoPreviewOutcome = 'fill' | 'rest' | 'after-hours' | 'rejected' | 'invalid';

export interface FnoOrderPreview {
  contract: {
    exchange: string;
    tradingsymbol: string;
    underlying: string;
    kind: DerivativeKind;
    /** Null for a future. */
    strike: number | null;
    expiry: string;
    daysToExpiry: number | null;
    lotSize: number;
    tickSize: number | null;
    freezeQuantity: number | null;
    /** The most lots one order may carry here (the exchange freeze limit, capped at 100). */
    maxLots: number | null;
    isIndex: boolean;
  };
  side: 'BUY' | 'SELL';
  lots: number;
  quantity: number;
  type: FnoOrderType;
  limitPrice: number | null;
  sessionOpen: boolean;
  outcome: FnoPreviewOutcome;
  /** The price it would fill at, where that came from and when. */
  price: { ltp: number; source: string; label: string; asOf: string } | null;
  priceNote: string | null;
  /** The price the money below is computed at: the fill price, or a resting order's basis. */
  basisPrice: number | null;
  orderValue: number | null;
  marginRequired: number;
  marginReleased: number;
  premiumFlow: number;
  charges: FnoCharges | null;
  /** Cash this order would move now (+ credit / − debit). Null when it would rest. */
  cashDelta: number | null;
  /** What a resting order would hold back. */
  reservedAmount: number;
  realisedPnl: number | null;
  closingLots: number;
  openingLots: number;
  availableCash: number | null;
  cashAfter: number | null;
  marginBasis: string | null;
  spot: number | null;
  spotSource: string | null;
  breakEven: number | null;
  /** The most an opening LONG option can lose; null otherwise (see `maxLossLabel`). */
  maxLoss: number | null;
  position: { lots: number; avgPrice: number } | null;
  /** A refusal — a normal answer, not an error. Place is disabled while it stands. */
  blockedReason: string | null;
  note: string | null;
}

export interface ExpirySettlementResult {
  settled: number;
  totalPnl: number;
  details: { tradingsymbol: string; lots: number; settlementPrice: number; pnl: number }[];
}

export interface PlacePaperFnoOrderInput {
  tradingsymbol: string;
  exchange?: PaperExchange;
  side: 'BUY' | 'SELL';
  /** LOTS (1–100), never shares. */
  lots: number;
  /** Defaults to MARKET server-side. LIMIT rests until the market reaches it. */
  type?: FnoOrderType;
  /** Required when `type` is LIMIT. */
  limitPrice?: number;
}

/** What the chain currently says about a ticket's contract (refreshed by the parent). */
export interface PaperTicketQuote {
  lastPrice: number | null;
  impliedVolatility: number | null;
  delta: number | null;
}

export interface PaperChainQuery {
  expiry?: string | null;
  /** Strikes either side of ATM, 1–50. */
  window?: number | null;
  exchange?: PaperExchange | null;
}

/* ── Payoff, probability, strategies (POST /derivatives/payoff, /strategies/build, /basket) ── */

export interface PayoffAnalysis {
  points: { underlyingPrice: number; profit: number }[];
  /** null = UNLIMITED. Never render as a number. */
  maxProfit: number | null;
  /** null = UNLIMITED. Never render as a number. */
  maxLoss: number | null;
  breakEvens: number[];
  /** Negative = a debit was paid to open. */
  netPremium: number;
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
  /** What the basket is worth if the underlying goes to zero — off the plotted window's left. */
  profitAtZero: number;
}

export interface ProbabilityBand {
  rangeLow: number;
  rangeHigh: number;
  probability: number;
  avgProfit: number;
}

/** MODELLED (lognormal, from the ATM leg's IV) — never a measured historical win rate. */
export interface ProbabilityAnalysis {
  probabilityOfProfit: number | null;
  expectedValue: number | null;
  bands: ProbabilityBand[];
  caveats: string[];
}

export interface BasketPayoffLeg {
  tradingsymbol: string;
  kind: DerivativeKind;
  strike: number;
  expiry: string;
  side: 'BUY' | 'SELL';
  lots: number;
  quantity: number;
  price: number;
}

export interface BasketPayoff {
  underlying: string;
  spot: number | null;
  legs: BasketPayoffLeg[];
  analysis: PayoffAnalysis;
  /** An APPROXIMATION, not an exchange SPAN + exposure figure. */
  marginRequired: number;
  openingCharges: number;
  impliedVolatility: number | null;
  yearsToExpiry: number | null;
  probability: ProbabilityAnalysis | null;
  caveats: string[];
}

export type StrategyOutlook = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export interface OptionStrategyDefinition {
  key: string;
  name: string;
  outlook: StrategyOutlook;
  summary: string;
  riskProfile: string;
  legCount: number;
  /** True when the position can lose an unbounded amount. */
  unlimitedRisk: boolean;
  legs: { kind: 'CE' | 'PE'; side: 'BUY' | 'SELL'; step: number }[];
}

export interface BuiltStrategyLeg {
  tradingsymbol: string;
  exchange: string;
  kind: 'CE' | 'PE';
  side: 'BUY' | 'SELL';
  strike: number;
  lots: number;
}

/** Discriminated on `buildable` so "no listed strike far enough out" survives to the screen. */
export type BuildStrategyResult =
  | {
      buildable: true;
      definition: OptionStrategyDefinition;
      legs: BuiltStrategyLeg[];
      atmStrike: number;
      strikeInterval: number;
      spot: number;
      expiry: string;
      payoff: BasketPayoff;
    }
  | { buildable: false; reason: string };

export interface PayoffLegInput {
  tradingsymbol: string;
  exchange?: PaperExchange;
  side: 'BUY' | 'SELL';
  lots: number;
  /** Overrides the live price (e.g. the entry price of a held leg). */
  price?: number;
}

export interface BuildStrategyInput {
  strategyKey: string;
  underlying: string;
  expiry: string;
  lots: number;
}

export interface PlaceBasketResult {
  basketId: string;
  orders: FnoOrderView[];
}

/** GET /stocks/top-* with fnoOnly=true — the F&O-eligible movers the web's paper Explore uses. */
export interface FnoMover {
  symbol: string;
  companyName: string | null;
  exchange: string;
  ltp: number | null;
  changeAbs?: number | null;
  changePct: number | null;
  volume?: number | null;
}

/** The views of the paper F&O screen — the web's unified /fno/paper, plus its Discover page. */
export type PaperView = 'positions' | 'orders' | 'analytics' | 'explore';

/* ── The F&O sandbox's own wallet (GET/PUT /derivatives/wallet, POST /derivatives/reset) ──
 * SEPARATE from the cash paper wallet and not profile-scoped. Margin on open positions is
 * already out of `cash`; a resting LIMIT order's reservation is not, so `availableCash` is
 * `cash − blockedCash`. */

export interface FnoWalletChange {
  id: string;
  /** Signed — positive is a deposit, negative a withdrawal. */
  amount: number;
  capitalBefore: number;
  capitalAfter: number;
  at: string;
}

export interface FnoWallet {
  capital: number;
  openingCapital: number;
  capitalAdded: number;
  cash: number;
  /** Context only — already out of `cash`. */
  marginBlocked: number;
  /** Held by resting LIMIT orders. */
  blockedCash: number;
  availableCash: number;
  minCapital: number;
  maxCapital: number;
  resetAt: string | null;
  changes: FnoWalletChange[];
}

/* ── Analytics over the sandbox's own order log (GET /derivatives/analytics) ─────────────
 * REPLAYED, not restated: the reconciliation can genuinely say `mismatch`. Realised P&L only —
 * open positions are the book's job. */

export interface FnoChargeTotals extends FnoCharges {
  buySide: number;
  sellSide: number;
}

export interface FnoTradeStats {
  filledOrders: number;
  rejectedOrders: number;
  /** Resting LIMIT orders. Optional for an older server. */
  pendingOrders?: number;
  cancelledOrders?: number;
  /** Turnover — opens and closes both, not a position count. */
  totalLots: number;
  basketOrders: number;
  /** The honest denominator for a win rate — orders that closed some or all of a position. */
  closingTrades: number;
  wins: number;
  losses: number;
  /** Closed at exactly zero — neither a win nor a loss. */
  flatTrades: number;
  winRatePct: number | null;
  avgWin: number | null;
  /** A POSITIVE magnitude — prefix the sign when rendering. */
  avgLoss: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
}

export interface FnoPnlSlice {
  key: string;
  label: string;
  realisedPnl: number;
  trades: number;
}

export type FnoReconcileStatus = 'exact' | 'rounding' | 'mismatch';

export interface FnoReconciliation {
  openingCash: number;
  walletChanges: number;
  orderCashEffect: number;
  expectedCash: number;
  actualCash: number;
  diffPaise: number;
  status: FnoReconcileStatus;
  excludedBeforeReset: number;
}

export interface FnoAnalytics {
  charges: FnoChargeTotals;
  trades: FnoTradeStats;
  /** Each breakdown sums to the same realised total; ranked by |P&L|, largest first. */
  pnl: { byUnderlying: FnoPnlSlice[]; byKind: FnoPnlSlice[]; byDirection: FnoPnlSlice[] };
  reconciliation: FnoReconciliation;
  asOf: string;
}
