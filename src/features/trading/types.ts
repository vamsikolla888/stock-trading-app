// Mirrored from the web client: features/broker/services/broker.service.ts,
// features/live-trading/services/live-trading.service.ts, features/paper-trading/services/paper.service.ts.

import type { LiveOrderStatus } from '@/features/portfolio/types';

// ── Brokers ────────────────────────────────────────────────────────────────────────────

export type MfaMethod = 'otp' | 'totp';
export type BrokerConnectionStatus =
  'pending_verification' | 'connected' | 'disconnected' | 'error';

/** GET /brokers. A lapsed session reports 'disconnected' (unless the server auto-refreshes). */
export interface BrokerConnectionSummary {
  broker: string;
  mfaMethod: MfaMethod;
  status: BrokerConnectionStatus;
  connectedAt: string | null;
  expiresAt: string | null;
  lastError: string | null;
  accountLabel?: string | null;
  autoRefresh?: boolean;
}

export type BrokerAuthKind = 'mstock-login' | 'api-key-totp';

export interface BrokerCatalogEntry {
  id: string;
  label: string;
  auth: BrokerAuthKind;
  capabilities: {
    portfolio: boolean;
    orderHistory: boolean;
    liveTrading: boolean;
    marketData: boolean;
  };
  sessionNote: string;
  docsUrl: string;
}

export interface MstockConnectPayload {
  apiKey: string;
  checksum: string;
  username: string;
  password: string;
  mfaMethod: MfaMethod;
}

export interface ApiKeyTotpConnectPayload {
  apiKey: string;
  totpSecret: string;
}

/** connect / reconnect / verify. Verify's answer carries no `challenge` — it's done. */
export interface ChallengeResult {
  broker: string;
  challenge?: MfaMethod | 'none';
  status: 'pending_verification' | 'connected';
}

// ── Live trading ───────────────────────────────────────────────────────────────────────

export type TradingMode = 'sandbox' | 'live';
export type TradeCategory = 'equity_delivery' | 'equity_intraday' | 'futures' | 'options';
export type OrderSide = 'BUY' | 'SELL';
export type OrderType = 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
export type LiveBroker = 'mstock' | 'groww';

export const LIVE_BROKER_LABEL: Record<LiveBroker, string> = { mstock: 'mStock', groww: 'Groww' };

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

export interface LiveOrder {
  id: string;
  broker?: LiveBroker;
  category: TradeCategory;
  product: 'CNC' | 'MIS' | 'NRML';
  exchange: string;
  tradingsymbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price: number | null;
  triggerPrice: number | null;
  status: LiveOrderStatus;
  riskDecision: RiskDecision | null;
  brokerOrderId: string | null;
  filledQuantity: number;
  averageFillPrice: number | null;
  rejectionReason: string | null;
  /** The status history, oldest first (absent on older API builds). */
  events?: LiveOrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface LiveOrderEvent {
  status: LiveOrderStatus;
  at: string;
  note: string | null;
}

/** PATCH /live-trading/orders/:id — only what changed; at least one field. */
export interface ModifyLiveOrderInput {
  quantity?: number;
  price?: number;
  triggerPrice?: number;
}

/** A row of the broker's trade book (executions) — GET /live-trading/broker/trades and
 *  GET /portfolio/linked/:broker/trades share this shape. */
export interface BrokerTrade {
  brokerOrderId: string;
  tradeId: string | null;
  exchange: string | null;
  tradingsymbol: string | null;
  side: OrderSide | null;
  product: string | null;
  quantity: number;
  price: number;
  value: number;
  tradedAt: string | null;
}

export interface PlaceLiveOrderInput {
  mode: 'live';
  broker: LiveBroker;
  category: 'equity_delivery' | 'equity_intraday';
  exchange: string;
  tradingsymbol: string;
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price: number | null;
  triggerPrice: number | null;
  /** Required for live orders: 8–100 chars, unique per user. Same key + same body replays. */
  idempotencyKey: string;
}

export interface LiveOrderResult {
  mode: TradingMode;
  category: TradeCategory;
  order: LiveOrder;
  replay?: boolean;
}

export interface KillSwitchState {
  engaged: boolean;
  reason: string | null;
  engagedAt: string | null;
}

export interface LiveTradingSettings {
  enabled: boolean;
  updatedAt: string | null;
}

/** GET /live-trading/wallet?broker= — null figures mean "not reported", never zero. */
export interface LiveWallet {
  broker: LiveBroker;
  label: string;
  deliveryAvailable: number | null;
  intradayAvailable: number | null;
  cash: number | null;
  holdings:
    { sym: string; exch: string | null; isin: string | null; qty: number; t1Qty: number }[] | null;
  asOf: string;
  stale?: boolean;
}

// ── Paper trading ──────────────────────────────────────────────────────────────────────
// The paper account's types live with the paper feature; re-exported here for the order
// ticket and the outcome helpers, which place and describe paper orders too.

export type {
  CashSegment,
  PaperChargeBreakdown,
  PaperOrder,
  PaperOrderInput,
  PaperOrderPreview,
  PaperOrderStatus,
  PaperPortfolio,
  PaperPosition,
  SegmentOverview,
  ProductSummary,
  WalletSummary,
} from '@/features/paper/types';
