import type { StatusTone } from '@/features/settings/lib/status';
import {
  EMPTY_VALUE,
  formatINR,
  formatNumber,
  formatPercent,
  formatSignedINR,
  formatSignedPercent,
} from '@/lib/utils/formatters';

import type {
  BacktestDays,
  BacktestPoint,
  BacktestSummary,
  BacktestTrade,
  BacktestUnderlying,
  BotMode,
  BotSummarySettings,
  Breakdown,
  DailyPoint,
  ExitReason,
  FunnelKey,
  FunnelStage,
  ModeFilter,
  RangeKey,
  RunOutcome,
  RunView,
  TraceStep,
  TradePhase,
  TradeRow,
  TradeStats,
} from '../types';

/**
 * Pure presentation for the index bot — words, tones and formats, free of React so they are
 * tested. Colour is calm: green/red only for the sign of a P&L figure; a HOLD (the normal, safe
 * outcome of most scans) is grey, never red.
 */

/* ── filters and tabs ── */

export type BotTab = 'overview' | 'trades' | 'decisions' | 'backtest' | 'controls';

export const BOT_TABS: readonly { key: BotTab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'trades', label: 'Trades' },
  { key: 'decisions', label: 'Decisions' },
  { key: 'backtest', label: 'Backtest' },
  { key: 'controls', label: 'Controls' },
];

export const BACKTEST_UNDERLYINGS: readonly { key: BacktestUnderlying; label: string }[] = [
  { key: 'NIFTY', label: 'NIFTY' },
  { key: 'BANKNIFTY', label: 'BANKNIFTY' },
];

export const BACKTEST_RANGES: readonly { key: '30' | '60' | '90'; label: string }[] = [
  { key: '30', label: '30D' },
  { key: '60', label: '60D' },
  { key: '90', label: '90D' },
];

export const MODE_FILTERS: readonly { key: ModeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'paper', label: 'Paper' },
  { key: 'live', label: 'Live' },
];

export const RANGES: readonly { key: RangeKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7D' },
  { key: '30d', label: '30D' },
  { key: '90d', label: '90D' },
  { key: 'all', label: 'All' },
];

type RawParam = string | string[] | undefined;

function pick<K extends string>(raw: RawParam, options: readonly { key: K }[], fallback: K): K {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return options.some((o) => o.key === value) ? (value as K) : fallback;
}

/** `?tab=controls` etc.; anything else opens the Overview. */
export const parseTab = (raw: RawParam): BotTab => pick(raw, BOT_TABS, 'overview');
export const parseMode = (raw: RawParam): ModeFilter => pick(raw, MODE_FILTERS, 'all');
/** Overview and Trades default to 30 days, as the server does. */
export const parseRange = (raw: RawParam): RangeKey => pick(raw, RANGES, '30d');
/** Backtest: `?index=BANKNIFTY&days=60`; NIFTY over 30 days otherwise, as the server defaults. */
export const parseBacktestUnderlying = (raw: RawParam): BacktestUnderlying =>
  pick(raw, BACKTEST_UNDERLYINGS, 'NIFTY');
export const parseBacktestDays = (raw: RawParam): BacktestDays =>
  Number(pick(raw, BACKTEST_RANGES, '30')) as BacktestDays;

export type PhaseFilter = 'all' | 'closed' | 'open' | 'review' | 'rejected';

export function parsePhase(raw: RawParam): PhaseFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return value === 'closed' || value === 'open' || value === 'review' || value === 'rejected'
    ? value
    : 'all';
}

/* ── numbers ── */

/** "−₹1,240" — the sign in front of the currency. */
export function money(n: number | null | undefined, digits = 0): string {
  return formatINR(n, digits);
}

/** "+₹1,240" / "−₹310" / "₹0". Rounds BEFORE choosing the sign, so −0.4 reads ₹0, not −₹0. */
export function signedMoney(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return EMPTY_VALUE;
  const rounded = Number(n.toFixed(digits));
  return formatSignedINR(rounded === 0 ? 0 : rounded, digits);
}

/** An option premium: two decimals, the way it is quoted. */
export function premium(n: number | null | undefined): string {
  return formatINR(n, 2);
}

