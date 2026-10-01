import { istDateOf, istToday, plural } from '@/features/portfolio/lib/dates';

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
  WalletSummary,
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
 * else from the row's own quantity and average (the trade price, charges excluded — so a
 * stock bought and not yet moved reads ₹0.00). Falls back to the server's snapshot-marked
 * figures when no price exists at all.
 */
export function rowMark(position: PaperPosition, quote?: QuoteRow | null): RowMark {
  const ltp = quote?.ltp ?? position.ltp;
  const prevClose = quote?.prevClose ?? position.prevClose ?? null;
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

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Sums in whole paise, NULL if any value is — a partial total is refused, never shown. */
export function paiseSumOrNull(values: readonly (number | null | undefined)[]): number | null {
  const paise = sumOrNull(values.map((value) => (value == null ? null : Math.round(value * 100))));
  return paise === null ? null : paise / 100;
}

export interface MarkedRow {
  position: PaperPosition;
  mark: RowMark;
}

export function markRows(
  positions: readonly PaperPosition[],
  quotes: Record<string, QuoteRow> | undefined,
): MarkedRow[] {
  return positions.map((position) => ({
    position,
    mark: rowMark(position, quotes?.[quoteKey(position.exchange, position.symbol)]),
  }));
}

/**
 * Today's move on open rows, before charges. Shares carried in move from the previous close;
 * shares bought TODAY move from the price paid (they have no yesterday), so a buy after the
 * close reads ₹0.00. NULL unless every row can be measured — a partial day change looks like
 * the book's and is really an arbitrary subset's. `base` is what the move is measured against.
 */
export function dayMove(
  rows: readonly MarkedRow[],
  today: string,
): { move: number; base: number } | null {
  let move = 0;
  let base = 0;
  for (const { position, mark } of rows) {
    if (mark.ltp === null) return null;
    // An older server sends no split: a row opened today is then all today's.
    const openedToday = istDateOf(position.openedAt ?? null) === today;
    const boughtQty = position.todayBoughtQty ?? (openedToday ? position.quantity : 0);
    const boughtValue =
      position.todayBuyValue ?? (openedToday ? position.avgPrice * position.quantity : 0);
    const carried = Math.max(0, position.quantity - boughtQty);
    if (carried > 0) {
      if (mark.prevClose === null || !(mark.prevClose > 0)) return null;
      move += (mark.ltp - mark.prevClose) * carried;
      base += mark.prevClose * carried;
    }
    move += mark.ltp * boughtQty - boughtValue;
    base += boughtValue;
  }
  return { move: round2(move), base };
}

/** One product's book re-marked live: open value and P&L, today's move, net of charges. */
export interface ProductLive {
  rows: MarkedRow[];
  /** Open positions at the live price, before charges. Null if any row has no price. */
  unrealised: number | null;
  value: number | null;
  /** realised + unrealised − every charge this product paid. */
  net: number | null;
  day: { move: number; base: number } | null;
}

export function productLive(
  portfolio: PaperPortfolio,
  quotes: Record<string, QuoteRow> | undefined,
  today: string,
): ProductLive {
  const rows = markRows(portfolio.positions, quotes);
  const unrealised = paiseSumOrNull(rows.map(({ mark }) => mark.pnl));
  const value = paiseSumOrNull(rows.map(({ mark }) => mark.value));
  const net =
    unrealised === null
      ? null
      : round2(portfolio.book.realisedPnl + unrealised - portfolio.book.charges);
  return { rows, unrealised, value, net, day: dayMove(rows, today) };
}

export type KpiScope = CashSegment | 'account';

/** What a figure is as a share of `base`; null when either side is unknown or the base is 0. */
export function pctOf(
  value: number | null | undefined,
  base: number | null | undefined,
): number | null {
  return value != null && base != null && base > 0 ? (value / base) * 100 : null;
}

/**
 * The summary card's figures for one scope, all before charges (the charges and the P&L once
 * they are out are their own line). Holdings read DELIVERY only, Positions INTRADAY only, and
 * everything else the whole WALLET — a figure from the other product on a product's tab is the
 * confusion this layout exists to avoid. `available` is always the wallet's, because every
 * order draws on the one wallet.
 */
export interface PaperKpis {
  scope: KpiScope;
  /** Current value (delivery) · margin in use (intraday) · wallet value (account). */
  headline: number | null;
  today: number | null;
  todayPct: number | null;
  total: number | null;
  totalPct: number | null;
  /** Closed trades booked today (delivery sells / intraday), before charges. */
  bookedToday: number | null;
  /** Charges this scope has paid, and its P&L once they are taken out. */
  charges: number | null;
  openBuyCharges: number | null;
  net: number | null;
  netPct: number | null;
  available: number | null;
}

export function paperKpis(
  scope: KpiScope,
  input: {
    delivery?: PaperPortfolio;
    intraday?: PaperPortfolio;
    wallet: WalletSummary | null;
    quotes: Record<string, QuoteRow> | undefined;
    now?: number;
  },
): PaperKpis {
  const today = istToday(0, input.now ?? Date.now());
  const { wallet } = input;
  const capital = wallet?.capital ?? null;
  const available = wallet?.availableCash ?? null;

  if (scope === 'equity' || scope === 'intraday') {
    const portfolio = scope === 'equity' ? input.delivery : input.intraday;
    const live = portfolio ? productLive(portfolio, input.quotes, today) : null;
    const booked = portfolio?.book.todayRealisedPnl ?? null;
    const charges = portfolio?.book.charges ?? null;
    const net = live?.net ?? null;

    if (scope === 'equity') {
      const invested = portfolio?.book.investedValue ?? null;
      return {
        scope,
        headline: live?.value ?? null,
        today: live?.day?.move ?? null,
        todayPct: pctOf(live?.day?.move, live?.day?.base),
        total: live?.unrealised ?? null,
        totalPct: pctOf(live?.unrealised, invested),
        bookedToday: booked,
        charges,
        openBuyCharges: portfolio?.book.openBuyCharges ?? null,
        net,
        netPct: pctOf(net, capital),
        available,
      };
    }

    const todayPnl = booked !== null && live?.day ? round2(booked + live.day.move) : null;
    const total =
      portfolio && live?.unrealised != null
        ? round2(portfolio.book.realisedPnl + live.unrealised)
        : null;
    return {
      scope,
      headline: portfolio?.book.ownFunds ?? null,
      today: todayPnl,
      todayPct: pctOf(todayPnl, capital),
      total,
      totalPct: pctOf(total, capital),
      bookedToday: booked,
      charges,
      openBuyCharges: portfolio?.book.openBuyCharges ?? null,
      net,
      netPct: pctOf(net, capital),
      available,
    };
  }

  // The whole wallet: both products' positions re-marked live.
  const delivery = input.delivery ? productLive(input.delivery, input.quotes, today) : null;
  const intraday = input.intraday ? productLive(input.intraday, input.quotes, today) : null;
  const holdings = delivery && intraday ? paiseSumOrNull([delivery.value, intraday.value]) : null;
  const headline =
    wallet && holdings !== null
      ? round2(wallet.cash + holdings - wallet.borrowed)
      : (wallet?.value ?? null);
  const intradayBooked = input.intraday?.book.todayRealisedPnl ?? null;
  const todayPnl =
    delivery?.day && intraday?.day && intradayBooked !== null
      ? round2(delivery.day.move + intraday.day.move + intradayBooked)
      : null;
  const deliveryTotal =
    input.delivery && delivery?.unrealised != null
      ? round2(input.delivery.book.realisedPnl + delivery.unrealised)
      : null;
  const intradayTotal =
    input.intraday && intraday?.unrealised != null
      ? round2(input.intraday.book.realisedPnl + intraday.unrealised)
      : null;
  const total =
    deliveryTotal !== null && intradayTotal !== null
      ? round2(deliveryTotal + intradayTotal)
      : wallet
        ? round2(wallet.realisedPnl + wallet.unrealisedPnl)
        : null;
  const net =
    delivery?.net != null && intraday?.net != null
      ? round2(delivery.net + intraday.net)
      : (wallet?.netPnl ?? null);
  return {
    scope,
    headline,
    today: todayPnl,
    todayPct: pctOf(todayPnl, capital),
    total,
    totalPct: pctOf(total, capital),
    bookedToday: intradayBooked,
    charges: wallet?.charges ?? null,
    openBuyCharges: null,
    net,
    netPct: pctOf(net, capital),
    available,
  };
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
  // An unparseable stamp sorts last rather than poisoning the comparator with NaN.
  const time = (item: T) => {
    const ms = Date.parse(at(item) ?? '');
    return Number.isFinite(ms) ? ms : 0;
  };
  const sorted = [...items].sort((a, b) => time(b) - time(a));
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
    ['Product', (o) => POOL_LABEL[o.segment]],
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
