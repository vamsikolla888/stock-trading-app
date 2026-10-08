import { CHARGE_LINES, zeroChargeReason } from '@/features/paper/lib/book';
import { istDateOf } from '@/features/portfolio/lib/dates';
import type { LiveOrderStatus } from '@/features/portfolio/types';
import { formatINR, formatQuantity, formatSignedINR } from '@/lib/utils/formatters';
import { isApiError } from '@/types/api';

import type {
  CashSegment,
  LiveOrder,
  OrderSide,
  OrderType,
  PaperChargeBreakdown,
  PaperOrder,
  PaperOrderPreview,
} from '../types';

import { IN_FLIGHT, maxAffordable } from './liveOrders';
import type { OrderFormErrors } from './orderForm';

/**
 * The order ticket's money, as the web's 2026-10-07 ticket lays it out: two cards — what the
 * order needs (or brings in) and what the wallet can spend — then the charges and the rest one
 * quiet tap away. Pure, so the figures a real-money screen shows are unit-tested. Money is the
 * server's wherever the server prices it (the paper preview); the live estimate is quantity ×
 * reference price and says so.
 */

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const shares = (n: number) => `${formatQuantity(n)} share${n === 1 ? '' : 's'}`;

/**
 * A paper preview counts only when its money is actually numeric. A malformed or unexpected
 * answer would otherwise render "₹NaN" and leave Review armed against a total nobody can read
 * — so it is treated as no preview at all (the web ticket's rule).
 */
export function usablePaperPreview(
  raw: PaperOrderPreview | null | undefined,
): PaperOrderPreview | null {
  if (!raw) return null;
  const money = [raw.grossValue, raw.charges, raw.marginRequired, raw.availableCash];
  if (!money.every(finite)) return null;
  if (raw.cashDelta !== undefined && !finite(raw.cashDelta)) return null;
  return raw;
}

/** What the order moves: cash out on a buy, cash in on a sell (the server's `cashDelta`). */
function paperCashDelta(p: PaperOrderPreview, side: OrderSide): number {
  if (finite(p.cashDelta)) return p.cashDelta;
  return side === 'BUY' ? p.marginRequired : p.grossValue - p.charges;
}

export interface AmountCard {
  label: string;
  value: string;
  meta: string;
}

export interface BalanceCard {
  label: string;
  value: string;
  meta: string;
  /** The quantity the Max pill sets; null hides the pill. */
  max: number | null;
  /** The balance itself couldn't be read — the meta is the problem, `fix` the way out. */
  problem: { fix: string } | null;
}

/**
 * What the form still needs before it can be priced, in two words — null once it is complete.
 * Reads the field errors validateOrder returns.
 */
export function missingWord(errors: OrderFormErrors): string | null {
  if (errors.quantity) return 'Enter a quantity';
  if (errors.limitPrice)
    return errors.limitPrice.startsWith('Enter') ? 'Enter a price' : 'Check the price';
  if (errors.triggerPrice)
    return errors.triggerPrice.startsWith('Enter') ? 'Enter a trigger' : 'Check the trigger';
  return null;
}

/** The paper ticket's left card: the server's own figure for this order. */
export function paperAmountCard(input: {
  side: OrderSide;
  quantity: number | null;
  /** What the form still needs (missingWord); null when the order is complete. */
  missing: string | null;
  pending: boolean;
  failed: boolean;
  preview: PaperOrderPreview | null;
}): AmountCard {
  const { side, quantity, missing, preview: p } = input;
  const leveraged = (p?.borrowed ?? 0) > 0;
  const label =
    side === 'BUY' ? (leveraged ? 'Margin required' : 'Amount required') : 'Amount receivable';
  // A refused order is answered with zeros; zero is not its price.
  const priced = !missing && p && p.referencePrice > 0 ? p : null;
  const value = priced
    ? formatINR(paperCashDelta(priced, side))
    : !missing && input.pending
      ? 'Pricing…'
      : '—';
  const meta =
    missing ??
    (priced
      ? `${formatQuantity(quantity ?? 0)} × ${formatINR(priced.referencePrice)}`
      : input.failed
        ? 'Price unavailable'
        : shares(quantity ?? 0));
  return { label, value, meta };
}

/**
 * The paper ticket's right card: the ONE wallet's free cash, and how much this product can
 * open with it. The server's exact figure once priced ("Up to", charges and leverage in); a
 * before-charges estimate until then ("About").
 */
