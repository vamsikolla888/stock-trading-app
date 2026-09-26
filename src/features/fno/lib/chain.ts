import type {
  ContractKind,
  FnoChainLeg,
  FnoChainRow,
  FnoContract,
  FnoFunds,
  FnoOrderRow,
  FnoOrderType,
  FnoPositionRow,
  FnoSide,
  LiveOrderStatus,
} from '../types';

/**
 * Pure logic behind the chain, the ticket, positions and orders — kept out of components so
 * it can be tested, and so two screens can never disagree about which strike is at the money
 * or what a position is worth.
 */

/* ── Chain shape ──────────────────────────────────────────────────────────────────────── */

/** The strike filter. `null` = every strike the source lists. Strikes are never generated
 *  from an assumed interval — these only window what the server returned. */
export const STRIKE_WINDOWS: readonly { each: number | null; label: string }[] = [
  { each: 5, label: '±5' },
  { each: 10, label: '±10' },
  { each: 20, label: '±20' },
  { each: null, label: 'All' },
];

/**
 * Where the spot marker goes: before the first strike above the spot, and only when the spot
 * sits BETWEEN two listed strikes (-1 otherwise — a marker above the first row or below the
 * last would claim a position in a range the chain does not show).
 */
export function spotMarkerIndex(
  rows: readonly Pick<FnoChainRow, 'strike'>[],
  spot: number | null,
): number {
  if (spot == null || !Number.isFinite(spot) || rows.length < 2) return -1;
  const index = rows.findIndex((row) => row.strike > spot);
  return index > 0 ? index : -1;
}

/**
 * The row to centre on first open: the server's ATM strike when it lists one, else the strike
 * nearest the spot, else the middle row. -1 for an empty chain.
 */
export function atmRowIndex(
  rows: readonly Pick<FnoChainRow, 'strike'>[],
  atmStrike: number | null,
  spot: number | null,
): number {
  if (!rows.length) return -1;
  if (atmStrike != null) {
    const exact = rows.findIndex((row) => row.strike === atmStrike);
    if (exact >= 0) return exact;
  }
  const anchor = atmStrike ?? spot;
  if (anchor == null || !Number.isFinite(anchor)) return Math.floor(rows.length / 2);
  let best = 0;
  let bestGap = Infinity;
  rows.forEach((row, i) => {
    const gap = Math.abs(row.strike - anchor);
    if (gap < bestGap) {
      best = i;
      bestGap = gap;
    }
  });
  return best;
}

/** Top offset of row `index` in a fixed-height chain, counting the spot marker above it. */
export function chainRowOffset(
  index: number,
  spotIndex: number,
  rowHeight: number,
  markerHeight: number,
): number {
  if (index < 0) return 0;
  return index * rowHeight + (spotIndex >= 0 && spotIndex <= index ? markerHeight : 0);
}

/** In the money — the server's own moneyness call; an unknown moneyness is never shaded. */
export function legItm(leg: Pick<FnoChainLeg, 'moneyness'> | null | undefined): boolean {
  return leg?.moneyness === 'ITM';
}

/** The largest open interest on either side — the scale for the chain's OI bars. */
export function chainMaxOi(rows: readonly FnoChainRow[]): number {
  let max = 0;
  for (const row of rows) {
    max = Math.max(max, row.call?.openInterest ?? 0, row.put?.openInterest ?? 0);
  }
  return max;
}

/** 0–1 share of the chain's largest OI, for a bar; 0 when either is unknown. */
export function oiShare(oi: number | null | undefined, maxOi: number): number {
  if (oi == null || !Number.isFinite(oi) || oi <= 0 || !(maxOi > 0)) return 0;
  return Math.min(1, oi / maxOi);
}

/** The ATM leg's IV — the probability lens and the header both read it. */
export function atmIv(rows: readonly FnoChainRow[], atmStrike: number | null): number | null {
  const row = rows.find((r) => r.strike === atmStrike);
  return row?.call?.greeks?.iv ?? row?.put?.greeks?.iv ?? null;
}

/* ── Ticket maths ─────────────────────────────────────────────────────────────────────── */

/** Lots × lot size — the only quantity an F&O ticket shows beside the lots it takes. */
export function unitsOf(lots: number, lotSize: number): number {
  return Number.isInteger(lots) && lots > 0 && lotSize > 0 ? lots * lotSize : 0;
}

/** Premium × lot size — what one lot costs (or collects, if written). */
export function perLot(ltp: number | null, lotSize: number | null | undefined): number | null {
  if (ltp == null || !lotSize) return null;
  return Math.round(ltp * lotSize * 100) / 100;
}

/** The price an estimate is priced at: the limit, else the SL-M trigger, else the last price. */
export function estimatePrice(
  orderType: FnoOrderType,
  price: number | null,
  trigger: number | null,
  ltp: number | null,
): number | null {
  if (price != null && Number.isFinite(price)) return price;
  if (orderType === 'SL-M' && trigger != null && Number.isFinite(trigger)) return trigger;
  return ltp;
}

