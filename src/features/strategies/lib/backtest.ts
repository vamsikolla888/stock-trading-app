import type { ChartPoint } from '@/components/market/PriceChart';
import { formatNumber } from '@/lib/utils/formatters';

import type {
  BacktestTrade,
  EquityPoint,
  ExitReason,
  IndexSummary,
  StrategyRules,
  SymbolStats,
} from '../types';

/**
 * Shaping backtest results for small screens: the equity curve's range filter, the trade
 * log, the parameters table and the strategy × stock matrix.
 */

/** Mirrors MIN_TRADES_FOR_SYMBOL_STATS on the server — below it a per-stock figure is noise. */
export const MIN_TRADES_FOR_SYMBOL_STATS = 5;
/** Caps that keep the matrix a comparison rather than a spreadsheet (same as the web). */
export const MATRIX_MAX_ROWS = 8;
export const MATRIX_MAX_COLS = 12;

export type EquityRange = '1M' | '3M' | '1Y' | 'ALL';

export const EQUITY_RANGES: readonly { key: EquityRange; label: string; days: number | null }[] = [
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 91 },
  { key: '1Y', label: '1Y', days: 365 },
  { key: 'ALL', label: 'All', days: null },
];

/**
 * The equity curve for a range, as chart points (ms). Ranges count back from the END of the
 * tested window, not from today — a backtest that ended in March has no "last week". A slice
 * too short to draw falls back to the whole series rather than an empty frame.
 */
export function equityPoints(points: readonly EquityPoint[], range: EquityRange): ChartPoint[] {
  const valid = points.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v));
  const days = EQUITY_RANGES.find((r) => r.key === range)?.days ?? null;
  let shown = valid;
  if (days !== null && valid.length > 0) {
    const cutoff = valid[valid.length - 1]!.t - days * 86_400;
    const slice = valid.filter((p) => p.t >= cutoff);
    shown = slice.length >= 2 ? slice : valid;
  }
  return shown.map((p) => ({ time: p.t * 1000, value: p.v }));
}

/** Newest exits first — "recent trades" has to mean recent. */
export function recentTrades(trades: readonly BacktestTrade[], limit = 12): BacktestTrade[] {
  return [...trades].sort((a, b) => b.exitTime - a.exitTime).slice(0, limit);
}

export const EXIT_REASON_LABEL: Record<ExitReason, string> = {
  target: 'Target',
  stop: 'Stop',
  signal: 'Exit rule',
  timeStop: 'Time stop',
  endOfData: 'End of data',
};

export function exitReasonLabel(reason: string): string {
  return EXIT_REASON_LABEL[reason as ExitReason] ?? reason;
}

export interface ParameterRow {
  label: string;
  value: string;
}

/** The stored rules as a parameters table — describes what will run, not a form's state. */
export function parameterRows(
  rules: StrategyRules,
  run: { maxOpenPositions: number; costBps: number } | null,
  indices: readonly IndexSummary[] = [],
): ParameterRow[] {
  const rows: ParameterRow[] = [];
  const universe = rules.universe ?? { exchange: 'NSE' };
  const exchange = universe.exchange === 'ALL' ? 'NSE + BSE' : (universe.exchange ?? 'NSE');
  const index = universe.indexKey
    ? (indices.find((i) => i.key === universe.indexKey)?.label ?? universe.indexKey)
    : null;
  rows.push({ label: 'Universe', value: index ? `${index} only` : exchange });
  if (universe.fnoOnly) rows.push({ label: 'Restricted to', value: 'F&O names' });
  if (universe.minPrice != null) {
    rows.push({ label: 'Minimum price', value: `₹${formatNumber(universe.minPrice, 0)}` });
  }
  if (universe.maxSymbols != null) {
    rows.push({ label: 'Max symbols', value: formatNumber(universe.maxSymbols, 0) });
  }
  if (run) rows.push({ label: 'Max positions', value: String(run.maxOpenPositions) });
  rows.push({ label: 'Position sizing', value: 'Equal weight' });
  const exit = rules.exit ?? { any: [] };
  if (exit.targetPct != null) rows.push({ label: 'Target', value: `+${exit.targetPct}%` });
  if (exit.stopLossPct != null) rows.push({ label: 'Stop loss', value: `−${exit.stopLossPct}%` });
  if (exit.maxHoldBars != null) {
    rows.push({ label: 'Time stop', value: `${exit.maxHoldBars} bars` });
  }
  if (exit.any.length > 0) {
    rows.push({
      label: 'Exit rules',
      value: `${exit.any.length} condition${exit.any.length === 1 ? '' : 's'}`,
    });
  }
  if (run) rows.push({ label: 'Costs', value: `${run.costBps} bps per side` });
  return rows;
}

// ── Strategy × stock matrix ────────────────────────────────────────────────────────────

export type MatrixMetric = 'profitFactor' | 'winRate';

export interface MatrixModel {
  /** "EXCHANGE:SYMBOL" keys, most-traded first. */
  columns: string[];
  /** One map per input row, keyed like `columns`. */
  rows: Map<string, SymbolStats>[];
}

/**
 * Columns are the stocks every compared strategy actually traded, ranked by trades summed
 * across them — so no cell is a blank masquerading as a zero.
 */
export function buildMatrix(
  symbolStatsPerStrategy: readonly (readonly SymbolStats[])[],
  maxCols = MATRIX_MAX_COLS,
): MatrixModel {
  const rows = symbolStatsPerStrategy.map((stats) => {
    const map = new Map<string, SymbolStats>();
    for (const s of stats) map.set(`${s.exchange}:${s.symbol}`, s);
    return map;
  });
  if (rows.length === 0) return { columns: [], rows };
  const counts = new Map<string, number>();
  for (const map of rows) {
    for (const [key, s] of map) counts.set(key, (counts.get(key) ?? 0) + s.trades);
  }
  const columns = [...counts.keys()]
    .filter((key) => rows.every((map) => map.has(key)))
    .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, maxCols);
  return { columns, rows };
}

export type CellTone = 'empty' | 'na' | 'thin' | 'good' | 'strong' | 'weak';

export interface MatrixCell {
  text: string;
  tone: CellTone;
}

/**
 * One cell's text and tone. Break-even differs by metric (1.0 for profit factor, 50% for win
 * rate), and cells below the trade floor are dimmed instead of coloured.
 */
export function matrixCell(stats: SymbolStats | undefined, metric: MatrixMetric): MatrixCell {
  if (!stats) return { text: '—', tone: 'empty' };
  const value = metric === 'profitFactor' ? stats.profitFactor : stats.winRate;
  if (value == null || !Number.isFinite(value)) return { text: 'n/a', tone: 'na' };
  const text = metric === 'profitFactor' ? formatNumber(value, 2) : `${formatNumber(value, 0)}%`;
  if (stats.trades < MIN_TRADES_FOR_SYMBOL_STATS) return { text, tone: 'thin' };
  const good = metric === 'profitFactor' ? value > 1 : value > 50;
  const strong = metric === 'profitFactor' ? value >= 1.5 : value >= 60;
  return { text, tone: strong ? 'strong' : good ? 'good' : 'weak' };
}
