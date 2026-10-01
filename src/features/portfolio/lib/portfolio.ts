import type { DonutSegment } from '@/components/ui/Donut';

import type {
  LinkedHoldingRow,
  LinkedPositionRow,
  LiveOrderStatus,
  ManualHolding,
  PortfolioHolding,
  PositionRow,
} from '../types';

/** One holding shape for the screens, whichever book it came from. */
export interface HoldingView {
  key: string;
  symbol: string;
  exchange: string;
  qty: number;
  avg: number;
  ltp: number | null;
  invested: number;
  value: number | null;
  pnl: number | null;
  pnlPct: number | null;
  /** Rupee move of the whole row today; null when unknown (manual holdings, no quote). */
  dayChange: number | null;
  dayChangePct: number | null;
  sector: string | null;
}

export function fromBrokerHolding(holding: PortfolioHolding): HoldingView {
  return {
    key: `${holding.exch}:${holding.sym}`,
    symbol: holding.sym,
    exchange: holding.exch,
    qty: holding.qty,
    avg: holding.avg,
    ltp: holding.ltp,
    invested: holding.invested,
    value: holding.value,
    pnl: holding.pnl,
    pnlPct: holding.pnlPct,
    // mStock reports the day's change per share.
    dayChange: Number.isFinite(holding.dayChange) ? holding.dayChange * holding.qty : null,
    dayChangePct: Number.isFinite(holding.dayChangePct) ? holding.dayChangePct : null,
    sector: holding.sector,
  };
}

export function fromLinkedHolding(holding: LinkedHoldingRow): HoldingView {
  return {
    key: `${holding.exch}:${holding.sym}`,
    symbol: holding.sym,
    exchange: holding.exch,
    qty: holding.qty,
    avg: holding.avg,
    ltp: holding.ltp,
    invested: holding.invested,
    value: holding.value,
    pnl: holding.pnl,
    pnlPct: holding.pnlPct,
    // Linked brokers already report the whole row's move — multiplying by qty (as for
    // mStock) would count it twice.
    dayChange: holding.dayChange,
    dayChangePct: holding.dayChangePct,
    sector: holding.sector,
  };
}

/**
 * A holding re-priced at a live price: value, returns and today's move all follow it. Today's
 * move is measured against the previous close the REST row implies (its price less its own
 * per-share move), so it stays consistent with what the broker reported. The same object comes
 * back when the price is unchanged or unusable.
 */
export function repriceHolding(holding: HoldingView, ltp: number): HoldingView {
  if (!(ltp > 0) || !Number.isFinite(ltp) || ltp === holding.ltp) return holding;
  const value = holding.qty * ltp;
  const pnl = value - holding.invested;
  const prevClose =
    holding.ltp !== null && holding.dayChange !== null && holding.qty > 0
      ? holding.ltp - holding.dayChange / holding.qty
      : null;
  const priced = prevClose !== null && prevClose > 0;
  return {
    ...holding,
    ltp,
    value,
    pnl,
    pnlPct: holding.invested > 0 ? (pnl / holding.invested) * 100 : null,
    dayChange: priced ? (ltp - prevClose) * holding.qty : null,
    dayChangePct: priced ? ((ltp - prevClose) / prevClose) * 100 : null,
  };
}

export interface BookTotals {
  value: number;
  invested: number;
  pnl: number;
  pnlPct: number | null;
}

/**
 * The server's totals moved by exactly what the live prices changed — a delta, not a re-sum, so
 * however the server counts (unpriced rows, settling quantity) stays its rule. Rows the REST
 * snapshot could not value are left out of the delta rather than added whole.
 */
export function liveTotals(
  totals: BookTotals,
  base: readonly HoldingView[],
  live: readonly HoldingView[],
): BookTotals {
  let delta = 0;
  for (let i = 0; i < base.length; i++) {
    const before = base[i]!;
    const after = live[i];
    if (!after || after === before || before.value === null || after.value === null) continue;
    delta += after.value - before.value;
  }
  if (delta === 0) return totals;
  const pnl = totals.pnl + delta;
  return {
    value: totals.value + delta,
    invested: totals.invested,
    pnl,
    pnlPct: totals.invested > 0 ? (pnl / totals.invested) * 100 : totals.pnlPct,
  };
}

