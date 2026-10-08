import type { StatusTone } from '@/features/settings/lib/status';
import { EMPTY_VALUE, formatNumber, formatSignedINR } from '@/lib/utils/formatters';

import type {
  IntradayExit,
  IntradayFunnel,
  IntradayStockRow,
  IntradayTrade,
  IntradayVariant,
  LineStats,
  RefreshJob,
  Rejection,
  StockVerdict,
} from '../types';
import { dayLabel } from './houseView';

/**
 * Words and small arithmetic for the intraday platform strategy (Bollinger Mid-Band Thrust) —
 * the port of the web's lib/intradayView.ts, with its pinned cases in __tests__/intraday.test.ts.
 * Short on purpose: the screen leads with numbers. No Intl dates, so labels match on every engine.
 */

const MINUS = '−';

export const VERDICT_VIEW: Record<
  StockVerdict,
  { label: string; tone: StatusTone; title: string }
> = {
  works: {
    label: 'Works',
    tone: 'ok',
    title: 'Positive after costs, profit factor ≥ 1.3, both halves of its history positive',
  },
  mixed: { label: 'Mixed', tone: 'warn', title: 'Positive, but a thin or uneven edge' },
  avoid: { label: 'Avoid', tone: 'bad', title: 'Loses money after costs' },
  thin: {
    label: 'Too few trades',
    tone: 'neutral',
    title: 'Fewer than 8 trades — not enough to judge',
  },
};
export const VERDICT_ORDER: readonly StockVerdict[] = ['works', 'mixed', 'avoid', 'thin'];

export const EXIT_VIEW: Record<IntradayExit, string> = {
  'upper-band': 'Upper band → red candle',
  stop: 'Stop (signal low)',
  'mid-band': 'Back below middle band',
  'square-off': 'Square-off 15:15',
  'end-of-data': 'Open at data end',
};

/** An exit in words; a reason this app doesn't know reads as itself. */
export function exitLabel(exit: string): string {
  return EXIT_VIEW[exit as IntradayExit] ?? exit;
}

export const REJECTION_VIEW: Record<Rejection, string> = {
  window: 'Outside entry time',
  volume: 'Volume too light',
  trend: 'Middle band not rising',
  vwap: 'Below VWAP',
  room: 'Too close to upper band',
  limit: 'Daily entry limit',
  risk: 'Stop too far / gapped',
};
const REJECTION_ORDER: readonly Rejection[] = [
  'window',
  'volume',
  'trend',
  'vwap',
  'room',
  'limit',
  'risk',
];

export interface FunnelStep {
  key: string;
  label: string;
  remaining: number;
  dropped: number;
}

/** The signal funnel as steps with what remains after each: crosses → green → filters → trades. */
export function funnelSteps(f: IntradayFunnel): FunnelStep[] {
  const steps: FunnelStep[] = [
    { key: 'crosses', label: 'Crossed the middle band', remaining: f.crosses, dropped: 0 },
    { key: 'green', label: 'On a green candle', remaining: f.green, dropped: f.crosses - f.green },
  ];
  let left = f.green;
  for (const r of REJECTION_ORDER) {
    const n = f.rejected[r] ?? 0;
    if (!n) continue;
    left -= n;
    steps.push({ key: r, label: REJECTION_VIEW[r], remaining: left, dropped: n });
  }
  steps.push({ key: 'taken', label: 'Traded', remaining: f.taken, dropped: 0 });
  return steps;
}

const IST_SECONDS = 19_800;