/** A chart axis value, short: "₹800", "−₹2.5k", "₹1.2L". */
export function axisMoney(n: number): string {
  if (!Number.isFinite(n)) return EMPTY_VALUE;
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  const short = (v: number) => String(Number(v.toFixed(1)));
  if (abs >= 1e7) return `${sign}₹${short(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${short(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${short(abs / 1e3)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/** Percent units in: 41.2 → "41%" (digits 0) / "41.2%". */
export function pct(n: number | null | undefined, digits = 0): string {
  return formatPercent(n, digits);
}

export function whole(n: number | null | undefined): string {
  return formatNumber(n, 0);
}

/** The sign of a P&L figure for colour: zero and unknown are neither. */
export function pnlSign(n: number | null | undefined): 'gain' | 'loss' | null {
  if (n == null || !Number.isFinite(n) || Math.abs(n) < 0.005) return null;
  return n > 0 ? 'gain' : 'loss';
}

/** A P&L figure's StatTile tone: green up, red down, plain at zero. */
export function pnlTone(n: number | null | undefined): StatusTone | undefined {
  const sign = pnlSign(n);
  return sign === 'gain' ? 'ok' : sign === 'loss' ? 'bad' : undefined;
}

/** "42 min" · "1 h 05 min" · "3 d". */
export function holdTime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes < 0) return EMPTY_VALUE;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes - h * 60);
    return m ? `${h} h ${String(m).padStart(2, '0')} min` : `${h} h`;
  }
  return `${Math.round(minutes / (24 * 60))} d`;
}

/** "5 Oct" for an IST calendar day key (YYYY-MM-DD). */
export function dayLabel(day: string): string {
  const d = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return day;
  return d.toLocaleDateString('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' });
}

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatNumber(n, 0)} ${n === 1 ? one : many}`;

/* ── trades ── */

const PHASE_VIEW: Record<TradePhase, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
  review: { label: 'Needs review', tone: 'bad' },
  rejected: { label: 'Rejected', tone: 'warn' },
  resolved: { label: 'Resolved', tone: 'neutral' },
};

export function phaseView(phase: TradePhase): { label: string; tone: StatusTone } {
  return PHASE_VIEW[phase] ?? { label: phase, tone: 'neutral' };
}

export const EXIT_LABEL: Record<ExitReason, string> = {
  target: 'Target hit',
  stop: 'Stop hit',
  time: 'Time exit',
};

const KIND_WORD: Record<string, string> = { CE: 'Call', PE: 'Put' };
export const kindWord = (kind: string): string => KIND_WORD[kind] ?? (kind || EMPTY_VALUE);

export const modeWord = (mode: BotMode): string => (mode === 'live' ? 'Live' : 'Paper');

/** "NIFTY · Call · Paper · 1 lot" — the line under a contract. */
export function tradeLine(row: TradeRow): string {
  const parts = [row.underlying, kindWord(row.kind), modeWord(row.mode)].filter(Boolean);
  if (row.lots != null) parts.push(plural(row.lots, 'lot'));
  return parts.join(' · ');
}

/** "₹120.50 → ₹150.25" (≈ for a derived live exit), or the entry alone while open. */
export function fillsLine(row: TradeRow): string {
  const entry = premium(row.entryPrice ?? row.plannedEntry);
  if (row.exitPrice == null) return entry;
  return `${entry} → ${row.exitPriceDerived ? '≈ ' : ''}${premium(row.exitPrice)}`;
}

/** Where to check an uncertain entry before resolving it. */
export const reviewPlace = (mode: BotMode): string =>
  mode === 'live' ? 'Groww position and smart orders' : 'paper F&O book';

export const PHASE_FILTERS: readonly { key: PhaseFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'closed', label: 'Closed' },
  { key: 'open', label: 'Open' },
  { key: 'review', label: 'Needs review' },
  { key: 'rejected', label: 'Rejected' },
];

export function phaseCounts(
  rows: readonly TradeRow[],
  stats: TradeStats,
): Record<PhaseFilter, number> {
  return {
    all: rows.length,
    closed: stats.closed,
    open: stats.open,
    review: stats.review,
    rejected: stats.rejected,
  };
}

export function filterTrades(rows: readonly TradeRow[], phase: PhaseFilter): TradeRow[] {
  return phase === 'all' ? [...rows] : rows.filter((row) => row.phase === phase);
}

/**
 * The win-rate tone against what the bot needs: below its typical break-even (≈ 40% at a 1.5
 * reward/risk after charges) is a warning, not a failure — small samples swing.
 */
