import { formatNumber, formatPercent, formatSignedPercent } from '@/lib/utils/formatters';

import type { StrategyMetrics, StrategySummary } from '../types';

/**
 * How the strategy library is ordered and when its numbers deserve trust — ported from the
 * web client's strategy-ranking.ts so the two apps never disagree on what a thin sample is.
 */

export type SortKey = 'return' | 'expectancy' | 'winRate' | 'trades' | 'drawdown';

export const SORTS: readonly { key: SortKey; label: string }[] = [
  { key: 'expectancy', label: 'Expectancy' },
  { key: 'return', label: 'Return' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'trades', label: 'Sample' },
  { key: 'drawdown', label: 'Drawdown' },
];

/**
 * The value a sort key reads; higher sorts first. An un-backtested strategy is -Infinity, so
 * "never measured" sorts last rather than looking like a score of zero.
 */
export function sortValue(strategy: StrategySummary, key: SortKey): number {
  const m = strategy.metrics;
  if (!m) return Number.NEGATIVE_INFINITY;
  if (key === 'return') return m.totalReturnPct;
  if (key === 'expectancy') return m.expectancyPct;
  if (key === 'winRate') return m.winRate;
  if (key === 'trades') return m.totalTrades;
  // Drawdown is negative, so the shallowest is already the largest value.
  return m.maxDrawdownPct;
}

/** A stable sort (ties keep the server's order). */
export function sortStrategies(
  strategies: readonly StrategySummary[],
  key: SortKey,
): StrategySummary[] {
  return strategies
    .map((strategy, index) => ({ strategy, index }))
    .sort((a, b) => {
      const av = sortValue(a.strategy, key);
      const bv = sortValue(b.strategy, key);
      if (av === bv) return a.index - b.index;
      return bv - av;
    })
    .map(({ strategy }) => strategy);
}

export type SampleTone = 'none' | 'too-few' | 'thin' | 'ok';

export interface SampleVerdict {
  label: string;
  tone: SampleTone;
  trades: number;
}

/** Below ~30 trades a ranking is mostly luck — said on the card, where it gets read. */
export function sampleVerdict(strategy: StrategySummary): SampleVerdict | null {
  if (!strategy.metrics) return null;
  const n = strategy.metrics.totalTrades;
  if (n === 0) return { label: 'No trades', tone: 'none', trades: 0 };
  if (n < 10) return { label: `${n} trades — too few to judge`, tone: 'too-few', trades: n };
  if (n < 30) return { label: `${n} trades — thin sample`, tone: 'thin', trades: n };
  return { label: `${formatNumber(n, 0)} trades`, tone: 'ok', trades: n };
}

/** Names that appear more than once (lowercased, trimmed). */
export function duplicateNames(strategies: readonly StrategySummary[]): Set<string> {
  const counts = new Map<string, number>();
  for (const strategy of strategies) {
    const key = strategy.name.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([name]) => name));
}

export interface Headline {
  label: string;
  value: string;
  /** Sign used to colour the value; undefined keeps it neutral. */
  trend?: number;
  /** Always a loss colour (drawdown). */
  negative?: boolean;
}

/** The card's big number follows the active sort, so the order and the figures agree. */
export function headlineFor(metrics: StrategyMetrics, sort: SortKey): Headline {
  switch (sort) {
    case 'trades':
      return { label: 'Trades', value: formatNumber(metrics.totalTrades, 0) };
    case 'winRate':
      return { label: 'Win rate', value: formatPercent(metrics.winRate, 1) };
    case 'drawdown':
      return {
        label: 'Worst fall',
        value: formatPercent(metrics.maxDrawdownPct, 1),
        negative: true,
      };
    case 'return':
      return {
        label: 'Total return',
        value: formatSignedPercent(metrics.totalReturnPct, 1),
        trend: metrics.totalReturnPct,
      };
    case 'expectancy':
    default:
      return {
        label: 'Expectancy / trade',
        value: formatSignedPercent(metrics.expectancyPct, 2),
        trend: metrics.expectancyPct,
      };
  }
}

/** "1.84", or "n/a" when there were no losing trades (never ∞). */
export function formatProfitFactor(profitFactor: number | null | undefined): string {
  return typeof profitFactor === 'number' && Number.isFinite(profitFactor)
    ? formatNumber(profitFactor, 2)
    : 'n/a';
}
