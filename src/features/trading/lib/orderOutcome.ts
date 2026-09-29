import { formatINR, formatQuantity } from '@/lib/utils/formatters';

import type { LiveOrder, PaperOrder } from '../types';

export type OutcomeTone = 'success' | 'pending' | 'danger' | 'warning';

export interface OrderOutcome {
  tone: OutcomeTone;
  title: string;
  message: string;
  /** Failed risk checks, for a RISK_REJECTED order. */
  details: string[];
}

const verb = (side: 'BUY' | 'SELL') => (side === 'BUY' ? 'Bought' : 'Sold');

/**
 * What actually happened to a live order. A successful HTTP response is not a successful
 * order: market closed, kill switch and margin failures arrive as RISK_REJECTED, broker
 * refusals as REJECTED, and a broker timeout as UNKNOWN — all with a 2xx status.
 */
export function describeLiveOrder(order: LiveOrder): OrderOutcome {
  const what = `${formatQuantity(order.quantity)} × ${order.tradingsymbol}`;
  switch (order.status) {
    case 'FILLED':
      return {
        tone: 'success',
        title: 'Order executed',
        message: `${verb(order.side)} ${what}${
          order.averageFillPrice ? ` at an average of ${formatINR(order.averageFillPrice)}` : ''
        }.`,
        details: [],
      };
    case 'PARTIALLY_FILLED':
      return {
        tone: 'pending',
        title: 'Partly filled',
        message: `${formatQuantity(order.filledQuantity)} of ${formatQuantity(order.quantity)} filled so far. The rest is still open.`,
        details: [],
      };
    case 'ACKNOWLEDGED':
    case 'SUBMITTED':
    case 'RISK_APPROVED':
      return {
        tone: 'pending',
        title: 'Order placed',
        message: `Your order for ${what} is open. Track it under Your live orders on the Trade tab.`,
        details: [],
      };
    case 'RISK_REJECTED':
      return {
        tone: 'danger',
        title: 'Blocked by risk check',
        message: order.riskDecision?.reason ?? 'The order did not pass the pre-trade risk checks.',
        details: (order.riskDecision?.checks ?? [])
          .filter((check) => !check.passed)
          .map((check) => check.detail),
      };
    case 'REJECTED':
      return {
        tone: 'danger',
        title: 'Rejected by the broker',
        message: order.rejectionReason ?? 'The broker declined this order.',
        details: [],
      };
    case 'CANCELLED':
      return {
        tone: 'warning',
        title: 'Order cancelled',
        message: `The order for ${what} was cancelled.`,
        details: [],
      };
    case 'UNKNOWN':
      return {
        tone: 'warning',
        title: 'Waiting for confirmation',
        message:
          "The broker didn't confirm in time. Check Your live orders on the Trade tab before trying again — do not place this order a second time.",
        details: [],
      };
    default:
      return {
        tone: 'pending',
        title: 'Order received',
        message: `Status: ${order.status}.`,
        details: [],
      };
  }
}

/** Paper orders: a REJECTED order is also a 201, explained by its `note`. */
export function describePaperOrder(order: PaperOrder): OrderOutcome {
  const what = `${formatQuantity(order.quantity)} × ${order.symbol}`;
  switch (order.status) {
    case 'FILLED':
      return {
        tone: 'success',
        title: 'Paper order executed',
        message: `${verb(order.side)} ${what}${order.filledPrice ? ` at ${formatINR(order.filledPrice)}` : ''}. No real money moved.`,
        details: order.note ? [order.note] : [],
      };
    case 'PENDING':
      return {
        tone: 'pending',
        title: 'Paper order open',
        message: `Your ${order.type.toLowerCase()} order for ${what} will fill when the price is reached.`,
        details: order.note ? [order.note] : [],
      };
    case 'REJECTED':
      return {
        tone: 'danger',
        title: 'Paper order rejected',
        message: order.note ?? 'The paper order could not be placed.',
        details: [],
      };
    default:
      return {
        tone: 'warning',
        title: 'Paper order cancelled',
        message: `The order for ${what} was cancelled.`,
        details: [],
      };
  }
}