export function paperBalanceCard(input: {
  side: OrderSide;
  preview: PaperOrderPreview | null;
  /** The wallet's free cash from the account read, before any preview. */
  available: number | null;
  leverage: number | null;
  /** Shares of this stock held in this product, from the account read. */
  held: number | null;
  price: number | null;
}): BalanceCard {
  const p = input.preview;
  const available = p?.availableCash ?? input.available;
  const value = finite(available) ? formatINR(available) : '—';
  if (input.side === 'SELL') {
    const held = p?.heldQuantity ?? input.held ?? 0;
    // What a sell may actually take: held less what open sells already commit.
    const sellable = p ? Math.min(held, p.maxQuantity) : held;
    return {
      label: 'Available balance',
      value,
      meta: `${shares(held)} held`,
      max: sellable > 0 ? sellable : null,
      problem: null,
    };
  }
  if (p) {
    return {
      label: 'Available balance',
      value,
      meta: `Up to ${shares(p.maxQuantity)}`,
      max: p.maxQuantity > 0 ? p.maxQuantity : null,
      problem: null,
    };
  }
  const power = finite(available) ? Math.max(0, available) * (input.leverage ?? 1) : null;
  const about = maxAffordable(power, input.price);
  return {
    label: 'Available balance',
    value,
    meta: about !== null ? `About ${shares(about)}` : 'Paper wallet',
    max: null,
    problem: null,
  };
}

/** The live ticket's left card: quantity × the reference price — an estimate, and labelled so. */
export function liveAmountCard(input: {
  side: OrderSide;
  quantity: number | null;
  price: number | null;
  missing: string | null;
}): AmountCard {
  const { quantity, price, missing } = input;
  return {
    label: input.side === 'BUY' ? 'Estimated amount' : 'Estimated proceeds',
    value: !missing && quantity !== null && finite(price) ? formatINR(quantity * price) : '—',
    meta:
      missing ??
      `${formatQuantity(quantity ?? 0)} × ${finite(price) ? formatINR(price) : 'market price'}`,
  };
}

/**
 * The live ticket's right card: the chosen broker's spendable balance for this product. A
 * session or connection problem reads as that, with the way to fix it, never as ₹0.
 */
export function liveBalanceCard(input: {
  side: OrderSide;
  product: 'delivery' | 'intraday';
  brokerLabel: string | null;
  available: number | null;
  loading: boolean;
  error: unknown;
  /** Demat holding of this company at the broker; null when it couldn't be read. */
  held: number | null;
  price: number | null;
}): BalanceCard {
  const label = 'Available balance';
  const tag = `${input.brokerLabel ?? 'Broker'} · ${input.product === 'intraday' ? 'MIS' : 'CNC'}`;
  if (!input.brokerLabel && !input.loading) {
    return { label, value: '—', meta: 'No live broker', max: null, problem: { fix: 'Connect' } };
  }
  if (input.loading) {
    return { label, value: 'Loading…', meta: tag, max: null, problem: null };
  }
  if (input.error && !finite(input.available)) {
    const error = input.error;
    const expired = isApiError(error) && error.code === 'BROKER_SESSION_EXPIRED';
    const missing = isApiError(error) && error.status === 404 && error.code !== 'SERVER_OUTDATED';
    return {
      label,
      value: '—',
      meta: expired ? 'Session expired' : missing ? 'Not connected' : 'Balance unavailable',
      max: null,
      problem: { fix: expired ? 'Reconnect' : missing ? 'Connect' : 'Check' },
    };
  }
  const value = finite(input.available) ? formatINR(input.available) : '—';
  if (input.side === 'SELL') {
    // An intraday sell needs no demat holding.
    if (input.product === 'intraday') return { label, value, meta: tag, max: null, problem: null };
    const held = input.held;
    return {
      label,
      value,
      meta:
        held === null
          ? 'Holdings unavailable'
          : held > 0
            ? `${shares(held)} held`
            : 'No shares held',
      max: held !== null && held > 0 ? held : null,
      problem: null,
    };
  }
  // Before charges, so "About" — the broker's risk check has the final word.
  const about = maxAffordable(input.available, input.price);
  return {
    label,
    value,
    meta: about !== null ? `About ${shares(about)}` : tag,
    max: about !== null && about > 0 ? about : null,
    problem: null,
  };
}

