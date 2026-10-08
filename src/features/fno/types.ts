/**
 * The Groww-backed F&O module — mirrors the web client's fno.service.ts types, which mirror
 * server/src/modules/fno/* exactly (same field names, same nullability).
 *
 * THREE CONVENTIONS EVERY CONSUMER MUST KEEP:
 *   - NULL IS UNKNOWN. A null price is a contract that has not traded; a null greek is one no
 *     source supplied; a null P&L is a line with no price. Render a dash, never 0.
 *   - IV IS A FRACTION (0.2534 = 25.34%).
 *   - ORDER QUANTITIES ARE LOTS. Units (lots × lot size) are shown beside them, never typed.
 *
 * `source` says where market numbers came from — 'groww' (the user's own key) or 'platform'
 * (the app's shared feed, when Groww's plan has no live data) — and `greeksSource` whether a
 * greek is Groww's or calculated on the server. The UI shows both; it never hides a fallback.
 */

/**
 * A derivatives book. NFO/BFO = NSE/BSE F&O. MCX and NCO (NSE's commodity segment) are
 * READ-ONLY books (server 2026-10-07): chain, futures, quotes and candles from Groww's COMMODITY
 * segment — Groww's API places no commodity orders, so every order type below takes
 * `EquityFnoExchange`, and the server refuses an MCX/NCO order (422) anyway.
 */
export type FnoExchange = 'NFO' | 'BFO' | 'MCX' | 'NCO';
/** The books orders, margin and exits are placed on. */
export type EquityFnoExchange = 'NFO' | 'BFO';
/** MCX, and NSE's commodity segment (app code NCO — Groww: exchange NSE, segment COMMODITY). */
export type CommodityExchange = 'MCX' | 'NCO';
export type ContractKind = 'CE' | 'PE' | 'FUT';
export type MarketDataSource = 'groww' | 'platform';
export type GreeksSource = 'groww' | 'calculated';
export type Moneyness = 'ITM' | 'ATM' | 'OTM';
export type FnoProduct = 'MIS' | 'NRML';
export type FnoOrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type FnoSide = 'BUY' | 'SELL';

export interface FnoContract {
  exchange: FnoExchange;
  tradingSymbol: string;
  growwSymbol: string | null;
  underlying: string;
  kind: ContractKind;
  expiry: string;
  strike: number | null;
  lotSize: number;
  tickSize: number | null;
  freezeQuantity: number | null;
  exchangeToken: string;
  buyAllowed: boolean;
  sellAllowed: boolean;
  /** Added server-side 2026-09-27; absent from older cached rows. 'commodity' for MCX/NCO. */
  logoKind?: 'stock' | 'index' | 'commodity';
  logoSymbol?: string;
  logoPath?: string | null;
}

export interface FnoUnderlying {
  underlying: string;
  exchange: FnoExchange;
  isIndex: boolean;
  spotSymbol: string | null;
  /** Groww's exact cash/index identifier (server 2026-09-27); may be absent. */
  spotGrowwSymbol?: string | null;
  name: string | null;
  nearestExpiry: string;
  expiryCount: number;
  hasOptions: boolean;
  hasFutures: boolean;
  lotSize: number | null;
  contractCount: number;
  logoKind?: 'stock' | 'index' | 'commodity';
  logoSymbol?: string;
  logoPath?: string | null;
}

export interface FnoExpiry {
  expiry: string;
  hasOptions: boolean;
  hasFutures: boolean;
  daysToExpiry: number;
}

export interface FnoGreeks {
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
  rho: number | null;
  iv: number | null;
}

export interface FnoChainLeg {
  tradingSymbol: string;
  contract: FnoContract | null;
  ltp: number | null;
  /** Today's change in percent. Optional: an older server omits it. */
  dayChangePct?: number | null;
  openInterest: number | null;
  volume: number | null;
  greeks: FnoGreeks | null;
  greeksSource: GreeksSource | null;
  moneyness: Moneyness | null;
}

export interface FnoChainRow {
  strike: number;
  call: FnoChainLeg | null;
  put: FnoChainLeg | null;
}

export interface FnoChain {
  exchange: FnoExchange;
  underlying: string;
  isIndex: boolean;
  expiry: string;
  expiries: string[];
  daysToExpiry: number;
  spot: number | null;
  spotSource: string;
  /** A commodity chain's settling future as a stream key (`MCX:GOLD05NOV26FUT`) — the price
   *  that IS its spot (a commodity has no cash listing). Absent on equity chains / older servers. */
  spotInstrument?: string | null;
  atmStrike: number | null;
  rows: FnoChainRow[];
  totals: { callOi: number | null; putOi: number | null; pcr: number | null };
  source: MarketDataSource;
  greeksSource: GreeksSource | null;
  sourceNote: string | null;
  caveats: string[];
  asOf: string;
}