export function winRateTone(rate: number | null, closed: number): StatusTone | undefined {
  if (rate == null || closed < 5) return undefined;
  return rate >= 40 ? undefined : 'warn';
}

/** Best and worst trading day of a series (days with a trade only). */
export function dayExtremes(daily: readonly DailyPoint[]): {
  best: number | null;
  worst: number | null;
  tradeDays: number;
} {
  const days = daily.filter((d) => d.trades > 0);
  if (days.length === 0) return { best: null, worst: null, tradeDays: 0 };
  const nets = days.map((d) => d.net);
  return { best: Math.max(...nets), worst: Math.min(...nets), tradeDays: days.length };
}

export function streakText(streak: TradeStats['streak']): string {
  if (!streak) return EMPTY_VALUE;
  return streak.kind === 'win'
    ? `${streak.length} win${streak.length === 1 ? '' : 's'}`
    : `${streak.length} loss${streak.length === 1 ? '' : 'es'}`;
}

/** Breakdown bars: each group's share of the largest group's trades (0–100). */
export function breakdownShares(rows: readonly Breakdown[]): number[] {
  const max = Math.max(0, ...rows.map((r) => r.trades));
  return rows.map((r) => (max > 0 ? (r.trades / max) * 100 : 0));
}

/* ── scans ── */

const OUTCOME_VIEW: Record<RunOutcome, { label: string; tone: StatusTone }> = {
  ordered: { label: 'Order placed', tone: 'ok' },
  hold: { label: 'Held', tone: 'neutral' },
  error: { label: 'Error', tone: 'bad' },
  running: { label: 'Running', tone: 'info' },
};

export function outcomeView(outcome: RunOutcome): { label: string; tone: StatusTone } {
  return OUTCOME_VIEW[outcome] ?? { label: outcome, tone: 'neutral' };
}

/**
 * A raw run or intent status word's tone (the web's runTone). HOLD, CLOSED and a finished test
 * scan are neutral — the bot doing nothing is the safe default.
 */
export function statusTone(status: string): StatusTone {
  const s = status.toUpperCase();
  if (s === 'ENTERED' || s === 'FILLED' || s === 'OPEN') return 'ok';
  if (s === 'ERROR' || s === 'FAILED' || s === 'UNKNOWN' || s === 'REJECTED') return 'bad';
  if (s === 'RUNNING' || s === 'SUBMITTING' || s === 'EXITING') return 'info';
  return 'neutral';
}

/** "Buy call · NIFTY", "Hold", or "—" when the scan never reached the trader. */
export function proposalLabel(run: Pick<RunView, 'action' | 'underlying'>): string {
  if (!run.action) return EMPTY_VALUE;
  if (run.action === 'HOLD') return 'Hold';
  return `${run.action === 'BUY_CALL' ? 'Buy call' : 'Buy put'}${run.underlying ? ` · ${run.underlying}` : ''}`;
}

/** The trader's call in a sentence: "Buy a put on BANKNIFTY". */
export function traderCall(action: RunView['action'], underlying: string | null): string {
  if (!action || action === 'HOLD') return 'Hold';
  return `${action === 'BUY_CALL' ? 'Buy a call' : 'Buy a put'}${underlying ? ` on ${underlying}` : ''}`;
}

/** "34% vs 41%" — the lower bound against break-even; "—" without an edge test. */
export function edgeLine(run: Pick<RunView, 'edge'>): string {
  return run.edge
    ? `${pct(run.edge.wilsonLower95)} vs ${pct(run.edge.breakEvenRate)}`
    : EMPTY_VALUE;
}

export const STAGE_STEPS: readonly { key: FunnelKey; label: string }[] = [
  { key: 'scanned', label: 'Scan' },
  { key: 'debated', label: 'Debate' },
  { key: 'proposed', label: 'Proposal' },
  { key: 'checked', label: 'Risk checks' },
  { key: 'edge', label: 'Edge' },
  { key: 'ordered', label: 'Order' },
];

export type StepState = 'done' | 'stop' | 'run' | 'todo';

/** How far a scan got: every step passed, where it stopped (or is running), what it never reached. */
export function stageSteps(
  run: Pick<RunView, 'stage' | 'outcome'>,
): { key: FunnelKey; label: string; state: StepState }[] {
  const reached = STAGE_STEPS.findIndex((s) => s.key === run.stage);
  return STAGE_STEPS.map((s, i) => ({
    ...s,
    state:
      i <= reached
        ? 'done'
        : i === reached + 1
          ? run.outcome === 'running'
            ? 'run'
            : 'stop'
          : 'todo',
  }));
}

