import type { StatusTone } from '@/features/settings/lib/status';
import { formatINR } from '@/lib/utils/formatters';

import type {
  OutcomeStatus,
  PickCategory,
  PickContract,
  PickOutcome,
  PickSuggestion,
  StrongPick,
} from '../types';

/**
 * Pure presentation helpers for the Strong picks screen — the port of the web's picksView.ts
 * (pinned there by server/test/client-strong-picks.test.ts, here by __tests__/picksView.test.ts).
 * The server's sentences are rendered verbatim elsewhere; this file only counts, sizes and labels.
 * Dates are assembled by hand (no Intl), so labels are identical on every engine.
 */

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const CATEGORY_META: Record<PickCategory, { label: string; held: string; blurb: string }> = {
  equity: {
    label: 'Equity',
    held: 'Swing · up to 10 sessions',
    blurb: 'Delivery trades on a defined plan, held for days.',
  },
  intraday: {
    label: 'Intraday',
    held: 'Same day · out by 15:20',
    blurb: 'Opening-drive trades squared off the same session.',
  },
  futures: {
    label: 'Futures',
    held: '1–5 sessions',
    blurb: 'Stock futures on a clean trend — leverage magnifies the stop.',
  },
  options: {
    label: 'Options',
    held: '1–3 sessions',
    blurb: 'At-the-money calls for a sharp, near-term move — time decay works against a slow one.',
  },
};
export const CATEGORY_ORDER: readonly PickCategory[] = ['equity', 'intraday', 'futures', 'options'];

export type CategoryFilter = PickCategory | 'all';

const OUTCOME_VIEW: Record<OutcomeStatus, { label: string; tone: StatusTone }> = {
  open: { label: 'Open', tone: 'info' },
  target: { label: 'Target hit', tone: 'ok' },
  stop: { label: 'Stop hit', tone: 'bad' },
  time: { label: 'Time exit', tone: 'neutral' },
  'not-triggered': { label: 'Not triggered', tone: 'neutral' },
};
export function outcomeView(status: OutcomeStatus): { label: string; tone: StatusTone } {
  return OUTCOME_VIEW[status] ?? { label: status, tone: 'neutral' };
}

/** The monitor's suggestion as a plain reading — never an instruction. */
const SUGGESTION_VIEW: Record<PickSuggestion, { label: string; tone: StatusTone }> = {
  NO_PRICE: { label: 'No live price', tone: 'neutral' },
  WAIT: { label: 'Wait for entry', tone: 'neutral' },
  ENTER: { label: 'In entry zone', tone: 'info' },
  HOLD: { label: 'Working', tone: 'info' },
  TAKE_PROFIT: { label: 'Target reached', tone: 'ok' },
  EXIT: { label: 'Stop reached', tone: 'bad' },
};
export function suggestionView(s: PickSuggestion): { label: string; tone: StatusTone } {
  return SUGGESTION_VIEW[s] ?? { label: s, tone: 'neutral' };
}

// ── Day by day ─────────────────────────────────────────────────────────────────────────

/** Today's date in IST, YYYY-MM-DD — the key every pick is filed under. */
export function todayIST(now: number = Date.now()): string {
  return new Date(now + 330 * 60_000).toISOString().slice(0, 10);
}

