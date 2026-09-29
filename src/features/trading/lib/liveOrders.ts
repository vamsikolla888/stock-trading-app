import type { StockListing } from '@/features/market/types';
import type { LiveOrderStatus } from '@/features/portfolio/types';

import type { LiveBroker, LiveOrder, LiveWallet, ModifyLiveOrderInput, OrderType } from '../types';

/**
 * Live-order rules the ticket and the orders list share. Pure, so they're unit-tested —
 * these decide whether a real order can be sent, so they must not drift.
 */

/** Still in flight: the broker hasn't settled it. A new order for the stock must wait. */
export const IN_FLIGHT: ReadonlySet<LiveOrderStatus> = new Set([
  'SUBMITTED',
  'ACKNOWLEDGED',
  'PARTIALLY_FILLED',
  'UNKNOWN',
]);

/** Working at the broker — the only states a modify or cancel can act on. */
export const WORKING_AT_BROKER: ReadonlySet<LiveOrderStatus> = new Set([
  'ACKNOWLEDGED',
  'PARTIALLY_FILLED',
]);

/**
 * An equity order — the only kind this app's equity ticket and modify sheet understand. An
 * F&O order's quantity is in LOTS on the server while its fills are in exchange units, so
 * editing one here would be read at the wrong scale; those are modified from the F&O tab.
 */
export function isEquityOrder(order: Pick<LiveOrder, 'category'>): boolean {
  return order.category === 'equity_delivery' || order.category === 'equity_intraday';
}

/**
 * The open order for this stock at this broker, if any. The server allows one working order
 * per stock per broker, so the ticket points at it instead of letting a second one fail.
 */
export function findOpenOrder(
  orders: readonly LiveOrder[] | undefined,
  target: { broker: LiveBroker; exchange: string; symbol: string },
): LiveOrder | null {
  return (
    orders?.find(
      (order) =>
        (order.broker ?? 'mstock') === target.broker &&
        order.exchange === target.exchange &&
        order.tradingsymbol === target.symbol &&
        IN_FLIGHT.has(order.status),
    ) ?? null
  );
}

/**
 * What a SELL can draw on at one broker. Demat holdings aren't per-exchange, so the match
 * is on the company: ISIN first (Groww's holdings carry an ISIN but no exchange), else
 * either listing's ticker. Null when the broker's holdings couldn't be read.
 */
export function heldQuantity(
  holdings: LiveWallet['holdings'],
  listings: readonly Pick<StockListing, 'symbol' | 'displaySymbol' | 'isin'>[],
): number | null {
  if (!holdings) return null;
  const isins = new Set(
    listings.map((listing) => listing.isin?.toUpperCase()).filter((isin): isin is string => !!isin),
  );
  const tickers = new Set(
    listings.flatMap((listing) => [
      listing.symbol.toUpperCase(),
      listing.displaySymbol.toUpperCase(),
    ]),
  );
  const byIsin = holdings.find((holding) => holding.isin && isins.has(holding.isin.toUpperCase()));
  const hit = byIsin ?? holdings.find((holding) => tickers.has(holding.sym.toUpperCase()));
  return hit ? hit.qty : 0;
}

/** Whole shares the balance covers at `price`, before charges. Null when either is unknown. */
export function maxAffordable(available: number | null, price: number | null): number | null {
  if (available === null || price === null || !(price > 0) || !Number.isFinite(available)) {
    return null;
  }
  return Math.max(0, Math.floor(available / price));
}

export interface ModifyForm {
  quantity: string;
  price: string;
  triggerPrice: string;
}

/**
 * Validates an edit to a working order and returns only what changed. Quantity can't drop
 * below what has already filled; price and trigger only exist where the type uses them.
 */
export function validateModify(
  order: {
    orderType: string | null;
    quantity: number;
    price: number | null;
    triggerPrice: number | null;
    filledQuantity: number;
  },
  form: ModifyForm,
): { changes: ModifyLiveOrderInput | null; error: string | null } {
  const hasPrice = order.orderType === 'LIMIT' || order.orderType === 'SL';
  const hasTrigger = order.orderType === 'SL' || order.orderType === 'SL-M';
  const quantity = Number(form.quantity);
  const price = Number(form.price);
  const trigger = Number(form.triggerPrice);

  if (!Number.isInteger(quantity) || quantity < 1) {
    return { changes: null, error: 'Enter a whole number of shares.' };
  }
  if (quantity < order.filledQuantity) {
    return {
      changes: null,
      error: `${order.filledQuantity} already filled — quantity can't go below that.`,
    };
  }
  if (hasPrice && !(price > 0)) return { changes: null, error: 'Enter a price.' };
  if (hasTrigger && !(trigger > 0)) return { changes: null, error: 'Enter a trigger price.' };

  const changes: ModifyLiveOrderInput = {};
  if (quantity !== order.quantity) changes.quantity = quantity;
  if (hasPrice && price !== order.price) changes.price = price;
  if (hasTrigger && trigger !== order.triggerPrice) changes.triggerPrice = trigger;
  if (Object.keys(changes).length === 0) return { changes: null, error: null };
  return { changes, error: null };
}

export const needsPriceField = (type: OrderType | string | null) =>
  type === 'LIMIT' || type === 'SL';
export const needsTriggerField = (type: OrderType | string | null) =>
  type === 'SL' || type === 'SL-M';

/**
 * Whether any order's status or fill moved between two polls — when it does, the holdings
 * and wallet behind it moved too, and those screens must refresh.
 */
export function ordersMoved(
  previous: ReadonlyMap<string, string> | null,
  orders: readonly LiveOrder[],
): { changed: boolean; next: Map<string, string> } {
  const next = new Map(
    orders.map((order) => [order.id, `${order.status}:${order.filledQuantity}`]),
  );
  const changed =
    previous !== null &&
    orders.some((order) => previous.has(order.id) && previous.get(order.id) !== next.get(order.id));
  return { changed, next };
}
