import type { DonutSegment } from '@/components/ui/Donut';

import type { LiveOrderStatus, OrderHistoryRow, PositionRow } from '../types';

import { plural } from './dates';
import { CHART_PALETTES, type ChartPalette, type HoldingView } from './portfolio';

/**
 * Pure helpers behind the broker books (mStock and linked): order filters and day
 * summaries, position totals, holding sorts and the small analytics the web computes
 * client-side. Kept out of the components so they can be unit-tested.
 */

/** A total that is only a total when every row contributed. An empty list sums to 0. */
export function sumOrNull(values: readonly (number | null | undefined)[]): number | null {
  let total = 0;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) return null;
    total += value;
  }
  return total;
}

// ── Orders ───────────────────────────────────────────────────────────────────────────────

export type OrderFilter = 'all' | 'open' | 'executed' | 'closed';

/** Orders still working at the broker — the only ones a cancel or modify can act on. */
export const OPEN_AT_BROKER: ReadonlySet<LiveOrderStatus> = new Set([
  'ACKNOWLEDGED',
  'PARTIALLY_FILLED',
]);

export function matchesOrderFilter(order: { status: LiveOrderStatus }, filter: OrderFilter) {
  switch (filter) {
    case 'all':
      return true;
    case 'open':
      return OPEN_AT_BROKER.has(order.status);
    case 'executed':
      return order.status === 'FILLED';
    case 'closed':
      return !OPEN_AT_BROKER.has(order.status) && order.status !== 'FILLED';
  }
}

export function countOrdersByFilter(
  orders: readonly { status: LiveOrderStatus }[],
): Record<OrderFilter, number> {
  return {
    all: orders.length,
    open: orders.filter((order) => matchesOrderFilter(order, 'open')).length,
    executed: orders.filter((order) => matchesOrderFilter(order, 'executed')).length,
    closed: orders.filter((order) => matchesOrderFilter(order, 'closed')).length,
  };
}