export interface FnoDepthLevel {
  price: number;
  quantity: number;
}

export interface FnoQuote {
  exchange: FnoExchange;
  tradingSymbol: string;
  source: MarketDataSource;
  ltp: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  openInterest: number | null;
  oiDayChange: number | null;
  previousOpenInterest: number | null;
  upperCircuit: number | null;
  lowerCircuit: number | null;
  bid: FnoDepthLevel[];
  ask: FnoDepthLevel[];
  totalBuyQuantity: number | null;
  totalSellQuantity: number | null;
  lastTradeTime: string | null;
  asOf: string;
}

export interface FnoContractDetail {
  contract: FnoContract;
  quote: FnoQuote | null;
  greeks: FnoGreeks | null;
  greeksSource: GreeksSource | null;
  spot: number | null;
  source: MarketDataSource;
  sourceNote: string | null;
  caveats: string[];
}

export interface FnoFutureRow {
  contract: FnoContract;
  ltp: number | null;
  dayChange: number | null;
  dayChangePct: number | null;
  openInterest: number | null;
  oiDayChange: number | null;
  volume: number | null;
  basis: number | null;
  basisPct: number | null;
  daysToExpiry: number;
}

export interface FnoFutures {
  exchange: FnoExchange;
  underlying: string;
  isIndex: boolean;
  spot: number | null;
  futures: FnoFutureRow[];
  source: MarketDataSource;
  sourceNote: string | null;
  asOf: string;
}

/* ── Candles (GET /fno/contracts/{exchange}/{tradingSymbol}/candles) ─────────────────── */

/** What a candles request charts: the contract itself, or its cash/index underlying. */
export type ChartTarget = 'contract' | 'underlying';

/** The subset of Groww's historical intervals the chain chart offers. */
export type FnoCandleInterval =
  '1minute' | '3minute' | '5minute' | '15minute' | '30minute' | '1hour' | '1day' | '1week';

export interface FnoCandle {
  /** Bar start, epoch seconds; the series is ascending. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
  openInterest: number | null;
}

export interface FnoCandles {
  candles: FnoCandle[];
  /** Null only when `candles` is empty. */
  source: MarketDataSource | null;
  /** Why `candles` is empty (neither Groww nor the platform feed had bars). */
  unavailableReason: string | null;
}

export interface FnoPositionRow {
  exchange: FnoExchange;
  tradingSymbol: string;
  contract: FnoContract | null;
  product: string;
  netQuantity: number;
  lots: number | null;
  side: 'LONG' | 'SHORT' | 'FLAT';
  buyQuantity: number;
  buyAverage: number | null;
  sellQuantity: number;
  sellAverage: number | null;
  netAverage: number | null;
  carryForwardQuantity: number;
  ltp: number | null;
  unrealisedPnl: number | null;
  realisedPnl: number | null;
  daysToExpiry: number | null;
}

export interface FnoPositionsView {
  positions: FnoPositionRow[];
  totals: {
    unrealisedPnl: number | null;
    realisedPnl: number;
    openCount: number;
    unpricedCount: number;
  };
  priceSource: MarketDataSource | null;
  priceNote: string | null;
  asOf: string;
}

/* ── The live-order lifecycle (server/src/modules/live-trading) ──────────────────────── */

/** UNKNOWN is not a failure: the broker did not confirm in time, and the order must never be
 *  resubmitted — it resolves once reconciled. */
export type LiveOrderStatus =
  | 'DRAFT'
  | 'RISK_REJECTED'
  | 'RISK_APPROVED'
  | 'SUBMITTED'
  | 'ACKNOWLEDGED'
  | 'PARTIALLY_FILLED'
  | 'FILLED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'UNKNOWN';

export interface RiskCheckResult {
  name: string;
  passed: boolean;
  detail: string;
}

export interface RiskDecision {
  approved: boolean;
  reason: string | null;
  checks: RiskCheckResult[];
  decidedAt: string;
}

export interface LiveOrderEvent {
  status: LiveOrderStatus;
  at: string;
  note: string | null;
}

