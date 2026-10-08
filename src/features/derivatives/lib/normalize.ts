import type {
  DerivativeKind,
  FnoBook,
  FnoBookTotals,
  FnoCharges,
  FnoFunds,
  FnoOrderPreview,
  FnoOrderStatus,
  FnoOrderView,
  FnoPositionView,
  FnoPreviewOutcome,
  Greeks,
  PaperPriceSource,
} from '../types';

/**
 * The paper F&O book's payloads, parsed once into shapes where every field exists. Production
 * lags the app: a field added in this sync (a position's `ltpSource`, the book's `funds`, an
 * order's `afterHours`) is simply ABSENT on an older server, and is read here as "unknown" —
 * null, false or an empty list — never as a zero that would be shown as a real number.
 */

type Json = Record<string, unknown>;

const obj = (value: unknown): Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : {};
const isObj = (value: unknown): value is Json =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
const strings = (value: unknown): string[] =>
  list(value).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

/** A finite number, or null — a numeric string is accepted, anything else is unknown. */
export function num(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
const numOr = (value: unknown, fallback: number): number => num(value) ?? fallback;
const bool = (value: unknown): boolean => value === true;
const boolOrNull = (value: unknown): boolean | null => (typeof value === 'boolean' ? value : null);

const KINDS: readonly DerivativeKind[] = ['CE', 'PE', 'FUT'];
const kind = (value: unknown): DerivativeKind =>
  KINDS.includes(value as DerivativeKind) ? (value as DerivativeKind) : 'FUT';
const side = (value: unknown): 'BUY' | 'SELL' => (value === 'SELL' ? 'SELL' : 'BUY');

const PRICE_SOURCES: readonly PaperPriceSource[] = ['stream', 'groww', 'platform'];
function priceSource(value: unknown): PaperPriceSource | null {
  return PRICE_SOURCES.includes(value as PaperPriceSource) ? (value as PaperPriceSource) : null;
}

function greeks(value: unknown): Greeks | null {
  if (!isObj(value)) return null;
  const delta = num(value.delta);
  if (delta == null) return null;
  return {
    price: numOr(value.price, 0),
    delta,
    gamma: numOr(value.gamma, 0),
    theta: numOr(value.theta, 0),
    vega: numOr(value.vega, 0),
    rho: numOr(value.rho, 0),
  };
}

export function normalizeCharges(value: unknown): FnoCharges {
  const c = obj(value);
  return {
    brokerage: numOr(c.brokerage, 0),
    stt: numOr(c.stt, 0),
    exchangeTxn: numOr(c.exchangeTxn, 0),
    sebiFee: numOr(c.sebiFee, 0),
    gst: numOr(c.gst, 0),
    stampDuty: numOr(c.stampDuty, 0),
    total: numOr(c.total, 0),
  };
}

export function normalizePosition(value: unknown): FnoPositionView | null {
  const p = obj(value);
  const tradingsymbol = text(p.tradingsymbol);
  const lots = num(p.lots);
  if (!tradingsymbol || lots == null) return null;
  const lotSize = numOr(p.lotSize, 0);
  const ltp = num(p.ltp);
  return {
    id: text(p.id) ?? tradingsymbol,
    exchange: text(p.exchange) ?? 'NFO',
    tradingsymbol,
    underlying: text(p.underlying) ?? tradingsymbol,
    kind: kind(p.kind),
    strike: numOr(p.strike, 0),
    expiry: text(p.expiry) ?? '',
    daysToExpiry: numOr(p.daysToExpiry, 0),
    lotSize,
    lots,
    side: p.side === 'SHORT' || (p.side !== 'LONG' && lots < 0) ? 'SHORT' : 'LONG',
    quantity: numOr(p.quantity, Math.abs(lots) * lotSize),
    avgPrice: numOr(p.avgPrice, 0),
    ltp,
    ltpSource: ltp == null ? null : priceSource(p.ltpSource),
    ltpAsOf: ltp == null ? null : text(p.ltpAsOf),
    streamable: bool(p.streamable),
    marginBlocked: numOr(p.marginBlocked, 0),
    realisedPnl: numOr(p.realisedPnl, 0),
    totalCharges: numOr(p.totalCharges, 0),
    unrealisedPnl: ltp == null ? null : num(p.unrealisedPnl),
    currentValue: num(p.currentValue),
    greeks: greeks(p.greeks),
    impliedVolatility: num(p.impliedVolatility),
    underlyingSpot: num(p.underlyingSpot),
  };
}

function totals(value: unknown): FnoBookTotals {
  const t = obj(value);
  return {
    marginBlocked: numOr(t.marginBlocked, 0),
    unrealisedPnl: numOr(t.unrealisedPnl, 0),
    realisedPnl: numOr(t.realisedPnl, 0),
    totalCharges: numOr(t.totalCharges, 0),
    netDelta: num(t.netDelta),
    netGamma: num(t.netGamma),
    netTheta: num(t.netTheta),
    netVega: num(t.netVega),
  };
}

/** Null unless the server sent the block with its two load-bearing figures. */
function funds(value: unknown): FnoFunds | null {
  if (!isObj(value)) return null;
  const cash = num(value.cash);
  const available = num(value.available);
  if (cash == null || available == null) return null;
  return {
    startingCapital: numOr(value.startingCapital, 0),
    cash,
    reserved: numOr(value.reserved, 0),
    available,
    pendingOrders: numOr(value.pendingOrders, 0),
  };
}

export function normalizeBook(value: unknown): FnoBook {
  const b = obj(value);
  return {
    positions: list(b.positions)
      .map(normalizePosition)
      .filter((p): p is FnoPositionView => p != null),
    totals: totals(b.totals),
    funds: funds(b.funds),
    ungreekedCount: numOr(b.ungreekedCount, 0),
    sessionOpen: boolOrNull(b.sessionOpen),
    caveats: strings(b.caveats),
    asOf: text(b.asOf),
  };
}

const STATUSES: readonly FnoOrderStatus[] = ['PENDING', 'FILLED', 'REJECTED', 'CANCELLED'];

/** Rows written before the `settlement` flag existed carry the note the settlement path writes. */
const SETTLEMENT_NOTE = /^Settled at expiry/;

export function normalizeOrder(value: unknown): FnoOrderView | null {
  const o = obj(value);
  const id = text(o.id);
  const tradingsymbol = text(o.tradingsymbol);
  const status = STATUSES.find((s) => s === o.status);
  if (!id || !tradingsymbol || !status) return null;
  const lotSize = numOr(o.lotSize, 0);
  const lots = numOr(o.lots, 0);
  const note = text(o.note);
  return {
    id,
    exchange: text(o.exchange) ?? 'NFO',
    tradingsymbol,
    underlying: text(o.underlying) ?? tradingsymbol,
    kind: kind(o.kind),
    strike: numOr(o.strike, 0),
    expiry: text(o.expiry) ?? '',
    lotSize,
    side: side(o.side),
    lots,
    quantity: numOr(o.quantity, lots * lotSize),
    type: o.type === 'LIMIT' ? 'LIMIT' : 'MARKET',
    limitPrice: num(o.limitPrice),
    price: numOr(o.price, 0),
    status,
    charges: normalizeCharges(o.charges),
    marginDelta: numOr(o.marginDelta, 0),
    premiumFlow: numOr(o.premiumFlow, 0),
    realisedPnl: num(o.realisedPnl),
    reservedAmount: numOr(o.reservedAmount, 0),
    note,
    basketId: text(o.basketId),
    basketName: text(o.basketName),
    priceSource: text(o.priceSource),
    afterHours: bool(o.afterHours),
    cashDelta: num(o.cashDelta),
    settlement: bool(o.settlement) || SETTLEMENT_NOTE.test(note ?? ''),
    createdAt: text(o.createdAt) ?? '',
  };
}

export function normalizeOrders(value: unknown): FnoOrderView[] {
  return list(value)
    .map(normalizeOrder)
    .filter((o): o is FnoOrderView => o != null);
}

const OUTCOMES: readonly FnoPreviewOutcome[] = [
  'fill',
  'rest',
  'after-hours',
  'rejected',
  'invalid',
];

function previewPrice(value: unknown): FnoOrderPreview['price'] {
  if (!isObj(value)) return null;
  const ltp = num(value.ltp);
  if (ltp == null || !(ltp > 0)) return null;
  const source = text(value.source) ?? 'platform';
  return {
    ltp,
    source,
    label: text(value.label) ?? source,
    asOf: text(value.asOf) ?? '',
  };
}

/**
 * The ticket's estimate. Null when the answer is not a preview at all (no outcome it knows) —
 * the ticket then falls back to its own arithmetic rather than rendering a half-read estimate.
 */
export function normalizePreview(value: unknown): FnoOrderPreview | null {
  const p = obj(value);
  const outcome = OUTCOMES.find((o) => o === p.outcome);
  if (!outcome) return null;
  const c = obj(p.contract);
  const position = isObj(p.position) && num(p.position.lots) != null ? p.position : null;
  return {
    contract: {
      exchange: text(c.exchange) ?? 'NFO',
      tradingsymbol: text(c.tradingsymbol) ?? '',
      underlying: text(c.underlying) ?? '',
      kind: kind(c.kind),
      strike: c.kind === 'FUT' ? null : num(c.strike),
      expiry: text(c.expiry) ?? '',
      daysToExpiry: num(c.daysToExpiry),
      lotSize: numOr(c.lotSize, 0),
      tickSize: num(c.tickSize),
      freezeQuantity: num(c.freezeQuantity),
      maxLots: num(c.maxLots),
      isIndex: bool(c.isIndex),
    },
    side: side(p.side),
    lots: numOr(p.lots, 0),
    quantity: numOr(p.quantity, 0),
    type: p.type === 'LIMIT' ? 'LIMIT' : 'MARKET',
    limitPrice: num(p.limitPrice),
    sessionOpen: bool(p.sessionOpen),
    outcome,
    price: previewPrice(p.price),
    priceNote: text(p.priceNote),
    basisPrice: num(p.basisPrice),
    orderValue: num(p.orderValue),
    marginRequired: numOr(p.marginRequired, 0),
    marginReleased: numOr(p.marginReleased, 0),
    premiumFlow: numOr(p.premiumFlow, 0),
    charges: isObj(p.charges) ? normalizeCharges(p.charges) : null,
    cashDelta: num(p.cashDelta),
    reservedAmount: numOr(p.reservedAmount, 0),
    realisedPnl: num(p.realisedPnl),
    closingLots: numOr(p.closingLots, 0),
    openingLots: numOr(p.openingLots, 0),
    availableCash: num(p.availableCash),
    cashAfter: num(p.cashAfter),
    marginBasis: text(p.marginBasis),
    spot: num(p.spot),
    spotSource: text(p.spotSource),
    breakEven: num(p.breakEven),
    maxLoss: num(p.maxLoss),
    position: position
      ? { lots: numOr(position.lots, 0), avgPrice: numOr(position.avgPrice, 0) }
      : null,
    blockedReason: text(p.blockedReason),
    note: text(p.note),
  };
}
