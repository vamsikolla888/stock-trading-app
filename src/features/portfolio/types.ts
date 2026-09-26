// Mirrored from the web client (features/portfolio/services/portfolio.service.ts and
// features/live-trading/services/live-trading.service.ts). Field names are the server's.

export interface HoldingFlag {
  action: 'BUY' | 'HOLD' | 'SELL';
  rationale: string;
  conviction: number | null;
  hitRatePct: number | null;
  evidence: string[];
  asOf: string;
}

export interface PortfolioHolding {
  sym: string;
  exch: string;
  qty: number;
  avg: number;
  ltp: number;
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
  /** PER SHARE on mStock — multiply by qty for the row's rupee move. */
  dayChange: number;
  dayChangePct: number;
  t1Qty?: number;
  flag: HoldingFlag;
  sector: string | null;
}

export interface PortfolioTotals {
  invested: number;
  value: number;
  pnl: number;
  pnlPct: number;
}

export interface PositionRow {
  sym: string;
  exch: string;
  product: string;
  kind: 'delivery' | 'intraday' | 'carry';
  qty: number;
  avg: number;
  ltp: number | null;
  buyQty: number;
  buyAvg: number;
  sellQty: number;
  sellAvg: number;
  realised: number;
  unrealised: number | null;
  pnl: number | null;
  value: number;
}

export interface BrokerFunds {
  available: number;
  used: number;
  openingBalance: number;
  total: number;
  collateral: number;
  /** Optional: absent from older API builds. */
  realisedProfit?: number;
  payout?: number;
  peakMargin?: number;
}

/** GET /portfolio — the connected mStock book. 404 NOT_FOUND without a broker. */
export interface PortfolioSnapshot {
  broker: string;
  holdings: PortfolioHolding[];
  totals: PortfolioTotals;
  availableCash: number;
  asOf: string;
  stale: boolean;
  positionRows?: PositionRow[];
  funds?: BrokerFunds | null;
}

/** A holding row from an API-linked broker (Groww). */
export interface LinkedHoldingRow {
  sym: string;
  exch: string;
  isin: string | null;
  qty: number;
  t1Qty: number;
  avg: number;
  ltp: number | null;
  prevClose: number | null;
  invested: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** The ROW's rupee move today — not per share, unlike mStock's `dayChange`. */
  dayChange: number | null;
  dayChangePct: number | null;
  sector: string | null;
}

export interface LinkedPositionRow {
  sym: string;
  exch: string;
  product: string;
  qty: number;
  buyQty: number;
  buyAvg: number;
  sellQty: number;
  sellAvg: number;
  netAvg: number;
  realised: number;
  ltp: number | null;
  unrealised: number | null;
  pnl: number | null;
}

export interface LinkedFunds {
  available: number | null;
  used: number | null;
  cash: number | null;
  collateral: number | null;
  chargesToday: number | null;
  /** Every figure the broker reported, labelled as it labels them. */
  breakdown?: { label: string; value: number | null }[];
}

/**
 * GET /portfolio/linked/:broker — the book of an API-linked broker (Groww). `/portfolio`
 * only knows mStock, so a Groww-only user gets 404 there and their holdings live here.
 */
export interface LinkedPortfolioSnapshot {
  broker: string;
  label: string;
  accountLabel: string | null;
  asOf: string;
  stale: boolean;
  holdings: LinkedHoldingRow[];
  positions: LinkedPositionRow[];
  funds: LinkedFunds | null;
  todayOrders?: { total: number; executed: number; open: number; rejected: number };
  totals: {
    invested: number;
    value: number | null;
    unrealised: number | null;
    unrealisedPct: number | null;
    dayChange: number | null;
    realisedToday?: number;
    chargesToday?: number | null;
    chargesTodaySource?: 'broker' | 'estimated' | 'unavailable';
    buyValueToday?: number;
    sellValueToday?: number;
  };
  warnings: string[];
  caveats: string[];
}

export interface ManualHolding {
  id: string;
  sym: string;
  exch: string;
  qty: number;
  avg: number;
  brokerName: string | null;
  ltp: number | null;
  invested: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  flag: HoldingFlag;
  sector: string | null;
}

/** GET /portfolio/manual — hand-tracked holdings, the web's fallback without a broker. */
export interface ManualPortfolioSnapshot {
  holdings: ManualHolding[];
  totals: PortfolioTotals;
  priceUnavailable: boolean;
}

export type LiveOrderSide = 'BUY' | 'SELL';

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

export interface OrderHistoryRow {
  key: string;
  brokerOrderId: string | null;
  liveOrderId: string | null;
  exchange: string | null;
  tradingsymbol: string | null;
  side: LiveOrderSide | null;
  orderType: string | null;
  product: string | null;
  quantity: number | null;
  filledQuantity: number;
  pendingQuantity: number | null;
  price: number | null;
  triggerPrice: number | null;
  averagePrice: number | null;
  status: LiveOrderStatus;
  brokerStatus: string | null;
  statusMessage: string | null;
  placedAt: string | null;
  source: 'broker' | 'app';
  tradingDate: string;
}

/** GET /live-trading/broker/orders/history?page=&days= */
export interface OrderHistoryPage {
  days: { date: string; orders: OrderHistoryRow[] }[];
  page: number;
  daysPerPage: number;
  totalDays: number;
  totalPages: number;
  live: boolean;
}

// ── Analytics & statements ─────────────────────────────────────────────────────────────