export interface LiveOrder {
  id: string;
  broker?: 'mstock' | 'groww';
  brokerReferenceId?: string | null;
  category: 'equity_delivery' | 'equity_intraday' | 'futures' | 'options';
  product: 'CNC' | 'MIS' | 'NRML';
  exchange: 'NSE' | 'BSE' | 'NFO' | 'BFO';
  tradingsymbol: string;
  side: FnoSide;
  orderType: FnoOrderType;
  quantity: number;
  brokerQuantity: number | null;
  price: number | null;
  triggerPrice: number | null;
  status: LiveOrderStatus;
  riskDecision: RiskDecision | null;
  brokerOrderId: string | null;
  filledQuantity: number;
  averageFillPrice: number | null;
  rejectionReason: string | null;
  events: LiveOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface FnoOrderRow {
  growwOrderId: string;
  liveOrderId: string | null;
  orderReferenceId: string | null;
  exchange: FnoExchange;
  tradingSymbol: string;
  contract: FnoContract | null;
  side: FnoSide | null;
  orderType: string | null;
  product: string | null;
  quantity: number | null;
  lots: number | null;
  filledQuantity: number;
  pendingQuantity: number | null;
  price: number | null;
  triggerPrice: number | null;
  averagePrice: number | null;
  status: LiveOrderStatus;
  growwStatus: string | null;
  remark: string | null;
  placedAt: string | null;
  canModify: boolean;
  canCancel: boolean;
}

export interface FnoTradeRow {
  growwTradeId: string | null;
  exchangeTradeId: string | null;
  quantity: number;
  price: number;
  value: number;
  status: string | null;
  tradedAt: string | null;
}

export interface FnoOrderDetail {
  order: FnoOrderRow;
  trades: FnoTradeRow[];
  lifecycle: LiveOrder | null;
}

export interface FnoFunds {
  futuresAvailable: number | null;
  optionBuyAvailable: number | null;
  optionSellAvailable: number | null;
  netFnoMarginUsed: number | null;
  spanUsed: number | null;
  exposureUsed: number | null;
  clearCash: number | null;
  collateralAvailable: number | null;
  collateralUsed: number | null;
  chargesToday: number | null;
  asOf: string;
}

export interface FnoRequiredMargin {
  total: number | null;
  span: number | null;
  exposure: number | null;
  optionBuyPremium: number | null;
  charges: number | null;
  physicalDelivery: number | null;
}

export interface MarginPreview {
  required: FnoRequiredMargin;
  funds: Omit<FnoFunds, 'asOf'>;
  legs: { tradingSymbol: string; lots: number; quantity: number; lotSize: number }[];
  asOf: string;
}

export interface MarginLeg {
  exchange: EquityFnoExchange;
  tradingSymbol: string;
  side: FnoSide;
  lots: number;
  orderType: FnoOrderType;
  product: FnoProduct;
  price?: number | null;
}

export interface PlaceFnoOrderInput extends MarginLeg {
  triggerPrice?: number | null;
  idempotencyKey: string;
  expectedUnderlying?: string;
  expectedExpiry?: string;
}

export interface ExitPositionInput {
  exchange: EquityFnoExchange;
  tradingSymbol: string;
  product: FnoProduct;
  lots: number;
  orderType: 'MARKET' | 'LIMIT';
  price?: number | null;
  idempotencyKey: string;
}

export interface ModifyFnoOrderInput {
  lots?: number;
  price?: number;
  triggerPrice?: number;
}

export interface TradeOrderResult {
  mode: 'live';
  category: string;
  order: LiveOrder;
  replay?: boolean;
}

export type GrowwAccess =
  | { usable: true; reason: null }
  | {
      usable: false;
      reason: 'not-connected' | 'session-expired' | 'plan' | 'unavailable';
      message: string;
    };

export interface FnoFeedStatus {
  groww: GrowwAccess;
  stream: {
    active: boolean;
    subscriptions?: number;
    instruments?: number;
    streamedInstruments?: number;
    source?: MarketDataSource | null;
    failures?: number;
  };
  streaming: { supportedByGroww: boolean; note: string };
}

/* ── Explore (GET /fno/explore, /fno/explore/:section) ─────────────────────────────── */

/** `prevClose` is ALWAYS the platform's previous close — the one baseline every day move on
 *  the screen is measured against, whichever source supplied the last price. */
export interface ExploreQuote {
  ltp: number | null;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  source: MarketDataSource | null;
}

export interface MiniCandle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface ExploreUnderlying extends ExploreQuote {
  exchange: FnoExchange;
  underlying: string;
  label: string;
  name: string | null;
  isIndex: boolean;
  spotKey: string | null;
  spotSymbol: string | null;
  lotSize: number | null;
  nearestExpiry: string;
  expiryCount: number;
  hasOptions: boolean;
  hasFutures: boolean;
  /** Cash-market shares traded this session, only where the platform has a same-session reading. */
  volume: number | null;
  tradedValue: number | null;
  weekBase: number | null;
  monthBase: number | null;
  weekChangePct: number | null;
  monthChangePct: number | null;
}

export type ExploreExchange = FnoExchange | 'MCX';

export interface ExploreFuture extends ExploreQuote {
  exchange: ExploreExchange;
  tradingSymbol: string;
  underlying: string;
  label: string;
  expiry: string;
  lotSize: number;
  isIndex: boolean;
  streamKey: string | null;
  logoSymbol: string | null;
  contractValue: number | null;
}

export interface ExploreTile extends ExploreQuote {
  kind: 'index' | 'stock' | 'commodity';
  exchange: ExploreExchange;
  underlying: string;
  label: string;
  streamKey: string | null;
  logoSymbol: string | null;
  tradingSymbol: string | null;
  expiry: string | null;
  candles: MiniCandle[] | null;
  candleInterval: string | null;
  candleSeconds: number | null;
  candleNote: string | null;
}

export interface ExploreSources {
  equity: MarketDataSource | null;
  futures: MarketDataSource | null;
  commodities: MarketDataSource | null;
}

export interface ExploreRanking {
  topTraded: string;
  stockFutures: string;
  indexFutures: string;
  commodities: string;
  commodityFutures: string;
}

export type CommodityReturns =
  | { pnl: number | null; openCount: number; source: 'mstock'; reason: null }
  | {
      pnl: null;
      openCount: 0;
      source: null;
      reason: 'not-connected' | 'session-expired' | 'unavailable';
    };

export type ExplorePeriod = 'd1' | 'w1' | 'm1';

export interface FnoExploreSummary {
  topTraded: { equity: ExploreTile[]; commodities: ExploreTile[] };
  stocks: Record<ExplorePeriod, { gainers: ExploreUnderlying[]; losers: ExploreUnderlying[] }>;
  commodities: ExploreFuture[];
  indexFutures: ExploreFuture[];
  stockFutures: ExploreFuture[];
  commodityFutures: ExploreFuture[];
  commodityReturns: CommodityReturns;
  sources: ExploreSources;
  notes: string[];
  ranking: ExploreRanking;
  commodityLive: boolean;
  /** Why the commodity shelves carry no prices — every source accounted for. Null when any priced. */
  commodityNote?: string | null;
  asOf: string;
}

export const EXPLORE_SECTIONS = [
  'underlyings',
  'stocks',
  'index-futures',
  'stock-futures',
  'commodities',
  'commodity-futures',
] as const;

export type ExploreSection = (typeof EXPLORE_SECTIONS)[number];

export interface FnoExploreSectionView<R> {
  section: ExploreSection;
  rows: R[];
  sources: ExploreSources;
  notes: string[];
  ranking: ExploreRanking;
  commodityLive: boolean;
  commodityNote?: string | null;
  asOf: string;
}

export interface ExpiryEntry {
  kind: 'index' | 'stocks' | 'commodity';
  /** The calendar lists NSE/BSE F&O and MCX (NSE's commodity segment is not on it). */
  exchange: 'NFO' | 'BFO' | 'MCX';
  underlying: string | null;
  label: string;
  count: number;
  hasOptions: boolean;
  hasFutures: boolean;
}

export interface ExpiryDay {
  date: string;
  daysToExpiry: number;
  entries: ExpiryEntry[];
}

export type HolidayMarket = 'NSE' | 'BSE' | 'MCX';

/**
 * A published holiday (server fno-calendar-holidays.ts): a Government of India gazetted
 * holiday (`public`, no markets, no session) or an exchange trading holiday (`market`). MCX
 * often closes only one session — `morning` closed means the evening session trades.
 */
export interface CalendarHoliday {
  date: string;
  name: string;
  kind: 'public' | 'market';
  markets: HolidayMarket[];
  session: 'full-day' | 'morning' | 'evening' | null;
  note: string | null;
}

export interface HolidaySource {
  label: string;
  url: string;
  year: number;
}

/** GET /fno/expiry-calendar?month=YYYY-MM (server 2026-10-07; replaced the 45-day window). */
export interface ExpiryCalendar {
  month: string;
  days: ExpiryDay[];
  holidays: CalendarHoliday[];
  holidaySources: HolidaySource[];
  asOf: string;
}

/** A commodity underlying on MCX, or on NSE's commodity segment (`NCO`). */
export interface CommodityUnderlying {
  exchange: 'MCX' | 'NCO';
  underlying: string;
  label: string;
  nearestExpiry: string;
  expiryCount: number;
  hasOptions: boolean;
  hasFutures: boolean;
  lotSize: number | null;
  contractCount: number;
}

/** A live MCX / NSE-commodity contract from search (server 2026-09-27). Read-only — Groww's
 *  API places no commodity orders, so it opens its commodity's chain / futures, never a ticket. */
export interface CommodityContractSearchResult {
  exchange: 'MCX' | 'NCO';
  tradingSymbol: string;
  growwSymbol: string | null;
  underlying: string;
  kind: ContractKind;
  expiry: string;
  strike: number | null;
  lotSize: number | null;
  logoKind: 'commodity';
  logoSymbol: string;
  logoPath: null;
}

export interface FnoSearchResult {
  underlyings: FnoUnderlying[];
  contracts: FnoContract[];
  commodities?: CommodityUnderlying[];
  commodityContracts?: CommodityContractSearchResult[];
}