/** One line for the steps: "Order placed", "Stopped at Proposal", "Running · Debate". */
export function stageSummary(run: Pick<RunView, 'stage' | 'outcome'>): string {
  const steps = stageSteps(run);
  const next = steps.find((s) => s.state === 'stop' || s.state === 'run');
  if (!next) return run.stage === 'ordered' ? 'Every step passed' : 'Finished';
  return next.state === 'run' ? `Running · ${next.label}` : `Stopped at ${next.label}`;
}

/** The decision funnel with each stage's bar width as a share of all scans (0–100). */
export function funnelBars(stages: readonly FunnelStage[]): (FunnelStage & { width: number })[] {
  const scanned = stages[0]?.count ?? 0;
  return stages.map((stage) => ({
    ...stage,
    width: scanned > 0 ? Math.max(stage.count > 0 ? 1.5 : 0, (stage.count / scanned) * 100) : 0,
  }));
}

/** Of finished scans — the share an outcome took ("—" with none finished). */
export function outcomeShare(n: number, finished: number): string {
  if (finished <= 0) return EMPTY_VALUE;
  const share = (n / finished) * 100;
  return pct(share, n > 0 && share < 1 ? 1 : 0);
}

const STEP_LABEL: Record<string, string> = {
  mode: 'Mode',
  window: 'Market hours',
  switch: 'Live switch',
  ai: 'AI service',
  position: 'Open bot position',
  resolved: 'Resolved today',
  limits: 'Daily limits',
  broker: 'Groww positions',
  data: 'Market data',
  debate: 'Debate',
  consensus: 'Consensus',
  candidate: 'Candidate',
  direction: 'Direction',
  recheck: 'Re-check',
  option: 'Option',
  risk: 'Risk caps',
  edge: 'Historical edge',
  final: 'Final price',
  book: 'Paper book',
  order: 'Order',
  error: 'Error',
};

/** A trace step as a row: its name, verdict and tone, and its detail split into lines. */
export function traceStepView(step: TraceStep): {
  label: string;
  verdict: string;
  tone: StatusTone;
  first: string;
  rest: string[];
} {
  // A multi-line step (market data: a summary, then one line per index) shows its first line as
  // text and the rest as a list.
  const [first = '', ...rest] = step.detail.split('\n').map((line) => line.trim());
  return {
    label: STEP_LABEL[step.step] ?? step.step,
    verdict: step.ok === true ? 'Passed' : step.ok === false ? 'Stopped here' : 'Noted',
    tone: step.ok === true ? 'ok' : step.ok === false ? 'bad' : 'neutral',
    first,
    rest: rest.filter(Boolean),
  };
}

/**
 * A test scan's verdict: "Would buy …" is a candidate (green, it would trade), "Would hold — …"
 * the safe default (grey), a failure red, a running scan blue.
 */
export function testScanView(run: Pick<RunView, 'status' | 'reason'>): {
  tone: StatusTone;
  label: string;
} {
  if (run.status === 'RUNNING') {
    return { tone: 'info', label: 'Running — takes a minute or two' };
  }
  if (/^would buy/i.test(run.reason)) return { tone: 'ok', label: run.reason };
  if (/^test scan failed/i.test(run.reason) || run.status === 'ERROR') {
    return { tone: 'bad', label: run.reason || 'The test scan failed.' };
  }
  return { tone: 'neutral', label: run.reason || 'Finished' };
}

/**
 * Why a scan has no debate to show. A debate that RAN and gave nothing usable is not a scan that
 * "stopped before the debate" — that wording sent people looking for a market-data problem.
 */
export function noDebateLine(reason: string | null | undefined): string {
  const why = reason?.trim() || 'no reason recorded';
  return /^(The AI debate|AI agent failed)/i.test(why)
    ? `The debate ran but gave no usable answer — ${why}`
    : `This scan stopped before the debate: ${why}`;
}

/* ── the bot's state ── */

