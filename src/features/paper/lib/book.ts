import { istDateOf, plural } from '@/features/portfolio/lib/dates';

import type {
  AutoTradeConfig,
  CashSegment,
  EquityPointDay,
  PaperChargeBreakdown,
  PaperOrder,
  PaperPortfolio,
  PaperPosition,
  PaperProfile,
  QuoteRow,
  SegmentSummary,
} from '../types';

/**
 * Pure rules behind the paper screens. Money is always the server's; these only combine
 * rows for display, and every combination refuses a partial answer (null, shown as a
 * dash) rather than presenting a subset as the whole.
 */

export const POOL_LABEL: Record<CashSegment, string> = { equity: 'Delivery', intraday: 'Intraday' };
export const POOL_PRODUCT: Record<CashSegment, 'CNC' | 'MIS'> = { equity: 'CNC', intraday: 'MIS' };

/** A total only when every row contributed. An empty list sums to 0. */
export function sumOrNull(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

/** The remembered profile while it still exists, else the default (else the first). */
export function resolveActiveProfile(
  profiles: readonly PaperProfile[] | undefined,
  rememberedId: string | null,
): PaperProfile | null {
  if (!profiles || profiles.length === 0) return null;
  return (
    profiles.find((profile) => profile.id === rememberedId) ??
    profiles.find((profile) => profile.isDefault) ??
    profiles[0] ??
    null
  );
}

export const quoteKey = (exchange: string, symbol: string) =>
  `${exchange.toUpperCase()}:${symbol.toUpperCase()}`;

export interface RowMark {
  ltp: number | null;
  prevClose: number | null;
  /** Today's move; null when unknown. */
  changePct: number | null;
  value: number | null;
  pnl: number | null;
  /** Against own funds (a 2% move on a 5× position is 10% of the money behind it). */
  pnlPct: number | null;
}

/**
 * One row's live figures: the price from a fresher quote when there is one, everything
 * else from the row's own quantity and cost-inclusive average. Falls back to the server's
 * snapshot-marked figures when no price exists at all.
 */
export function rowMark(position: PaperPosition, quote?: QuoteRow | null): RowMark {
  const ltp = quote?.ltp ?? position.ltp;
  const prevClose = quote?.prevClose ?? null;
  const changePct =
    ltp !== null && prevClose !== null && prevClose > 0
      ? ((ltp - prevClose) / prevClose) * 100
      : null;
  if (ltp === null) {
    return {
      ltp: null,
      prevClose,
      changePct,
      value: position.currentValue,
      pnl: position.unrealisedPnl,
      pnlPct: position.unrealisedPct,
    };
  }
  const pnl = (ltp - position.avgPrice) * position.quantity;
  const ownFunds = position.ownFunds ?? position.investedValue;
  return {
    ltp,
    prevClose,
    changePct,
    value: ltp * position.quantity,
    pnl,
    pnlPct: ownFunds > 0 ? (pnl / ownFunds) * 100 : null,
  };
}

/**
 * Today's move on the delivery holdings: null unless EVERY holding has a previous close —
 * a partial day change looks like the account's move and is an arbitrary subset's.
 */
export function deliveryDayMove(
  positions: readonly PaperPosition[],
  quotes: Record<string, QuoteRow> | undefined,
): { abs: number; pct: number | null } | null {
  let abs = 0;
  let previous = 0;
  for (const position of positions) {
    const mark = rowMark(position, quotes?.[quoteKey(position.exchange, position.symbol)]);
    if (mark.ltp === null || mark.prevClose === null || !(mark.prevClose > 0)) return null;
    abs += (mark.ltp - mark.prevClose) * position.quantity;
    previous += mark.prevClose * position.quantity;
  }
  return { abs, pct: previous > 0 ? (abs / previous) * 100 : null };
}

/**
 * Realised plus unrealised across both pools, against both pools' capital (every wallet
 * change included, so a deposit never reads as profit). Null while either pool is unknown.
 */
export function totalReturns(
  delivery: PaperPortfolio | undefined,
  intraday: PaperPortfolio | undefined,
  quotes: Record<string, QuoteRow> | undefined,
): { abs: number; pct: number | null; capital: number } | null {
  if (!delivery || !intraday) return null;
  const unrealised = sumOrNull(
    [...delivery.positions, ...intraday.positions].map(
      (position) => rowMark(position, quotes?.[quoteKey(position.exchange, position.symbol)]).pnl,
    ),
  );
  if (unrealised === null) return null;
  const abs = delivery.realisedPnl + intraday.realisedPnl + unrealised;
  const capital = delivery.startingCapital + intraday.startingCapital;
  return { abs, pct: capital > 0 ? (abs / capital) * 100 : null, capital };
}

// ── Orders ───────────────────────────────────────────────────────────────────────────────

export type PaperOrderFilter = 'all' | 'open' | 'executed' | 'closed';

export function matchesPaperFilter(order: PaperOrder, filter: PaperOrderFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return order.status === 'PENDING';
    case 'executed':
      return order.status === 'FILLED';
    case 'closed':
      return order.status === 'CANCELLED' || order.status === 'REJECTED';
  }
}