export interface DetailRow {
  key: string;
  label: string;
  value: string;
  /** Colours the value as a gain or loss. */
  trend?: number;
  /** The row the itemised charge lines open under. */
  charges?: boolean;
}

/** "Charges & details" for a paper order: the server's figures, in the web's order. */
export function paperDetailRows(p: PaperOrderPreview, side: OrderSide): DetailRow[] {
  const rows: DetailRow[] = [
    { key: 'value', label: 'Order value', value: formatINR(p.grossValue) },
    {
      key: 'charges',
      label: side === 'BUY' ? 'Buy charges' : 'Sell charges',
      value: formatINR(p.charges),
      charges: true,
    },
  ];
  if ((p.borrowed ?? 0) > 0) {
    rows.push({
      key: 'borrowed',
      label: `Borrowed at ${p.leverage ?? 5}×`,
      value: `−${formatINR(p.borrowed)}`,
    });
  }
  if (finite(p.cashAfter)) {
    rows.push({ key: 'after', label: 'Balance after order', value: formatINR(p.cashAfter) });
  }
  if (finite(p.realisedPnl)) {
    rows.push({
      key: 'realised',
      label: 'Realised P&L',
      value: formatSignedINR(p.realisedPnl),
      trend: p.realisedPnl,
    });
  }
  if (p.exitCharges && finite(p.exitCharges.total)) {
    rows.push({
      key: 'exit',
      label: 'Estimated exit charges',
      value: formatINR(p.exitCharges.total),
    });
  }
  if (finite(p.breakEvenPrice)) {
    rows.push({ key: 'breakeven', label: 'Break-even price', value: formatINR(p.breakEvenPrice) });
  }
  return rows;
}

/** The live order's details: the estimate and the statutory charges at that price. */
export function liveDetailRows(input: {
  estimate: number | null;
  charges: number | null;
}): DetailRow[] {
  return [
    { key: 'value', label: 'Order value', value: formatINR(input.estimate) },
    { key: 'charges', label: 'Estimated charges', value: formatINR(input.charges), charges: true },
  ];
}

/** The disclosure's right-hand text: the charges while closed, "Hide" while open. */
export function detailsSummary(charges: number | null, open: boolean): string {
  if (open) return 'Hide';
  return finite(charges) ? formatINR(charges) : 'View';
}

/** What each order type does here, in a few words (the web trimmed these to phrases). */
export function orderTypeHelp(type: OrderType, mode: 'live' | 'paper'): string {
  switch (type) {
    case 'MARKET':
      // A real market order fills at the prevailing price, not necessarily the last trade.
      return mode === 'paper' ? 'Fills now at the last price.' : 'Fills now at the market price.';
    case 'LIMIT':
      return 'Fills at your price or better.';
    case 'SL':
      return 'At the trigger, becomes a limit order.';
    case 'SL-M':
      return 'At the trigger, fills at market.';
  }
}

/** One line of a charges breakdown; `note` says why a zero is the rule, not a missing figure. */
export type ChargeLine = { key: string; label: string; value: number; note: string | null };

/** A paper order's contract-note lines, each zero explained where the rule explains it. */
export function paperChargeLines(
  breakdown: PaperChargeBreakdown | null | undefined,
  side: OrderSide,
  segment: CashSegment,
): ChargeLine[] {
  if (!breakdown) return [];
  return CHARGE_LINES.map(({ key, label }) => {
    const value = finite(breakdown[key]) ? breakdown[key] : 0;
    return { key, label, value, note: value === 0 ? zeroChargeReason(key, side, segment) : null };
  });
}

/** The itemised lines behind the live charges preview, in contract-note order. */
export function liveChargeLines(
  breakdown: Omit<PaperChargeBreakdown, 'dpCharges'> | null | undefined,
): ChargeLine[] {
  if (!breakdown) return [];
  const lines: [keyof Omit<PaperChargeBreakdown, 'dpCharges' | 'total'>, string][] = [
    ['brokerage', 'Brokerage'],
    ['stt', 'STT'],
    ['exchangeTxn', 'Exchange transaction'],
    ['sebiFee', 'SEBI fee'],
    ['gst', 'GST (18%)'],
    ['stampDuty', 'Stamp duty'],
  ];
  return lines
    .filter(([key]) => finite(breakdown[key]))
    .map(([key, label]) => ({ key, label, value: breakdown[key], note: null }));
}

// ── Today's orders for the stock on the ticket ───────────────────────────────────────────