/** "Mon, 5 Oct" for a YYYY-MM-DD key; the key back when it doesn't parse. */
export function dayName(date: string, withWeekday = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const d = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (!Number.isFinite(d.getTime())) return date;
  const core = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS[d.getUTCDay()]}, ${core}` : core;
}

export interface DayScore {
  picks: number;
  open: number;
  notTriggered: number;
  closed: number;
  profitable: number;
  targets: number;
  stops: number;
  /** Percent of CLOSED picks in profit; null until one closes. */
  successRate: number | null;
  avgReturnPct: number | null;
}

const CLOSED: readonly OutcomeStatus[] = ['target', 'stop', 'time'];
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * One day's picks added up — the SAME rule as the server's scoreLine (strong-pick.outcome.ts):
 * success = closed (target, stop or time exit) in profit, over closed picks only; a pick that
 * never triggered is no trade. A pick the monitor has not settled yet counts as open.
 */
export function dayScore(
  picks: readonly { outcome: Pick<PickOutcome, 'status' | 'returnPct'> | null }[],
): DayScore {
  const by = (s: OutcomeStatus) => picks.filter((p) => p.outcome?.status === s).length;
  const closed = picks.filter((p) => p.outcome && CLOSED.includes(p.outcome.status));
  const profitable = closed.filter((p) => (p.outcome?.returnPct ?? 0) > 0).length;
  const returns = closed
    .map((p) => p.outcome?.returnPct)
    .filter((r): r is number => typeof r === 'number' && Number.isFinite(r));
  return {
    picks: picks.length,
    open: picks.length - closed.length - by('not-triggered'),
    notTriggered: by('not-triggered'),
    closed: closed.length,
    profitable,
    targets: by('target'),
    stops: by('stop'),
    successRate: closed.length ? r2((profitable / closed.length) * 100) : null,
    avgReturnPct: returns.length ? r2(returns.reduce((s, r) => s + r, 0) / returns.length) : null,
  };
}

export interface DayChip {
  date: string;
  isToday: boolean;
  label: string;
  picks: number | null;
  successRate: number | null;
  closed: number;
}

/**
 * The strip of trading days across the top: today first (always — even before its review has
 * run), then each earlier day that published, newest first. Today's count comes from the
 * screen's own read when it has one; earlier days' from the track record. A selected day the
 * record doesn't hold (older than its window) is appended so the strip never loses it.
 */
export function buildDayStrip(
  byDay: readonly { date: string; picks: number; closed: number; successRate: number | null }[],
  today: string,
  todayPicks: number | null,
  selected: string | null = null,
  max = 20,
): DayChip[] {
  const earlier = byDay
    .filter((d) => d.date < today)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, max - 1);
  const fromRecord = byDay.find((d) => d.date === today);
  const chips: DayChip[] = [
    {
      date: today,
      isToday: true,
      label: `Today · ${dayName(today)}`,
      picks: todayPicks ?? fromRecord?.picks ?? null,
      successRate: fromRecord?.successRate ?? null,
      closed: fromRecord?.closed ?? 0,
    },
    ...earlier.map((d) => ({
      date: d.date,
      isToday: false,
      label: dayName(d.date),
      picks: d.picks,
      successRate: d.successRate,
      closed: d.closed,
    })),
  ];
  if (selected && !chips.some((c) => c.date === selected)) {
    chips.push({
      date: selected,
      isToday: false,
      label: dayName(selected),
      picks: null,
      successRate: null,
      closed: 0,
    });
  }
  return chips;
}

/** What a settled pick made or lost at the reader's 1%-risk size — the number a desk reports. */
export function settledResult(
  quantity: { qty: number; unit: 'shares' | 'lots'; lotSize?: number | null } | null,
  outcome: Pick<PickOutcome, 'status' | 'entryPrice' | 'exitPrice' | 'returnPct'> | null,
): { pnl: number; returnPct: number } | null {
  if (!quantity || !outcome || outcome.entryPrice == null || outcome.exitPrice == null) return null;
  if (outcome.returnPct == null || !CLOSED.includes(outcome.status)) return null;
  const units = quantity.unit === 'lots' ? quantity.qty * (quantity.lotSize ?? 0) : quantity.qty;
  return {
    pnl: Math.round(units * (outcome.exitPrice - outcome.entryPrice)),
    returnPct: outcome.returnPct,
  };
}

/**
 * One status for a pick, in the order a trader cares: a settled outcome first, then a level the
 * monitor saw reached, then — for a buy-above pick — whether it has triggered, else the monitor's
 * reading of the entry band.
 */
export function pickStatus(p: {
  entryMode: 'band' | 'trigger';
  triggeredAt: string | null;
  outcome: { status: OutcomeStatus } | null;
  monitor: { verdict: { suggestion: PickSuggestion } } | null;
}): { label: string; tone: StatusTone } {
  if (p.outcome && p.outcome.status !== 'open') return outcomeView(p.outcome.status);
  const s = p.monitor?.verdict.suggestion ?? 'NO_PRICE';
  if (s === 'TAKE_PROFIT' || s === 'EXIT' || s === 'NO_PRICE') return suggestionView(s);
  if (p.entryMode === 'trigger') {
    return p.triggeredAt
      ? { label: 'Triggered', tone: 'info' }
      : { label: 'Awaiting trigger', tone: 'neutral' };
  }
  return suggestionView(s);
}

/** A position larger than this share of capital is flagged as concentrated. */
export const CONCENTRATION_FLAG_PCT = 25;
export const DEFAULT_CAPITAL = 500_000;
export const MIN_CAPITAL = 10_000;
export const MAX_CAPITAL = 1_000_000_000;

export interface PositionSize {
  qty: number;
  unit: 'shares' | 'lots';
  /** Rupees lost if the stop (or, for options, the whole premium) is hit. */
  risk: number;
  note: string;
  /** The position's share of capital (shares only). */
  exposurePct: number | null;
}

/**
 * How much to buy so that the stop costs `riskPct` of `capital`:
 *   equity / intraday — shares, by the distance to the stop (capped at what the capital buys);
 *   futures — whole lots, by the distance to the stop × lot size;
 *   options — whole lots, treating the full premium as the risk (a long option can expire
 *   worthless).
 */
export function sizeFor(input: {
  category: PickCategory | null;
  capital: number;
  riskPct?: number;
  entry: number | null;
  stop: number | null;
  contract: PickContract | null;
}): PositionSize | null {
  const riskPct = input.riskPct ?? 1;
  const budget = (input.capital * riskPct) / 100;
  if (!(budget > 0)) return null;
  if (input.category === 'options') {
    const perLot = input.contract?.lotValue;
    if (!perLot || !(perLot > 0)) return null;
    const lots = Math.floor(budget / perLot);
    return {
      qty: lots,
      unit: 'lots',
      risk: Math.round(lots * perLot),
      note: lots ? 'premium at risk' : `one lot needs ${formatINR(perLot, 0)} of risk budget`,
      exposurePct: null,
    };
  }
  if (input.entry == null || input.stop == null || !(input.entry > input.stop)) return null;
  const perShare = input.entry - input.stop;
  if (input.category === 'futures') {
    const lot = input.contract?.lotSize;
    if (!lot) return null;
    const lots = Math.floor(budget / (perShare * lot));
    return {
      qty: lots,
      unit: 'lots',
      risk: Math.round(lots * perShare * lot),
      note: lots
        ? 'to the stop'
        : `one lot risks ${formatINR(Math.round(perShare * lot), 0)} — above your budget`,
      exposurePct: null,
    };
  }
  const byRisk = Math.floor(budget / perShare);
  const byCash = Math.floor(input.capital / input.entry);
  const shares = Math.min(byRisk, byCash);
  return {
    qty: shares,
    unit: 'shares',
    risk: Math.round(shares * perShare),
    note: byCash < byRisk ? 'to the stop — capped at what your capital buys' : 'to the stop',
    exposurePct: Math.round(((shares * input.entry) / input.capital) * 100),
  };
}

/** Typed capital ("5,00,000") → rupees; null when it isn't a usable amount. */
export function parseCapital(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isFinite(n) || n < MIN_CAPITAL) return null;
  return Math.min(n, MAX_CAPITAL);
}

/** The price a pick is measured from: the trigger for a buy-above pick, the middle of the band
 *  otherwise — the same reference the server's outcome uses (strong-pick.outcome.ts). */
export function entryReference(p: {
  entryMode: 'band' | 'trigger';
  entryLow: number | null;
  entryHigh: number | null;
}): number | null {
  if (p.entryLow == null) return p.entryHigh;
  if (p.entryMode === 'trigger' || p.entryHigh == null) return p.entryLow;
  return r2((p.entryLow + p.entryHigh) / 2);
}

/** Percent from `from` to `to`; null without both. */
export function moveFromEntry(last: number | null, entry: number | null): number | null {
  if (last == null || entry == null || !(entry > 0)) return null;
  return Math.round(((last - entry) / entry) * 10000) / 100;
}

/**
 * Where a pick stands now, in one place: settled → the outcome's exit and return (never today's
 * price, which the monitor keeps folding in after a pick ends); live → the monitor's price and
 * the move from the entry reference. Progress is 0–100 toward the target, by the best price.
 */
export function pickPosition(p: StrongPick): {
  settled: boolean;
  price: number | null;
  movePct: number | null;
  progressPct: number | null;
} {
  const settled = p.outcome != null && p.outcome.status !== 'open';
  const entry = entryReference(p);
  const price = settled ? (p.outcome?.exitPrice ?? null) : (p.monitor?.lastPrice ?? null);
  const movePct = settled ? (p.outcome?.returnPct ?? null) : moveFromEntry(price, entry);
  const progress = p.outcome?.progressToTarget ?? p.monitor?.verdict.progressToTarget ?? null;
  return {
    settled,
    price,
    movePct,
    progressPct:
      typeof progress === 'number' && Number.isFinite(progress)
        ? Math.round(Math.min(1, Math.max(0, progress)) * 100)
        : null,
  };
}

/** "Day 2 of 5", "Today only", "Settled 5 Oct" — where a pick is in its horizon. */
export function horizonLabel(
  p: Pick<StrongPick, 'horizonDays' | 'sessionsElapsed' | 'outcome'>,
): string {
  if (p.outcome && p.outcome.status !== 'open') {
    const day = p.outcome.resolvedAt?.slice(0, 10);
    return day ? `Settled ${dayName(day, false)}` : 'Settled';
  }
  const horizon = Math.max(1, p.horizonDays || 1);
  if (horizon === 1) return 'Today only';
  const session = Math.min(Math.max(1, p.sessionsElapsed), horizon);
  return `Day ${session} of ${horizon}`;
}

/** Sessions left in a pick's horizon, never below zero. */
export function sessionsLeft(horizonDays: number, sessionsElapsed: number): number {
  return Math.max(0, horizonDays - sessionsElapsed);
}

/** How many picks fall in each category, plus the total — the filter's counts. */
export function categoryCounts(
  picks: readonly { category: PickCategory | null }[],
): Record<CategoryFilter, number> {
  const out: Record<CategoryFilter, number> = {
    all: picks.length,
    equity: 0,
    intraday: 0,
    futures: 0,
    options: 0,
  };
  for (const p of picks) if (p.category) out[p.category] += 1;
  return out;
}

/** The category chips: All, then each category with its count ("Equity · 2"). */
export function categoryChips(
  picks: readonly { category: PickCategory | null }[],
): { key: CategoryFilter; label: string }[] {
  const counts = categoryCounts(picks);
  return [
    { key: 'all', label: `All · ${counts.all}` },
    ...CATEGORY_ORDER.map((c) => ({ key: c, label: `${CATEGORY_META[c].label} · ${counts[c]}` })),
  ];
}

export function filterByCategory<T extends { category: PickCategory | null }>(
  picks: readonly T[],
  filter: CategoryFilter,
): T[] {
  return filter === 'all' ? [...picks] : picks.filter((p) => p.category === filter);
}

/** "2 equity · 1 options" — the day's mix in words, categories in their fixed order. */
export function categoryMix(picks: readonly { category: PickCategory | null }[]): string {
  const counts = categoryCounts(picks);
  return CATEGORY_ORDER.filter((c) => counts[c] > 0)
    .map((c) => `${counts[c]} ${CATEGORY_META[c].label.toLowerCase()}`)
    .join(' · ');
}

/** "27 Oct 1040 CE" / "27 Oct FUT" — a contract the way a desk reads it out. */
export function contractLabel(c: Pick<PickContract, 'kind' | 'strike' | 'expiry'>): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(c.expiry) ? dayName(c.expiry, false) : c.expiry;
  return c.kind === 'FUT' ? `${date} FUT` : `${date} ${c.strike ?? '—'} ${c.kind}`;
}

const SWING_SOURCE = /Institutional Breakout Swing/;

export function isSwingSource(source: string): boolean {
  return SWING_SOURCE.test(source);
}

/** Short source chip text: the swing strategy shows its grade, the rest their own name. */
export function sourceChip(source: string, swingGrade?: string | null): string {
  if (isSwingSource(source)) return `Swing setup${swingGrade ? ` · ${swingGrade}` : ''}`;
  if (/^News/.test(source)) return 'News';
  if (/recommendation/i.test(source)) return 'Recommendation';
  return source.length > 28 ? `${source.slice(0, 26)}…` : source;
}

/** Live picks the day's headline counts as "in play" — triggered or inside the entry zone. */
export function inPlayCounts(picks: readonly StrongPick[]): { inPlay: number; waiting: number } {
  let inPlay = 0;
  let waiting = 0;
  for (const p of picks) {
    const label = pickStatus(p).label;
    if (label === 'Triggered' || label === 'Working' || label === 'In entry zone') inPlay += 1;
    else if (label === 'Awaiting trigger' || label === 'Wait for entry') waiting += 1;
  }
  return { inPlay, waiting };
}

/** Earlier picks still inside their horizon, for today's page — never a pick from today itself. */
export function earlierActive(
  active: readonly StrongPick[],
  date: string,
  filter: CategoryFilter,
): StrongPick[] {
  return active.filter((p) => p.date !== date && (filter === 'all' || p.category === filter));
}

export interface HeadlineTile {
  label: string;
  value: string;
  sub: string;
  status?: StatusTone;
  /** Tapping it opens the Results view. */
  opensResults?: boolean;
}

const pctText = (n: number | null) => (n == null ? '—' : `${Math.round(n)}%`);
const signedPct = (n: number | null) =>
  n == null ? '—' : `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(2)}%`;

/**
 * The day's headline numbers. TODAY is live: what is in play and the result so far, plus the
 * record over the window (left out when the server has no analytics). A PAST day is settled: how
 * its picks ended, scored by the server's rule (success = closed in profit).
 */
export function dayHeadline(
  day: { picks: readonly StrongPick[]; runStatus: string },
  isToday: boolean,
  record: { days: number; successRate: number | null; closed: number; profitable: number } | null,
): HeadlineTile[] {
  const picks = day.picks;
  const score = dayScore(picks);
  if (!isToday) {
    const rest = [
      score.open ? `${score.open} still open` : null,
      score.notTriggered ? `${score.notTriggered} never triggered` : null,
    ]
      .filter(Boolean)
      .join(' · ');
    return [
      {
        label: 'Picks',
        value: String(picks.length),
        sub: picks.length ? categoryMix(picks) || 'Before categories' : 'None published this day',
      },
      {
        label: 'Closed in profit',
        value: score.closed ? `${score.profitable} of ${score.closed}` : '—',
        sub: rest || (picks.length ? 'all settled' : '—'),
      },
      {
        label: 'Success',
        value: pctText(score.successRate),
        sub: `${score.targets} target${score.targets === 1 ? '' : 's'} · ${score.stops} stop${score.stops === 1 ? '' : 's'}`,
        status:
          score.successRate != null && score.closed >= 3
            ? score.successRate >= 50
              ? 'ok'
              : 'warn'
            : undefined,
      },
      {
        label: 'Avg return',
        value: signedPct(score.avgReturnPct),
        sub: 'per closed pick, on the stock',
        status:
          score.avgReturnPct == null
            ? undefined
            : score.avgReturnPct > 0
              ? 'ok'
              : score.avgReturnPct < 0
                ? 'bad'
                : undefined,
      },
    ];
  }
  const { inPlay, waiting } = inPlayCounts(picks);
  const tiles: HeadlineTile[] = [
    {
      label: 'Today’s picks',
      value: String(picks.length),
      sub: picks.length
        ? categoryMix(picks) || 'Before categories'
        : day.runStatus === 'not-run-yet'
          ? 'Review runs at 09:30 IST'
          : 'None published today',
    },
    {
      label: 'In play',
      value: picks.length ? `${inPlay} of ${picks.length}` : '—',
      sub: picks.length ? `${waiting} waiting for entry` : 'Triggered or in the entry zone',
    },
    {
      label: 'Today so far',
      value: score.closed ? `${score.profitable} of ${score.closed}` : '—',
      sub: score.closed
        ? `closed in profit · ${pctText(score.successRate)}`
        : 'Nothing has closed yet',
    },
  ];
  if (record) {
    tiles.push({
      label: `${record.days}-day success`,
      value: pctText(record.successRate),
      sub: record.closed
        ? `${record.profitable} of ${record.closed} closed in profit`
        : 'No closed trades yet',
      opensResults: true,
    });
  }
  return tiles;
}