export function paperOrderStatus(order: PaperOrder): {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
} {
  switch (order.status) {
    case 'FILLED':
      return { label: 'Executed', tone: 'success' };
    case 'PENDING':
      // A stop that fired and now waits on its limit is a different state from one asleep.
      return { label: order.triggeredAt ? 'Triggered · open' : 'Open', tone: 'warning' };
    case 'CANCELLED':
      return { label: 'Cancelled', tone: 'neutral' };
    case 'REJECTED':
      return { label: 'Rejected', tone: 'danger' };
  }
}

/** Newest-first groups by IST calendar day of `at` (placement for orders, fill for trades). */
export function groupByDay<T>(
  items: readonly T[],
  at: (item: T) => string | null,
): { date: string; items: T[] }[] {
  const sorted = [...items].sort((a, b) => Date.parse(at(b) ?? '') - Date.parse(at(a) ?? ''));
  const days: { date: string; items: T[] }[] = [];
  for (const item of sorted) {
    const date = istDateOf(at(item)) ?? 'unknown';
    const last = days[days.length - 1];
    if (last && last.date === date) last.items.push(item);
    else days.push({ date, items: [item] });
  }
  return days;
}

export function paperDaySummary(orders: readonly PaperOrder[]): string {
  const executed = orders.filter((order) => order.status === 'FILLED').length;
  const open = orders.filter((order) => order.status === 'PENDING').length;
  const rest = orders.length - executed - open;
  return [
    plural(orders.length, 'order'),
    executed > 0 ? `${executed} executed` : null,
    open > 0 ? `${open} open` : null,
    rest > 0 ? `${rest} cancelled / rejected` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** Totals over filled orders: trade value bought and sold, charges, realised P&L. */
export function fillsSummary(orders: readonly PaperOrder[]) {
  let bought = 0;
  let sold = 0;
  let charges = 0;
  let realised = 0;
  for (const order of orders) {
    if (order.status !== 'FILLED' || order.filledPrice === null) continue;
    const value = order.filledPrice * order.quantity;
    if (order.side === 'BUY') bought += value;
    else sold += value;
    charges += order.charges;
    realised += order.realisedPnl ?? 0;
  }
  return { bought, sold, charges, realised };
}

/** "Square-off in 1h 20m" while the window is open; the fixed time otherwise. */
export function squareOffText(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) {
    return 'Squared off at 3:15 PM IST';
  }
  if (minutes >= 60) return `Square-off in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `Square-off in ${minutes} min`;
}

/**
 * The pool's OWN money in use, as a share of its wallet. Intraday's `deployed` includes
 * the borrowed part, so a 5× pool would read far over 100% on the server's figure.
 */
export function ownMoneyInUse(summary: SegmentSummary): { amount: number; pct: number } {
  const amount = Math.max(0, (summary.deployed ?? 0) - (summary.borrowed ?? 0));
  const pct = summary.startingCapital > 0 ? (amount / summary.startingCapital) * 100 : 0;
  return { amount, pct };
}

export function parsePositive(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// ── Charges, exports, the equity curve ───────────────────────────────────────────────────

/** A contract note's lines, in its order. */
export const CHARGE_LINES: readonly {
  key: keyof Omit<PaperChargeBreakdown, 'total'>;
  label: string;
}[] = [
  { key: 'brokerage', label: 'Brokerage' },
  { key: 'stt', label: 'STT' },
  { key: 'exchangeTxn', label: 'Exchange transaction' },
  { key: 'sebiFee', label: 'SEBI fee' },
  { key: 'gst', label: 'GST (18%)' },
  { key: 'stampDuty', label: 'Stamp duty' },
  { key: 'dpCharges', label: 'DP charge' },
];

/**
 * Why a charge line is zero, when the zero is the rule rather than a missing figure —
 * "no stamp duty on a sell" says something the bare ₹0.00 doesn't.
 */
export function zeroChargeReason(
  key: (typeof CHARGE_LINES)[number]['key'],
  side: 'BUY' | 'SELL',
  segment: CashSegment,
): string | null {
  if (key === 'stampDuty' && side === 'SELL') return 'buy side only';
  if (key === 'stt' && side === 'BUY' && segment === 'intraday') return 'intraday: sell side only';
  if (key === 'dpCharges' && (side === 'BUY' || segment === 'intraday'))
    return 'delivery sells only';
  if (key === 'dpCharges' && side === 'SELL') return 'already paid today';
  if (key === 'brokerage' && segment === 'equity') return '₹0 on delivery';
  return null;
}

/** "TARGET" → "target", "MAX_HOLD" → "time stop", "REVIEW_DROPPED" → "review dropped it". */
export function exitReasonText(reason: string | null | undefined): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'TARGET':
      return 'target hit';
    case 'STOP':
      return 'stop hit';
    case 'MAX_HOLD':
      return 'time stop';
    case 'REVIEW_DROPPED':
      return 'review dropped it';
    default:
      return reason.replace(/_/g, ' ').toLowerCase();
  }
}

/** Who placed an order, when it wasn't the user by hand. */
export function sourceText(source: PaperOrder['source']): string | null {
  if (!source || source === 'MANUAL') return null;
  return source === 'AUTOTRADE' ? 'auto-trade' : 'strategy';
}

const csvCell = (value: string | number | null | undefined) =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

/** The order log as CSV — the web's export columns, shared through the system sheet. */
export function paperOrdersCsv(orders: readonly PaperOrder[]): string {
  const columns: [string, (order: PaperOrder) => string | number | null | undefined][] = [
    ['Order ID', (o) => o.id],
    ['Placed at', (o) => o.createdAt],
    ['Filled at', (o) => o.filledAt],
    ['Segment', (o) => POOL_LABEL[o.segment]],
    ['Exchange', (o) => o.exchange],
    ['Symbol', (o) => o.symbol],
    ['Company', (o) => o.companyName],
    ['Side', (o) => o.side],
    ['Type', (o) => o.type],
    ['Quantity', (o) => o.quantity],
    ['Limit price', (o) => o.limitPrice],
    ['Trigger price', (o) => o.triggerPrice],
    ['Filled price', (o) => o.filledPrice],
    ['Brokerage', (o) => o.chargesBreakdown?.brokerage],
    ['STT', (o) => o.chargesBreakdown?.stt],
    ['Exchange txn', (o) => o.chargesBreakdown?.exchangeTxn],
    ['SEBI fee', (o) => o.chargesBreakdown?.sebiFee],
    ['GST', (o) => o.chargesBreakdown?.gst],
    ['Stamp duty', (o) => o.chargesBreakdown?.stampDuty],
    ['Total charges', (o) => o.charges],
    ['Realised P&L', (o) => o.realisedPnl],
    ['Status', (o) => o.status],
    ['Placed by', (o) => o.source ?? 'MANUAL'],
    ['Exit reason', (o) => o.exitReason],
    ['Note', (o) => o.note],
  ];
  const lines = [columns.map(([head]) => csvCell(head)).join(',')];
  for (const order of orders) lines.push(columns.map(([, get]) => csvCell(get(order))).join(','));
  return lines.join('\n');
}

/**
 * The reconstructed curve as chart points. A day whose value is unknown (no close for a
 * holding) is left out — never drawn as cash, and never as zero.
 */
export function equityPoints(curve: readonly EquityPointDay[]): { time: number; value: number }[] {
  return curve
    .filter(
      (day): day is EquityPointDay & { equity: number } =>
        day.equity !== null && Number.isFinite(day.equity),
    )
    .map((day) => ({ time: day.t * 1000, value: day.equity }));
}

/** Target ÷ stop ATR multiples — the reward:risk before any per-stock clamping. */
export function rewardRisk(
  config: Pick<AutoTradeConfig, 'targetAtrMultiple' | 'stopAtrMultiple'>,
): number | null {
  const { targetAtrMultiple: target, stopAtrMultiple: stop } = config;
  if (target === undefined || stop === undefined || !(stop > 0)) return null;
  return target / stop;
}

/** How much a backtest's trade count can bear — the strategies screen's own thresholds. */
export function sampleText(metrics: { totalTrades: number } | null): string {
  if (!metrics) return 'never backtested';
  const trades = metrics.totalTrades;
  if (trades === 0) return 'no trades';
  if (trades < 10) return `${trades} trades — too few to judge`;
  if (trades < 30) return `${trades} trades — thin`;
  return `${trades} trades`;
}