export type RowTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface TicketOrderRow {
  id: string;
  side: OrderSide;
  /** "10 qty · at ₹2,950.00" */
  line: string;
  status: { label: string; tone: RowTone };
  at: string;
}

const LIVE_STATUS: Partial<Record<LiveOrderStatus, { label: string; tone: RowTone }>> = {
  FILLED: { label: 'Executed', tone: 'success' },
  PARTIALLY_FILLED: { label: 'Part filled', tone: 'warning' },
  REJECTED: { label: 'Rejected', tone: 'danger' },
  RISK_REJECTED: { label: 'Blocked', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
  UNKNOWN: { label: 'Confirming', tone: 'warning' },
};

const sameStock = (
  exchange: string,
  symbol: string,
  target: { exchange: string; symbol: string },
) =>
  exchange.toUpperCase() === target.exchange.toUpperCase() &&
  symbol.toUpperCase() === target.symbol.toUpperCase();

/** This stock's paper orders placed today (IST), newest first — every product. */
export function todaysPaperOrders(
  orders: readonly PaperOrder[] | undefined,
  target: { exchange: string; symbol: string },
  today: string,
): TicketOrderRow[] {
  return (orders ?? [])
    .filter((o) => sameStock(o.exchange, o.symbol, target) && istDateOf(o.createdAt) === today)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((o) => ({
      id: o.id,
      side: o.side,
      line: `${formatQuantity(o.quantity)} qty · ${
        o.status === 'FILLED' && o.filledPrice !== null
          ? `at ${formatINR(o.filledPrice)}`
          : o.limitPrice !== null
            ? `limit ${formatINR(o.limitPrice)}`
            : o.triggerPrice !== null
              ? `trigger ${formatINR(o.triggerPrice)}`
              : 'market'
      } · ${o.segment === 'intraday' ? 'MIS' : 'CNC'}`,
      status:
        o.status === 'FILLED'
          ? { label: 'Executed', tone: 'success' }
          : o.status === 'PENDING'
            ? { label: 'Open', tone: 'warning' }
            : o.status === 'REJECTED'
              ? { label: 'Rejected', tone: 'danger' }
              : { label: 'Cancelled', tone: 'neutral' },
      at: o.filledAt ?? o.createdAt,
    }));
}

/** This stock's real orders placed today (IST), newest first — every broker. */
export function todaysLiveOrders(
  orders: readonly LiveOrder[] | undefined,
  target: { exchange: string; symbol: string },
  today: string,
): TicketOrderRow[] {
  return (orders ?? [])
    .filter(
      (o) => sameStock(o.exchange, o.tradingsymbol, target) && istDateOf(o.createdAt) === today,
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((o) => ({
      id: o.id,
      side: o.side,
      line: `${formatQuantity(o.filledQuantity)}/${formatQuantity(o.quantity)} · ${
        o.averageFillPrice
          ? `avg ${formatINR(o.averageFillPrice)}`
          : o.price !== null
            ? formatINR(o.price)
            : 'market'
      } · ${o.product}`,
      status:
        LIVE_STATUS[o.status] ??
        (IN_FLIGHT.has(o.status)
          ? { label: 'Open', tone: 'warning' }
          : { label: 'Placed', tone: 'neutral' }),
      at: o.createdAt,
    }));
}

/** "2 · View" / "None" — the today's-orders disclosure's right-hand text. */
export function ordersSummary(count: number, open: boolean): string {
  if (count === 0) return 'None';
  return `${count} · ${open ? 'Hide' : 'View'}`;
}

/**
 * Why a live order for this stock can't go to this broker yet: the server keeps ONE working
 * order per stock per broker, and points at modifying the open one. Null when nothing blocks.
 */
export function openOrderMessage(
  open: Pick<LiveOrder, 'status' | 'side' | 'quantity' | 'price'> | null,
  shown: string,
  brokerLabel: string,
): string | null {
  if (!open) return null;
  if (open.status === 'UNKNOWN' || open.status === 'SUBMITTED') {
    return `Your ${open.side.toLowerCase()} order for ${formatQuantity(open.quantity)} ${shown} is still being confirmed with ${brokerLabel}. Wait for it before placing another.`;
  }
  return `${shown} already has an open order at ${brokerLabel} (${open.side} ${formatQuantity(open.quantity)}${
    open.price !== null ? ` @ ${formatINR(open.price)}` : ''
  }). Modify it from Your live orders.`;
}