export type PortfolioHistoryScope = 'all' | 'mstock' | 'manual' | 'account' | 'other' | 'groww';

/**
 * GET /portfolio/history — TODAY's holdings re-priced against past daily closes. Not a
 * record of the account's value over time; `caveats` says so and must be rendered.
 */
export interface PortfolioHistoryResult {
  points: { date: string; t: number; value: number; markSource: 'close' | 'carried' }[];
  curveComplete: boolean;
  barsAsOf: string | null;
  /** Null when the curve was built; otherwise the reason to show in its place. */
  curveUnavailableReason: string | null;
  caveats: string[];
}

export interface PnlStatementDay {
  date: string;
  realised: number;
  charges: number;
  chargesSource: 'broker' | 'estimated';
  net: number;
  buyValue: number;
  sellValue: number;
  executedOrders: number;
  holdingsValue: number;
  unrealised: number;
  cash: number | null;
}

/** GET /portfolio/linked/:broker/pnl?days= — recorded day by day from the connection date. */
export interface PnlStatement {
  broker: string;
  from: string | null;
  to: string | null;
  /** Newest first. */
  days: PnlStatementDay[];
  totals: {
    realised: number;
    charges: number;
    net: number;
    buyValue: number;
    sellValue: number;
    executedOrders: number;
  };
  unrealisedNow: number | null;
  trackedSince: string | null;
}

export interface LinkedStockPnl {
  sym: string;
  exch: string;
  sector: string | null;
  realised: number;
  unrealised: number | null;
  total: number;
  buyQty: number;
  buyValue: number;
  sellQty: number;
  sellValue: number;
  tradedDays: number;
  holdingQty: number;
  invested: number;
  value: number | null;
}

export interface LinkedMonthPnl {
  month: string;
  realised: number;
  charges: number;
  net: number;
  turnover: number;
  tradingDays: number;
  profitableDays: number;
}

/** GET /portfolio/linked/:broker/analytics?days= */
export interface LinkedAnalytics {
  totals: {
    realised: number;
    charges: number;
    net: number;
    unrealised: number;
    totalPnl: number;
    turnover: number;
  };
  stocks: LinkedStockPnl[];
  months: LinkedMonthPnl[];
  dayStats: {
    tradingDays: number;
    profitableDays: number;
    losingDays: number;
    flatDays: number;
    winRate: number | null;
    bestDay: { date: string; net: number } | null;
    worstDay: { date: string; net: number } | null;
    avgNet: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    streak: { kind: 'win' | 'loss'; days: number } | null;
  };
  orderStats: {
    total: number;
    executed: number;
    open: number;
    cancelled: number;
    rejected: number;
    buys: number;
    sells: number;
    executedValue: number;
    avgExecutedValue: number | null;
  };
  trackedSince: string | null;
  from: string;
}

export interface LifetimeMonth {
  month: string;
  bought: number;
  sold: number;
  realised: number;
  charges: number;
  net: number;
  cumulativeNet: number;
  openCostEnd: number;
}

export interface LifetimeStock {
  sym: string;
  exch: string;
  firstTrade: string;
  lastTrade: string;
  trades: number;
  boughtQty: number;
  boughtValue: number;
  soldQty: number;
  soldValue: number;
  realised: number;
  stcg: number;
  ltcg: number;
  intraday: number;
  charges: number;
  openQty: number;
  openCost: number;
  unmatchedQty: number;
}

export interface LifetimeYear {
  fy: string;
  realised: number;
  stcg: number;
  ltcg: number;
  intraday: number;
  charges: number;
  net: number;
  boughtValue: number;
  soldValue: number;
  trades: number;
}

/** GET /portfolio/linked/:broker/lifetime — imported reports + captured orders, FIFO. */
export interface LifetimeOverview {
  sync: { attemptedAt: string; succeededAt: string | null; error: string | null } | null;
  months: LifetimeMonth[];
  outcomes: {
    lots: number;
    wins: number;
    losses: number;
    winRatePct: number | null;
    avgWin: number | null;
    avgLoss: number | null;
    profitFactor: number | null;
    returnOnCostPct: number | null;
    medianHoldDays: number | null;
  } | null;
  firstTrade: string | null;
  lastTrade: string | null;
  totals: {
    trades: number;
    boughtValue: number;
    soldValue: number;
    realised: number;
    stcg: number;
    ltcg: number;
    intraday: number;
    charges: number;
    chargesEstimated: number;
    chargesAllocated: number;
    netRealised: number;
    openCost: number;
    unmatchedSells: number;
  };
  stocks: LifetimeStock[];
  years: LifetimeYear[];
  sources: { imported: number; captured: number; lastImported: string | null; imports: number };
  live: {
    available: boolean;
    invested: number | null;
    value: number | null;
    unrealised: number | null;
    cash: number | null;
  };
  overall: { pnl: number | null; returnOnBuysPct: number | null };
  reconciliation: { sym: string; replayQty: number; liveQty: number }[];
  statementRows: number;
}

export interface LifetimeStatementRow {
  date: string;
  sym: string;
  exch: string;
  side: 'BUY' | 'SELL';
  qty: number;
  price: number;
  value: number;
  charges: number;
  chargesEstimated: boolean;
  chargesAllocated: boolean;
  realised: number | null;
  cumulativeNet: number;
  source: 'import' | 'captured';
}

export interface LifetimeStatementPage {
  rows: LifetimeStatementRow[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  firstTrade: string | null;
  lastTrade: string | null;
}