/** The header line: armed or off, and whether entries are paper or live. */
export function botHeadline(settings: Pick<BotSummarySettings, 'enabled' | 'mode'>): {
  label: string;
  tone: StatusTone;
} {
  const live = settings.mode === 'live';
  const word = live ? 'Live' : 'Paper';
  if (!settings.enabled) return { label: `${word} trading off`, tone: 'neutral' };
  return { label: `${word} trading armed`, tone: live ? 'warn' : 'ok' };
}

export const modeBadge = (mode: BotMode): { label: string; variant: 'warning' | 'neutral' } =>
  mode === 'live' ? { label: 'LIVE', variant: 'warning' } : { label: 'PAPER', variant: 'neutral' };

/**
 * What the overview's headline P&L is: a filter of one mode says which, "Net" covers both — never
 * "Paper" over figures that include live trades.
 */
export function pnlLabel(mode: ModeFilter): string {
  return mode === 'live' ? 'Live P&L' : mode === 'paper' ? 'Paper P&L' : 'Net P&L';
}

/**
 * The AI service's state for a banner: not configured, configured but not answering (scans then
 * end as errors and keep retrying), or fine. A server that does not report readiness reads as fine.
 */
export function aiProblem(input: {
  aiConfigured: boolean;
  aiReady: boolean | null;
  aiReason: string | null;
}): { title: string; message: string } | null {
  if (!input.aiConfigured) {
    return {
      title: 'AI service is not configured.',
      message: 'No scan can reach the debate until it is.',
    };
  }
  if (input.aiReady === false) {
    return {
      title: 'The AI service is not answering.',
      message: `${input.aiReason ?? 'Scans cannot reach the debate.'} Scans keep retrying.`,
    };
  }
  return null;
}

/* ── backtest ── */

/** "+4.2%" / "−1.8%" / "0.0%". Rounds before the sign, so −0.04 reads 0.0%, not −0.0%. */
export function signedPct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return EMPTY_VALUE;
  const rounded = Number(n.toFixed(digits));
  return formatSignedPercent(rounded === 0 ? 0 : rounded, digits);
}

/** Fewer than five trades say nothing either way: no colour. Otherwise gain or loss. */
export function backtestTone(summary: Pick<BacktestSummary, 'trades' | 'grossReturnPct'>) {
  return summary.trades < 5 ? undefined : pnlTone(summary.grossReturnPct);
}

const BACKTEST_EXIT: Record<ExitReason, { label: string; tone: StatusTone }> = {
  target: { label: 'Target', tone: 'ok' },
  stop: { label: 'Stop', tone: 'warn' },
  time: { label: 'Time', tone: 'neutral' },
};

export function backtestExitView(reason: ExitReason | null): { label: string; tone: StatusTone } {
  return reason ? BACKTEST_EXIT[reason] : { label: EMPTY_VALUE, tone: 'neutral' };
}

/** "10:30" — the IST clock time of an instant; "—" when unknown. */
export function istClock(at: string | null): string {
  const t = at ? Date.parse(at) : NaN;
  if (!Number.isFinite(t)) return EMPTY_VALUE;
  const ist = new Date(t + 330 * 60_000);
  return `${String(ist.getUTCHours()).padStart(2, '0')}:${String(ist.getUTCMinutes()).padStart(2, '0')}`;
}

/** "NIFTY 25000 CE" — the replayed contract. */
export function backtestContract(
  underlying: string,
  trade: Pick<BacktestTrade, 'strike' | 'kind'>,
) {
  return [underlying, trade.strike != null ? String(trade.strike) : null, trade.kind]
    .filter(Boolean)
    .join(' ');
}

/**
 * The replay's performance as drawn: the compounded return after each trade (equity − 100, so a
 * curve that dips below its start is drawn below zero), and each trade's own return.
 */
export function backtestSeries(curve: readonly BacktestPoint[]): {
  labels: string[];
  running: number[];
  perTrade: { label: string; value: number }[];
} {
  const labels = curve.map((point) => dayLabel(point.day));
  return {
    labels,
    running: curve.map((point) => Number((point.equity - 100).toFixed(4))),
    perTrade: curve.map((point, index) => ({ label: labels[index] ?? '', value: point.returnPct })),
  };
}

/** "30 Sep – 7 Oct" — the window the replay actually covered. */
export function periodLabel(period: { from: string | null; to: string | null }): string {
  if (!period.from || !period.to) return EMPTY_VALUE;
  return `${dayLabel(period.from)} – ${dayLabel(period.to)}`;
}