/** Price × units, rounded to paise; null without a price or a quantity. */
export function orderValue(price: number | null, units: number): number | null {
  if (price == null || !Number.isFinite(price) || !(units > 0)) return null;
  return Math.round(price * units * 100) / 100;
}

export function valueLabel(kind: ContractKind, side: FnoSide): string {
  if (kind === 'FUT') return 'Contract value';
  return side === 'BUY' ? 'Premium payable' : 'Premium receivable';
}

/** The Groww balance an order draws on: futures, option-buy or option-sell. */
export function availableFor(
  funds:
    | Pick<FnoFunds, 'futuresAvailable' | 'optionBuyAvailable' | 'optionSellAvailable'>
    | null
    | undefined,
  kind: ContractKind,
  side: FnoSide,
): number | null {
  if (!funds) return null;
  if (kind === 'FUT') return funds.futuresAvailable;
  return side === 'BUY' ? funds.optionBuyAvailable : funds.optionSellAvailable;
}

export function availableLabel(kind: ContractKind, side: FnoSide): string {
  if (kind === 'FUT') return 'futures';
  return side === 'BUY' ? 'option buy' : 'option sell';
}

/** True only when both figures are known and Groww's requirement exceeds the balance. */
export function isShortOfMargin(required: number | null, available: number | null): boolean {
  return required != null && available != null && available < required;
}

/** The one-line risk statement the web ticket shows under every order. */
export function riskNote(kind: ContractKind, side: FnoSide): string {
  if (kind === 'FUT') {
    return 'A future is linear: every rupee the underlying moves is lot × ₹1 for or against you, and losses are not capped at the margin.';
  }
  if (side === 'BUY')
    return 'Buying an option pays the premium, and the premium is the most it can lose.';
  return kind === 'CE'
    ? 'Writing a call collects the premium and blocks margin — its loss is UNLIMITED if the underlying rises.'
    : 'Writing a put collects the premium and blocks margin — it loses down to the underlying reaching zero.';
}

/* ── Positions ────────────────────────────────────────────────────────────────────────── */

/** Unrealised P&L at a price: (ltp − net average) × net quantity. Null without a price. */
export function livePnl(
  p: Pick<FnoPositionRow, 'netQuantity' | 'netAverage' | 'unrealisedPnl'>,
  ltp: number | null,
): number | null {
  if (p.netQuantity === 0) return 0;
  if (ltp == null || p.netAverage == null) return p.unrealisedPnl;
  return Math.round((ltp - p.netAverage) * p.netQuantity * 100) / 100;
}

export interface PositionSummary {
  open: FnoPositionRow[];
  closed: FnoPositionRow[];
  /** Null when any open line has no price — a partial sum is never presented as the total. */
  unrealised: number | null;
  realised: number;
  /** Realised + unrealised, null under the same rule. */
  total: number | null;
}

export function summarisePositions(
  rows: readonly FnoPositionRow[],
  realised: number,
  ltpOf: (p: FnoPositionRow) => number | null = (p) => p.ltp,
): PositionSummary {
  const open = rows.filter((p) => p.netQuantity !== 0);
  const closed = rows.filter((p) => p.netQuantity === 0);
  let unrealised: number | null = 0;
  for (const p of open) {
    const v = livePnl(p, ltpOf(p));
    if (v == null) {
      unrealised = null;
      break;
    }
    unrealised += v;
  }
  if (unrealised != null) unrealised = Math.round(unrealised * 100) / 100;
  const total = unrealised == null ? null : Math.round((unrealised + realised) * 100) / 100;
  return { open, closed, unrealised, realised, total };
}

export interface ExitPlan {
  /** Lots held, possibly fractional when Groww's quantity is not a lot multiple. */
  openLots: number;
  wholeLots: boolean;
  /** The order side that reduces the position. */
  side: FnoSide;
}

export function exitPlan(p: Pick<FnoPositionRow, 'netQuantity' | 'contract'>): ExitPlan {
  const lotSize = p.contract?.lotSize ?? 0;
  const openLots = lotSize > 0 ? Math.abs(p.netQuantity) / lotSize : 0;
  return {
    openLots,
    wholeLots: lotSize > 0 && Number.isInteger(openLots),
    side: p.netQuantity > 0 ? 'SELL' : 'BUY',
  };
}

/* ── Orders ───────────────────────────────────────────────────────────────────────────── */

export type OrderFilter = 'all' | 'open' | 'executed' | 'rejected' | 'cancelled';

export const ORDER_FILTERS: readonly {
  key: OrderFilter;
  label: string;
  match: (o: Pick<FnoOrderRow, 'status' | 'canCancel'>) => boolean;
}[] = [
  { key: 'all', label: 'All', match: () => true },
  {
    key: 'open',
    label: 'Open',
    match: (o) => o.canCancel || o.status === 'UNKNOWN' || o.status === 'SUBMITTED',
  },
  {
    key: 'executed',
    label: 'Executed',
    match: (o) => o.status === 'FILLED' || (o.status === 'PARTIALLY_FILLED' && !o.canCancel),
  },
  {
    key: 'rejected',
    label: 'Rejected',
    match: (o) => o.status === 'REJECTED' || o.status === 'RISK_REJECTED',
  },
  { key: 'cancelled', label: 'Cancelled', match: (o) => o.status === 'CANCELLED' },
];