/** "4 orders · 2 executed · 1 open · 1 cancelled / rejected" */
export function orderDaySummary(orders: readonly { status: LiveOrderStatus }[]): string {
  const counts = countOrdersByFilter(orders);
  return [
    plural(counts.all, 'order'),
    counts.executed > 0 ? `${counts.executed} executed` : null,
    counts.open > 0 ? `${counts.open} open` : null,
    counts.closed > 0 ? `${counts.closed} cancelled / rejected` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** An open mStock order that this app can still cancel (it has a broker order number). */
export function isCancellable(order: OrderHistoryRow, broker: string): boolean {
  return broker === 'mstock' && OPEN_AT_BROKER.has(order.status) && Boolean(order.brokerOrderId);
}

/**
 * Only orders this app placed can be modified — the PATCH needs the app's own order id —
 * and only equity ones: the server reads an F&O modify's quantity as LOTS while this book
 * shows exchange units, so an F&O edit here would multiply the order by its lot size.
 */
export function isModifiable(order: OrderHistoryRow, broker: string): boolean {
  return (
    isCancellable(order, broker) &&
    Boolean(order.liveOrderId) &&
    (order.exchange === 'NSE' || order.exchange === 'BSE')
  );
}

// ── Positions ────────────────────────────────────────────────────────────────────────────

export const POSITION_KIND_LABEL: Record<PositionRow['kind'], string> = {
  delivery: 'Delivery',
  intraday: 'Intraday',
  carry: 'Carry forward',
};

/** Open positions first, then the ones closed today; with the day's P&L when every row has one. */
export function positionsSummary(rows: readonly PositionRow[]): {
  open: PositionRow[];
  closed: PositionRow[];
  dayPnl: number | null;
  realised: number;
} {
  const open = rows.filter((row) => row.qty !== 0);
  const closed = rows.filter((row) => row.qty === 0);
  return {
    open,
    closed,
    dayPnl: sumOrNull(rows.map((row) => row.pnl)),
    realised: rows.reduce(
      (sum, row) => sum + (Number.isFinite(row.realised) ? row.realised : 0),
      0,
    ),
  };
}

// ── Holdings ─────────────────────────────────────────────────────────────────────────────

export type HoldingSort = 'value' | 'returns' | 'day' | 'name';

export const HOLDING_SORT_LABEL: Record<HoldingSort, string> = {
  value: 'Current value',
  returns: 'Returns %',
  day: "Today's change",
  name: 'Name (A–Z)',
};

/** Unknown figures sort last in every numeric mode, never as a very small number. */
function byNumberDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}

export function sortHoldings(holdings: readonly HoldingView[], sort: HoldingSort): HoldingView[] {
  const copy = [...holdings];
  switch (sort) {
    case 'value':
      return copy.sort((a, b) => byNumberDesc(a.value ?? a.invested, b.value ?? b.invested));
    case 'returns':
      return copy.sort((a, b) => byNumberDesc(a.pnlPct, b.pnlPct));
    case 'day':
      return copy.sort((a, b) => byNumberDesc(a.dayChangePct, b.dayChangePct));
    case 'name':
      return copy.sort((a, b) => a.symbol.localeCompare(b.symbol));
  }
}

export function topPerformer(holdings: readonly HoldingView[]): HoldingView | null {
  let best: HoldingView | null = null;
  for (const holding of holdings) {
    if (holding.pnlPct === null) continue;
    if (!best || holding.pnlPct > (best.pnlPct ?? -Infinity)) best = holding;
  }
  return best;
}

export function largestHolding(holdings: readonly HoldingView[]): HoldingView | null {
  let largest: HoldingView | null = null;
  for (const holding of holdings) {
    if (!largest || (holding.value ?? holding.invested) > (largest.value ?? largest.invested)) {
      largest = holding;
    }
  }
  return largest;
}

/** Today's best and worst holdings by percentage move (top three each). */
export function holdingMovers(holdings: readonly HoldingView[]): {
  gainers: HoldingView[];
  losers: HoldingView[];
} {
  const priced = holdings
    .filter((holding) => holding.dayChangePct !== null)
    .sort((a, b) => (b.dayChangePct ?? 0) - (a.dayChangePct ?? 0));
  return {
    gainers: priced.filter((holding) => (holding.dayChangePct ?? 0) > 0).slice(0, 3),
    losers: [...priced]
      .reverse()
      .filter((holding) => (holding.dayChangePct ?? 0) < 0)
      .slice(0, 3),
  };
}

/** Allocation by holding (top six by value, the rest folded into "Others"). */
export function allocationByHolding(
  holdings: readonly HoldingView[],
  palette: ChartPalette = CHART_PALETTES.light,
  max = 6,
): DonutSegment[] {
  const weighted = holdings
    .map((holding) => ({ label: holding.symbol, value: holding.value ?? holding.invested }))
    .filter((row) => Number.isFinite(row.value) && row.value > 0)
    .sort((a, b) => b.value - a.value);
  const segments: DonutSegment[] = weighted.slice(0, max).map((row, index) => ({
    ...row,
    color: palette.colors[index % palette.colors.length]!,
  }));
  const rest = weighted.slice(max).reduce((sum, row) => sum + row.value, 0);
  if (rest > 0) segments.push({ label: 'Others', value: rest, color: palette.other });
  return segments;
}

// ── Trades & funds ───────────────────────────────────────────────────────────────────────

export function tradesSummary(trades: readonly { side: 'BUY' | 'SELL' | null; value: number }[]) {
  let bought = 0;
  let sold = 0;
  for (const trade of trades) {
    if (trade.side === 'BUY') bought += trade.value;
    else if (trade.side === 'SELL') sold += trade.value;
  }
  return { bought, sold };
}

/** Share of the day's opening balance blocked as margin, 0–100. */
export function marginUsedPct(funds: { used: number; openingBalance: number }): number {
  if (!(funds.openingBalance > 0) || !Number.isFinite(funds.used)) return 0;
  return Math.min(100, Math.max(0, (funds.used / funds.openingBalance) * 100));
}
