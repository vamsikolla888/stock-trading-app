import { formatIst } from '@/features/insights/lib/dates';
import { formatCompactNumber, formatNumber } from '@/lib/utils/formatters';

import type { ScreenerMatch } from '../types';

/**
 * How a screener match's evidence reads. Ported from the web client's MatchesTable so both
 * apps name and format the same metric the same way.
 */

const SPECIAL: Record<string, string> = {
  rsi: 'RSI',
  sma50: 'SMA 50',
  sma200: 'SMA 200',
  macd: 'MACD',
  volumeRatio: 'Vol vs avg',
  avgVolume20: 'Avg vol (20)',
  fiftyTwoWeekHigh: '52w high',
  fiftyTwoWeekLow: '52w low',
  upperBand: 'Upper band',
  middleBand: 'Mid band',
  barsAgo: 'Bars ago',
  aboveSma200Pct: 'vs SMA 200',
  breakoutPct: 'Above resistance',
  fromHighPct: 'From high',
  gapPct: 'Gap',
  heldPct: 'Held',
  abovePct: 'Above band',
  spreadPct: 'Spread',
  rangePct: '52w range',
};

/** `volumeRatio` → "Vol vs avg"; custom screeners already send "RSI(14)" and pass through. */
export function humanizeMetric(key: string): string {
  const special = SPECIAL[key];
  if (special) return special;
  if (/[()\s]/.test(key)) return key;
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/Pct\b/i, '%')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/** Percent keys get "%", ratios "×", volumes grouped, everything else two decimals. */
export function formatMetric(key: string, value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (/pct$/i.test(key) || key.includes('%')) return `${formatNumber(value, 2)}%`;
  if (/ratio$/i.test(key)) return `${formatNumber(value, 2)}×`;
  if (/volume/i.test(key)) return formatCompactNumber(value);
  if (key === 'barsAgo') return String(Math.round(value));
  if (Math.abs(value) >= 100_000) return formatCompactNumber(value);
  return formatNumber(value, 2);
}

/** A match's evidence as "RSI 28.40 · Vol vs avg 2.10×", in the server's key order. */
export function metricSummary(metrics: Record<string, number> | undefined, max = 4): string {
  if (!metrics) return '';
  return Object.entries(metrics)
    .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
    .slice(0, max)
    .map(([key, value]) => `${humanizeMetric(key)} ${formatMetric(key, value)}`)
    .join(' · ');
}

/** "Last run 22 Aug, 01:11 IST", or "Never run". */
export function lastRunLabel(runAt: string | null | undefined): string {
  if (!runAt) return 'Never run';
  const when = formatIst(runAt, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return when === '—' ? 'Run recently' : `Last run ${when} IST`;
}

export function pluralize(count: number, noun: string, plural = `${noun}s`): string {
  return `${formatNumber(count, 0)} ${count === 1 ? noun : plural}`;
}

/** The last `n` closes of a match as a sparkline series (tolerates rows without history). */
export function matchTrend(match: Pick<ScreenerMatch, 'recentCloses'>): number[] {
  return Array.isArray(match.recentCloses)
    ? match.recentCloses.filter((close) => Number.isFinite(close))
    : [];
}
