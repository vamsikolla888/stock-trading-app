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

export interface FnoBookTotals {
  marginBlocked: number;
  unrealisedPnl: number;
  realisedPnl: number;
  totalCharges: number;
  /** Null when nothing in the book could be greeked — "0" would claim a measured flat book. */
  netDelta: number | null;
  netGamma: number | null;
  netTheta: number | null;
  netVega: number | null;
}

export interface FnoBook {
  positions: FnoPositionView[];
  totals: FnoBookTotals;
  ungreekedCount: number;
  caveats: string[];
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
  price: number;
  /** A rejection arrives as a 201 with REJECTED and a `note` — a result, not an error. */
  status: 'FILLED' | 'REJECTED';
  charges: FnoCharges;
  marginDelta: number;
  /** NEGATIVE means premium was RECEIVED (a short). */
  premiumFlow: number;
  realisedPnl: number | null;
  note: string | null;
  basketId: string | null;
  basketName: string | null;
  createdAt: string;
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

/** The three peer screens of the paper book, as on the web (/fno/paper, /positions, /orders). */
export type PaperView = 'explore' | 'positions' | 'orders';
