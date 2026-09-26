import type { OrderSide, OrderType } from '../types';

export const MAX_ORDER_QUANTITY = 100_000;
const MAX_PRICE = 10_000_000;

export interface OrderFormState {
  side: OrderSide;
  orderType: OrderType;
  quantity: string;
  limitPrice: string;
  triggerPrice: string;
}

export interface ValidatedOrder {
  quantity: number;
  price: number | null;
  triggerPrice: number | null;
}

export interface OrderFormErrors {
  quantity?: string;
  limitPrice?: string;
  triggerPrice?: string;
}

export const needsLimitPrice = (type: OrderType) => type === 'LIMIT' || type === 'SL';
export const needsTriggerPrice = (type: OrderType) => type === 'SL' || type === 'SL-M';

function parsePrice(text: string): number | null {
  if (!text.trim()) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

/**
 * Mirrors the server's order rules (live-trading.dto.ts / paper-trading.dto.ts) so the
 * user hears about a bad field before the round trip: integer quantity, price/trigger only
 * where the type uses them, and an SL limit on the correct side of its trigger.
 */
export function validateOrder(form: OrderFormState): {
  order: ValidatedOrder | null;
  errors: OrderFormErrors;
} {
  const errors: OrderFormErrors = {};
  const quantity = Number.parseInt(form.quantity, 10);
  if (!Number.isInteger(quantity) || quantity < 1) errors.quantity = 'Enter at least 1 share';
  else if (quantity > MAX_ORDER_QUANTITY)
    errors.quantity = `At most ${MAX_ORDER_QUANTITY.toLocaleString('en-IN')} shares`;

  const limit = needsLimitPrice(form.orderType) ? parsePrice(form.limitPrice) : null;
  const trigger = needsTriggerPrice(form.orderType) ? parsePrice(form.triggerPrice) : null;

  if (needsLimitPrice(form.orderType)) {
    if (limit === null || limit <= 0) errors.limitPrice = 'Enter a price';
    else if (limit > MAX_PRICE) errors.limitPrice = 'Price is too high';
  }
  if (needsTriggerPrice(form.orderType)) {
    if (trigger === null || trigger <= 0) errors.triggerPrice = 'Enter a trigger price';
    else if (trigger > MAX_PRICE) errors.triggerPrice = 'Trigger is too high';
  }
  if (
    form.orderType === 'SL' &&
    limit !== null &&
    trigger !== null &&
    !errors.limitPrice &&
    !errors.triggerPrice
  ) {
    if (form.side === 'BUY' && limit < trigger)
      errors.limitPrice = 'For a buy stop-loss, price must be at or above the trigger';
    if (form.side === 'SELL' && limit > trigger)
      errors.limitPrice = 'For a sell stop-loss, price must be at or below the trigger';
  }

  if (Object.keys(errors).length > 0) return { order: null, errors };
  return { order: { quantity, price: limit, triggerPrice: trigger }, errors };
}

/** Price the order is expected to trade at, for the estimate: limit if set, else trigger, else LTP. */
export function referencePrice(
  order: ValidatedOrder,
  orderType: OrderType,
  ltp: number | null,
): number | null {
  if (order.price !== null) return order.price;
  if (orderType === 'SL-M' && order.triggerPrice !== null) return order.triggerPrice;
  return ltp;
}

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  MARKET: 'Market',
  LIMIT: 'Limit',
  SL: 'Stop loss',
  'SL-M': 'SL-Market',
};