/** "10:35" (IST) from unix seconds. */
export function timeOfDay(t: number): string {
  const d = new Date((t + IST_SECONDS) * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Tue, 6 Oct" from YYYY-MM-DD. */
export function shortDay(day: string): string {
  return dayLabel(day);
}

/** "45 min", "2 h 5 min". */
export function minutes(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return EMPTY_VALUE;
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h} h ${r} min` : `${h} h`;
}

/** Signed whole rupees: "+₹1,240", "−₹310", "₹0". */
export function signedRupees(v: number | null | undefined): string {
  return formatSignedINR(v, 0);
}

/** A change in percentage points: "+1.2 pts", "−0.4 pts". */
export function signedPoints(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return EMPTY_VALUE;
  return `${v > 0 ? '+' : v < 0 ? MINUS : ''}${Math.abs(v).toFixed(1)} pts`;
}

export type CompareKind = 'int' | 'pct' | 'signed' | 'ratio' | 'rupees';

export interface CompareRow {
  key: string;
  label: string;
  base: number | null;
  improved: number | null;
  better: 'base' | 'improved' | null;
  kind: CompareKind;
}

type Line = LineStats & { maxDrawdownPct?: number };

/** "Your rules vs improved": each figure for both variants, and which one is better. */
export function compareRows(base: Line, improved: Line): CompareRow[] {
  const pick = (a: number | null, b: number | null): CompareRow['better'] => {
    if (a == null || b == null || a === b) return null;
    return b > a ? 'improved' : 'base';
  };
  const out: CompareRow[] = [
    {
      key: 'avg',
      label: 'Per trade',
      base: base.avgReturnPct,
      improved: improved.avgReturnPct,
      better: pick(base.avgReturnPct, improved.avgReturnPct),
      kind: 'signed',
    },
    {
      key: 'win',
      label: 'Win rate',
      base: base.winRate,
      improved: improved.winRate,
      better: pick(base.winRate, improved.winRate),
      kind: 'pct',
    },
    {
      key: 'pf',
      label: 'Profit factor',
      base: base.profitFactor,
      improved: improved.profitFactor,
      better: pick(base.profitFactor, improved.profitFactor),
      kind: 'ratio',
    },
    {
      // Fewer trades is neither better nor worse.
      key: 'trades',
      label: 'Trades',
      base: base.trades,
      improved: improved.trades,
      better: null,
      kind: 'int',
    },
    {
      key: 'pnl',
      label: 'Net P&L, ₹1 L a trade',
      base: base.netPnl,
      improved: improved.netPnl,
      better: pick(base.netPnl, improved.netPnl),
      kind: 'rupees',
    },
    {
      key: 'works',
      label: 'Stocks it works on',
      base: base.stocksWorking,
      improved: improved.stocksWorking,
      better: pick(base.stocksWorking, improved.stocksWorking),
      kind: 'int',
    },
  ];
  if (base.maxDrawdownPct != null && improved.maxDrawdownPct != null) {
    // Drawdowns are negative: closer to zero is better, which is "higher".
    out.push({
      key: 'dd',
      label: 'Max fall',
      base: base.maxDrawdownPct,
      improved: improved.maxDrawdownPct,
      better: pick(base.maxDrawdownPct, improved.maxDrawdownPct),
      kind: 'pct',
    });
  }
  return out;
}

/** A variant's figures with the portfolio drawdown folded in, for `compareRows`. */
export function lineOf(v: IntradayVariant | undefined): Line | null {
  return v ? { ...v.line, maxDrawdownPct: v.run.metrics.maxDrawdownPct } : null;
}

const QUEUED = new Set(['waiting', 'delayed', 'prioritized', 'waiting-children']);

/** The re-test is queued or running — the page polls while this holds. */
export function isJobInFlight(job: Pick<RefreshJob, 'state'> | null | undefined): boolean {
  const state = job?.state ?? null;
  return state === 'active' || (state !== null && QUEUED.has(state));
}

/**
 * What the re-test is doing, in one line — so the page never sits on "Not tested yet" while a
 * job waits for a worker that isn't there. Null when there is nothing to say.
 */
export function jobNotice(
  job: Pick<RefreshJob, 'state' | 'workers' | 'failedReason'> | null | undefined,
): { tone: 'info' | 'warning' | 'error'; text: string } | null {
  if (!job?.state) return null;
  if (QUEUED.has(job.state)) {
    return job.workers === 0
      ? { tone: 'error', text: 'Queued, but no worker is running strategy jobs.' }
      : { tone: 'info', text: 'Queued — starts shortly.' };
  }
  if (job.state === 'active') {
    return {
      tone: 'info',
      text: 'Running — syncing 5-minute candles, then backtesting. A first Nifty 500 sync takes about 40 minutes.',
    };
  }
  if (job.state === 'failed') {
    return { tone: 'error', text: `The last run failed: ${job.failedReason ?? 'unknown error'}` };
  }
  return null;
}

/** The toast after an admin queues the re-test. */
export function retestMessage(alreadyQueued: boolean): { title: string; message: string } {
  return alreadyQueued
    ? { title: 'Already queued', message: 'This page updates as it runs.' }
    : { title: 'Re-test queued', message: 'Syncs 5-minute candles, then backtests.' };
}

/** Bar length, 0–100, against the largest magnitude present (never a hard-coded maximum). */
export function barWidth(
  value: number | null | undefined,
  all: readonly (number | null | undefined)[],
): number {
  const max = Math.max(0, ...all.map((v) => Math.abs(v ?? 0)));
  if (!max || value == null) return 0;
  return Math.round((Math.abs(value) / max) * 1000) / 10;
}

/** "₹1 lakh" — the money each backtested trade put in. */
export function notionalLabel(notionalInr: number | null | undefined): string {
  const lakh = (notionalInr ?? 100_000) / 100_000;
  return `₹${formatNumber(lakh, Number.isInteger(lakh) ? 0 : 2)} lakh`;
}

// ── Stocks tab ─────────────────────────────────────────────────────────────────────────

export type StockShow = 'all' | StockVerdict;
export type StockSort = 'verdict' | 'avg' | 'winRate' | 'trades' | 'pf' | 'pnl' | 'hold' | 'symbol';

export const STOCK_SORTS: readonly { key: StockSort; label: string }[] = [
  { key: 'verdict', label: 'Verdict' },
  { key: 'avg', label: 'Per trade' },
  { key: 'winRate', label: 'Win rate' },
  { key: 'trades', label: 'Trades' },
  { key: 'pf', label: 'Profit factor' },
  { key: 'pnl', label: 'Net ₹' },
  { key: 'hold', label: 'Avg hold' },
  { key: 'symbol', label: 'Symbol' },
];

const VERDICT_RANK: Record<StockVerdict, number> = { works: 0, mixed: 1, thin: 2, avoid: 3 };

export function verdictCounts(rows: readonly IntradayStockRow[]): Record<StockVerdict, number> {
  const c: Record<StockVerdict, number> = { works: 0, mixed: 0, avoid: 0, thin: 0 };
  for (const r of rows) c[r.verdict] += 1;
  return c;
}

function sortValue(r: IntradayStockRow, key: Exclude<StockSort, 'symbol'>): number {
  switch (key) {
    case 'verdict':
      return -VERDICT_RANK[r.verdict] * 1e6 + r.score;
    case 'avg':
      return r.avgReturnPct;
    case 'winRate':
      return r.winRate;
    case 'trades':
      return r.trades;
    case 'pf':
      return r.profitFactor ?? -1;
    case 'pnl':
      return r.netPnl;
    case 'hold':
      return r.avgHoldMinutes;
  }
}

/**
 * The Stocks tab's rows: filtered by symbol and verdict, best first on the chosen figure
 * (A→Z for the symbol). Ties break on the symbol so the order never shuffles between renders.
 */
export function visibleStocks(
  rows: readonly IntradayStockRow[],
  opts: { query: string; show: StockShow; sort: StockSort },
): IntradayStockRow[] {
  const needle = opts.query.trim().toUpperCase();
  const { sort } = opts;
  return rows
    .filter(
      (r) =>
        (!needle || r.symbol.includes(needle)) && (opts.show === 'all' || r.verdict === opts.show),
    )
    .sort((a, b) =>
      sort === 'symbol'
        ? a.symbol.localeCompare(b.symbol)
        : sortValue(b, sort) - sortValue(a, sort) || a.symbol.localeCompare(b.symbol),
    );
}

/** The losers to avoid, worst first. */
export function avoidList(rows: readonly IntradayStockRow[], limit = 8): IntradayStockRow[] {
  return rows
    .filter((r) => r.verdict === 'avoid')
    .sort((a, b) => a.avgReturnPct - b.avgReturnPct)
    .slice(0, limit);
}

/**
 * One stock's figures from its own trades — the drill-down's headline, with the server's
 * definitions (a win is a positive net return; profit factor = summed wins ÷ summed losses, null
 * when nothing lost). Null for no trades.
 */
export function stockSummary(trades: readonly IntradayTrade[]): {
  trades: number;
  winRate: number;
  avgReturnPct: number;
  profitFactor: number | null;
  netPnl: number;
  avgHoldMinutes: number;
} | null {
  if (trades.length === 0) return null;
  const rets = trades.map((t) => t.returnPct);
  const won = rets.filter((r) => r > 0);
  const lost = Math.abs(rets.filter((r) => r <= 0).reduce((a, b) => a + b, 0));
  const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
  return {
    trades: trades.length,
    winRate: (won.length / trades.length) * 100,
    avgReturnPct: sum(rets) / trades.length,
    profitFactor: lost > 0 ? sum(won) / lost : null,
    netPnl: sum(trades.map((t) => t.netPnl)),
    avgHoldMinutes: sum(trades.map((t) => t.holdMinutes)) / trades.length,
  };
}

// ── Trades tab ─────────────────────────────────────────────────────────────────────────

export type TradeOutcome = 'all' | 'wins' | 'losses';

/** The exits present in these trades, in the engine's order (unknown ones last). */
export function exitReasons(trades: readonly IntradayTrade[]): string[] {
  const order: string[] = ['upper-band', 'stop', 'mid-band', 'square-off', 'end-of-data'];
  const present = [...new Set(trades.map((t) => t.exit))];
  const rank = (e: string) => (order.includes(e) ? order.indexOf(e) : order.length);
  return present.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/** Trades filtered by symbol, outcome (a win is a positive net return) and exit reason. */
export function filterTrades(
  trades: readonly IntradayTrade[],
  opts: { query: string; outcome: TradeOutcome; exit: string | null },
): IntradayTrade[] {
  const needle = opts.query.trim().toUpperCase();
  return trades.filter(
    (t) =>
      (!needle || t.symbol.includes(needle)) &&
      (opts.outcome === 'all' || (opts.outcome === 'wins' ? t.returnPct > 0 : t.returnPct <= 0)) &&
      (!opts.exit || t.exit === opts.exit),
  );
}