export function countByFilter(
  orders: readonly Pick<FnoOrderRow, 'status' | 'canCancel'>[],
): Record<OrderFilter, number> {
  const counts = { all: 0, open: 0, executed: 0, rejected: 0, cancelled: 0 } as Record<
    OrderFilter,
    number
  >;
  for (const filter of ORDER_FILTERS) {
    counts[filter.key] = orders.filter(filter.match).length;
  }
  return counts;
}

export function filterOrders<
  T extends Pick<FnoOrderRow, 'status' | 'canCancel' | 'tradingSymbol' | 'contract'>,
>(orders: readonly T[], filter: OrderFilter, query: string): T[] {
  const match = ORDER_FILTERS.find((f) => f.key === filter)?.match ?? (() => true);
  const needle = query.trim().toUpperCase();
  return orders.filter(
    (o) =>
      match(o) &&
      (!needle ||
        o.tradingSymbol.toUpperCase().includes(needle) ||
        (o.contract?.underlying ?? '').toUpperCase().includes(needle)),
  );
}

/**
 * Only what changed is sent — the server refuses an empty modification. Lots are sent only
 * when the order's own lot count is known and the new one is a real size: an order Groww
 * reports without lots must never be resized by a default the user did not type.
 */
export function modifyBody(
  order: Pick<FnoOrderRow, 'lots' | 'price' | 'triggerPrice'>,
  next: { lots: number | null; price: number | null; triggerPrice: number | null },
): { lots?: number; price?: number; triggerPrice?: number } {
  const body: { lots?: number; price?: number; triggerPrice?: number } = {};
  if (
    order.lots != null &&
    next.lots != null &&
    Number.isInteger(next.lots) &&
    next.lots >= 1 &&
    next.lots !== order.lots
  ) {
    body.lots = next.lots;
  }
  if (next.price != null && Number.isFinite(next.price) && next.price !== order.price) {
    body.price = next.price;
  }
  if (
    next.triggerPrice != null &&
    Number.isFinite(next.triggerPrice) &&
    next.triggerPrice !== order.triggerPrice
  ) {
    body.triggerPrice = next.triggerPrice;
  }
  return body;
}

/** Statuses after which an order will not change again — polling for them can stop. */
export const TERMINAL_STATUSES: ReadonlySet<LiveOrderStatus> = new Set([
  'FILLED',
  'REJECTED',
  'RISK_REJECTED',
  'CANCELLED',
]);

export function isTerminalStatus(status: LiveOrderStatus | null | undefined): boolean {
  return status != null && TERMINAL_STATUSES.has(status);
}

/**
 * Whether an order detail still needs polling: until both this app's lifecycle record (when
 * there is one) and Groww's own row say the order is final.
 */
export function orderDetailSettled(
  detail:
    | {
        order: Pick<FnoOrderRow, 'status' | 'canCancel'>;
        lifecycle: { status: LiveOrderStatus } | null;
      }
    | null
    | undefined,
): boolean {
  if (!detail) return false;
  if (detail.order.canCancel || !isTerminalStatus(detail.order.status)) return false;
  return detail.lifecycle == null || isTerminalStatus(detail.lifecycle.status);
}

export type StatusTone = 'success' | 'danger' | 'warning' | 'primary' | 'neutral';

export function statusTone(status: LiveOrderStatus): StatusTone {
  switch (status) {
    case 'FILLED':
      return 'success';
    case 'REJECTED':
    case 'RISK_REJECTED':
      return 'danger';
    case 'UNKNOWN':
      return 'warning';
    case 'PARTIALLY_FILLED':
    case 'ACKNOWLEDGED':
    case 'SUBMITTED':
    case 'RISK_APPROVED':
      return 'primary';
    default:
      return 'neutral';
  }
}

/** How a live-order status reads to a person — never "placed" for a refused order. */
export const STATUS_TEXT: Partial<Record<LiveOrderStatus, string>> = {
  RISK_REJECTED: 'Refused by the risk engine — not sent to Groww',
  REJECTED: 'Rejected by Groww',
  UNKNOWN: 'Awaiting Groww’s confirmation',
  SUBMITTED: 'Sent to Groww',
  ACKNOWLEDGED: 'Open at Groww',
  PARTIALLY_FILLED: 'Partly filled',
  FILLED: 'Filled',
  CANCELLED: 'Cancelled',
  RISK_APPROVED: 'Approved — sending to Groww',
};

export function statusLabel(status: LiveOrderStatus): string {
  return status.replace(/_/g, ' ');
}

/** Contract rows carry everything a ticket needs; a leg without one cannot be traded. */
export function tradableContract(
  leg: Pick<FnoChainLeg, 'contract'> | null | undefined,
): FnoContract | null {
  return leg?.contract ?? null;
}