/** Same product → kind rule the server applies to mStock rows (portfolio-positions.ts). */
export function fromLinkedPosition(position: LinkedPositionRow): PositionRow {
  const product = (position.product ?? '').toUpperCase();
  return {
    sym: position.sym,
    exch: position.exch,
    product,
    kind: product === 'CNC' ? 'delivery' : product === 'MIS' ? 'intraday' : 'carry',
    qty: position.qty,
    avg: position.netAvg,
    ltp: position.ltp,
    buyQty: position.buyQty,
    buyAvg: position.buyAvg,
    sellQty: position.sellQty,
    sellAvg: position.sellAvg,
    realised: position.realised,
    unrealised: position.unrealised,
    pnl: position.pnl,
    value: position.ltp !== null ? position.ltp * position.qty : position.netAvg * position.qty,
  };
}

export function fromManualHolding(holding: ManualHolding): HoldingView {
  return {
    key: holding.id,
    symbol: holding.sym,
    exchange: holding.exch,
    qty: holding.qty,
    avg: holding.avg,
    ltp: holding.ltp,
    invested: holding.invested,
    value: holding.value,
    pnl: holding.pnl,
    pnlPct: holding.pnlPct,
    dayChange: null,
    dayChangePct: null,
    sector: holding.sector,
  };
}

/**
 * Today's move across the book — only when every row has one, because a partial sum
 * would silently understate it. Percent is against yesterday's value (value − move).
 */
export function dayMove(
  holdings: readonly HoldingView[],
): { abs: number; pct: number | null } | null {
  if (holdings.length === 0) return null;
  let abs = 0;
  let value = 0;
  for (const holding of holdings) {
    if (holding.dayChange === null || holding.value === null) return null;
    abs += holding.dayChange;
    value += holding.value;
  }
  const previous = value - abs;
  return { abs, pct: previous > 0 ? (abs / previous) * 100 : null };
}

// Same palette and grouping as the web's sector allocation (lib/portfolioAnalytics.ts),
// with a dark-theme counterpart: each dark step is lifted to hold contrast on the dark
// surface, in the same order, so a sector keeps its hue across themes.
export interface ChartPalette {
  colors: readonly string[];
  other: string;
}

export const CHART_PALETTES: { light: ChartPalette; dark: ChartPalette } = {
  light: {
    colors: [
      '#1976d2',
      '#00805e',
      '#8b5cf6',
      '#f59e0b',
      '#ec4899',
      '#0ea5e9',
      '#84cc16',
      '#f97316',
    ],
    other: '#9aa0ac',
  },
  dark: {
    colors: [
      '#5b9df0',
      '#1fc896',
      '#a78bfa',
      '#fbbf24',
      '#f472b6',
      '#38bdf8',
      '#a3e635',
      '#fb923c',
    ],
    other: '#6b7280',
  },
};

export const SECTOR_COLORS = CHART_PALETTES.light.colors;

/** Sector split weighted by current value (invested when unpriced); top 5 + "Other". */
export function sectorAllocation(
  holdings: readonly HoldingView[],
  maxSegments = 5,
  palette: ChartPalette = CHART_PALETTES.light,
): DonutSegment[] {
  const totals = new Map<string, number>();
  for (const holding of holdings) {
    const weight = holding.value ?? holding.invested;
    if (!Number.isFinite(weight) || weight <= 0) continue;
    const sector = holding.sector ?? 'Unclassified';
    totals.set(sector, (totals.get(sector) ?? 0) + weight);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, maxSegments);
  const rest = sorted.slice(maxSegments).reduce((sum, [, value]) => sum + value, 0);

  const segments: DonutSegment[] = head.map(([label, value], index) => ({
    label,
    value,
    color: palette.colors[index % palette.colors.length]!,
  }));
  if (rest > 0) segments.push({ label: 'Other', value: rest, color: palette.other });
  return segments;
}

/** The web's labels for order states (MstockBookPanels.tsx). */
export const ORDER_STATUS_LABEL: Record<LiveOrderStatus, string> = {
  DRAFT: 'Draft',
  RISK_REJECTED: 'Blocked by risk check',
  RISK_APPROVED: 'Approved',
  SUBMITTED: 'Submitted',
  ACKNOWLEDGED: 'Open',
  PARTIALLY_FILLED: 'Partly filled',
  FILLED: 'Executed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  UNKNOWN: 'Confirming',
};

export type StatusTone = 'success' | 'danger' | 'warning' | 'neutral';

export function orderStatusTone(status: LiveOrderStatus): StatusTone {
  switch (status) {
    case 'FILLED':
      return 'success';
    case 'REJECTED':
    case 'RISK_REJECTED':
      return 'danger';
    case 'UNKNOWN':
    case 'PARTIALLY_FILLED':
    case 'ACKNOWLEDGED':
    case 'SUBMITTED':
    case 'RISK_APPROVED':
      return 'warning';
    default:
      return 'neutral';
  }
}
