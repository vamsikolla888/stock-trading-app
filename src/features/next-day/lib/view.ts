import type { StatusTone } from '@/features/settings/lib/status';
import { formatINR, formatNumber } from '@/lib/utils/formatters';

import type {
  Candidate,
  CandidateVote,
  CheckState,
  Compatibility,
  Direction,
  EdgeStats,
  Levels,
  LibraryStrategy,
  MorningCandidate,
  MorningCheck,
  MorningStatus,
  NextDayAction,
  NextDayReport,
  PickList,
  PickState,
  RegimeAction,
  ReportData,
  ReportDocument,
  ReportListItem,
  StrategyHits,
  StrategyKey,
  Tier,
  Verdict,
} from '../types';

/**
 * The Next-Day screens' view logic — PURE, a port of the web's lib/nextDayView.ts (pinned there
 * by server/test/client-next-day.test.ts) plus the phone's own row and polling helpers. Sizing
 * re-computes the server's position size for the reader's own capital and risk by the same rule:
 * risk ÷ stop distance, capped by what the capital buys.
 */

export type Tone = 'good' | 'warn' | 'bad' | 'none';

/** The app's status colours for a web tone. */
export const TONE_STATUS: Record<Tone, StatusTone> = {
  good: 'ok',
  warn: 'warn',
  bad: 'bad',
  none: 'neutral',
};

/** Text colour for a tone — colour only where it carries meaning. */
export const TONE_TEXT: Record<Tone, string> = {
  good: 'text-brand-text dark:text-brand-text-dark',
  warn: 'text-warning-600 dark:text-warning-dark',
  bad: 'text-danger-600 dark:text-danger-dark',
  none: 'text-ink dark:text-ink-dark',
};

export const ACTION_VIEW: Record<RegimeAction, { label: string; tone: Tone }> = {
  normal: { label: 'Normal size', tone: 'good' },
  reduced: { label: 'Reduced size', tone: 'warn' },
  'no-trade': { label: 'No trade today', tone: 'bad' },
};

export const CHECK_TONE: Record<CheckState, Tone> = {
  bull: 'good',
  bear: 'bad',
  neutral: 'none',
  warn: 'warn',
  na: 'none',
};
export const CHECK_WORD: Record<CheckState, string> = {
  bull: 'Bullish',
  bear: 'Bearish',
  neutral: 'Neutral',
  warn: 'Abnormal',
  na: 'Not measured',
};

export function regimeTone(label: string): Tone {
  if (label === 'Choppy' || label === 'Volatile') return 'warn';
  return label.includes('bullish') ? 'good' : label.includes('bearish') ? 'bad' : 'none';
}

/** "+3 of ±7" — never "+-0". */
export function regimeScoreText(score: number): string {
  const sign = score > 0 ? '+' : score < 0 ? '−' : '';
  return `${sign}${Math.abs(score)} of ±7`;
}

/** A verdict label split for a small tile: "Weak — no trade" → "Weak" over "no trade". */
export function verdictHead(label: string): { head: string; rest: string } {
  const [head = label, ...rest] = label.split(' — ');
  return { head, rest: rest.join(' — ') };
}

export const VERDICT_VIEW: Record<Verdict, { label: string; tone: Tone }> = {
  'high-conviction-watchlist': { label: 'High conviction', tone: 'good' },
  watchlist: { label: 'Watchlist', tone: 'good' },
  weak: { label: 'Weak — no trade', tone: 'warn' },
  avoid: { label: 'Avoid — conflicting', tone: 'bad' },
  ignore: { label: 'Ignore', tone: 'none' },
};

export const TIER_LABEL: Record<Tier, string> = {
  exceptional: 'Exceptional',
  high: 'High conviction',
  watchlist: 'Watchlist',
  weak: 'Weak',
  ignore: 'Ignore',
};

export const SCANNER_SHORT: Record<StrategyKey, string> = {
  breakout: 'Breakout',
  momentum: 'Momentum',
  'futures-oi': 'Futures OI',
  delivery: 'Delivery',
  'relative-strength': 'Rel. strength',
  'sector-momentum': 'Sector',
  'options-positioning': 'Options',
  'volatility-squeeze': 'Squeeze',
  'news-catalyst': 'News',
  'mean-reversion': 'Mean reversion',
  'gap-and-go': 'Gap & go',
};

export const COMPONENT_LABEL: Record<string, string> = {
  trend: 'Trend / momentum',
  volume: 'Volume',
  breakout: 'Breakout structure',
  relativeStrength: 'Relative strength',
  sector: 'Sector strength',
  futuresOi: 'Futures OI',
  options: 'Options positioning',
  delivery: 'Delivery',
  volatility: 'Volatility setup',
  news: 'News / catalyst',
  global: 'Global',
};

export const MORNING_VIEW: Record<MorningStatus, { label: string; tone: Tone }> = {
  confirmed: { label: 'Confirmed', tone: 'good' },
  waiting: { label: 'Waiting', tone: 'none' },
  gapped: { label: 'Gapped — don’t chase', tone: 'warn' },
  invalidated: { label: 'Invalidated', tone: 'bad' },
  'no-data': { label: 'No quote', tone: 'none' },
};

/** A graded pick. An untriggered pick is no trade — never a loss. */
export const PICK_STATE_VIEW: Record<PickState, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'none' },
  'not-triggered': { label: 'Not triggered', tone: 'none' },
  target: { label: 'Target', tone: 'good' },
  stop: { label: 'Stop', tone: 'bad' },
  close: { label: 'Closed at the close', tone: 'none' },
  'no-data': { label: 'No data', tone: 'none' },
};

export const PICK_LIST_LABEL: Record<PickList, string> = {
  bullish: 'Bullish',
  bearish: 'Bearish',
  fno: 'F&O',
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-08" → "Thu 8 Oct". */
export function sessionDay(date: string | null | undefined): string {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return '—';
  const d = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(d.getTime())) return '—';
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Nifty Bank" → "Bank". */
export const sectorShort = (label: string | null | undefined) =>
  (label ?? '').replace(/^Nifty /, '');

/* ── sizing ──────────────────────────────────────────────────────────────────────────────── */

export interface SizingPrefs {
  capital: number;
  riskPct: number;
}

export const SIZING_LIMITS = {
  minCapital: 10_000,
  maxCapital: 100_000_000,
  minRisk: 0.05,
  maxRisk: 2,
} as const;

export function clampSizing(p: Partial<SizingPrefs>, fallback: SizingPrefs): SizingPrefs {
  const capital =
    typeof p.capital === 'number' && Number.isFinite(p.capital)
      ? Math.min(
          SIZING_LIMITS.maxCapital,
          Math.max(SIZING_LIMITS.minCapital, Math.round(p.capital)),
        )
      : fallback.capital;
  const riskPct =
    typeof p.riskPct === 'number' && Number.isFinite(p.riskPct)
      ? Math.min(
          SIZING_LIMITS.maxRisk,
          Math.max(SIZING_LIMITS.minRisk, Math.round(p.riskPct * 100) / 100),
        )
      : fallback.riskPct;
  return { capital, riskPct };
}

export interface ClientSizing {
  riskBudget: number;
  shares: number;
  notional: number;
  cappedByCapital: boolean;
  lots: number | null;
  lot: number | null;
  lotRisk: number | null;
}

/** The server's sizePosition, for the reader's capital: shares from the stop distance, never more
 *  than the capital buys; whole futures lots inside the budget (0 = one lot is too much risk). */
export function sizeFor(
  lv: Pick<Levels, 'riskPerShare' | 'trigger'>,
  prefs: SizingPrefs,
  lot: number | null,
): ClientSizing {
  const budget = Math.round((prefs.capital * prefs.riskPct) / 100);
  let shares = lv.riskPerShare > 0 ? Math.floor(budget / lv.riskPerShare) : 0;
  const affordable = lv.trigger > 0 ? Math.floor(prefs.capital / lv.trigger) : 0;
  const cappedByCapital = shares > affordable;
  if (cappedByCapital) shares = affordable;
  return {
    riskBudget: budget,
    shares,
    notional: Math.round(shares * lv.trigger),
    cappedByCapital,
    lots: lot && lv.riskPerShare > 0 ? Math.floor(budget / (lv.riskPerShare * lot)) : null,
    lot: lot ?? null,
    lotRisk: lot ? Math.round(lv.riskPerShare * lot) : null,
  };
}

/** "120 sh · ₹32,598 · 2 lots" — the size line of a row. */
export function sizeLine(size: ClientSizing, fno: boolean): string {
  const parts = [`${formatNumber(size.shares, 0)} sh`, formatINR(size.notional, 0)];
  if (fno && size.lots != null) {
    parts.push(
      size.lots > 0 ? `${size.lots} lot${size.lots === 1 ? '' : 's'}` : '1 lot over budget',
    );
  }
  return parts.join(' · ');
}

/** "₹10L at 0.5% risk". */
export function sizingSummary(prefs: SizingPrefs): string {
  const lakh = prefs.capital / 100_000;
  const capital =
    prefs.capital >= 10_000_000
      ? `₹${formatNumber(prefs.capital / 10_000_000, prefs.capital % 10_000_000 ? 2 : 0)}Cr`
      : prefs.capital >= 100_000
        ? `₹${formatNumber(lakh, prefs.capital % 100_000 ? 2 : 0)}L`
        : formatINR(prefs.capital, 0);
  return `${capital} at ${prefs.riskPct}% risk`;
}

/** Text a person typed as rupees: "10,00,000" → 1000000; null when not a number in range. */
export function parseCapital(input: string): number | null {
  const n = Number(input.replace(/[₹,\s]/g, ''));
  if (!input.trim() || !Number.isFinite(n)) return null;
  return n >= SIZING_LIMITS.minCapital && n <= SIZING_LIMITS.maxCapital ? Math.round(n) : null;
}

/** "0.5" → 0.5; null when not a percent in range. */
export function parseRisk(input: string): number | null {
  const n = Number(input.replace(/[%\s]/g, ''));
  if (!input.trim() || !Number.isFinite(n)) return null;
  return n >= SIZING_LIMITS.minRisk && n <= SIZING_LIMITS.maxRisk
    ? Math.round(n * 100) / 100
    : null;
}

/* ── the board ───────────────────────────────────────────────────────────────────────────── */

export interface AvoidRow {
  symbol: string;
  reason: string;
  candidate: Candidate | null;
}

export interface BoardSections {
  bullish: Candidate[];
  bearish: Candidate[];
  fno: Candidate[];
  squeeze: Candidate[];
  avoid: AvoidRow[];
  /** Scored but not listed — the next names to watch, best first. */
  watch: Candidate[];
}

export function boardSections(report: NextDayReport): BoardSections {
  const by = new Map(report.candidates.map((c) => [c.symbol, c]));
  const pick = (symbols: string[]) =>
    symbols.map((s) => by.get(s)).filter((c): c is Candidate => !!c);
  const listed = new Set([
    ...report.lists.bullish,
    ...report.lists.bearish,
    ...report.lists.fno,
    ...report.lists.squeeze,
    ...report.lists.avoid,
  ]);
  return {
    bullish: pick(report.lists.bullish),
    bearish: pick(report.lists.bearish),
    fno: pick(report.lists.fno),
    squeeze: pick(report.lists.squeeze),
    avoid: report.lists.avoid.map((s) => ({
      symbol: s,
      reason: report.avoidReasons[s] ?? by.get(s)?.avoid ?? '',
      candidate: by.get(s) ?? null,
    })),
    watch: report.candidates
      .filter(
        (c) =>
          !listed.has(c.symbol) &&
          !c.avoid &&
          (c.verdict === 'watchlist' ||
            c.verdict === 'high-conviction-watchlist' ||
            c.verdict === 'weak'),
      )
      .sort((a, b) => b.score - b.hurdle - (a.score - a.hurdle))
      .slice(0, 12),
  };
}

/** The score after the regime and sector hurdles — what the lists and the verdict are judged on. */
export const effectiveScore = (c: Pick<Candidate, 'score' | 'hurdle'>) => c.score - c.hurdle;

/** The muted line under a score: "72 after hurdle" or "of 100". */
export function scoreSub(c: Pick<Candidate, 'score' | 'hurdle'>): string {
  return c.hurdle ? `${effectiveScore(c)} after hurdle` : 'of 100';
}

export type VoteRow = CandidateVote & { side: 'with' | 'against' | 'neutral'; state: string };

/** Counted votes for the candidate's way first, then against, then the uncounted, then the unavailable. */
export function voteRows(c: Pick<Candidate, 'votes' | 'direction'>): VoteRow[] {
  const want = c.direction === 'LONG' ? 'BUY' : 'SELL';
  const rank = (v: CandidateVote) =>
    v.unavailable ? 5 : v.vote === 'NEUTRAL' ? 4 : !v.counted ? 3 : v.vote === want ? 0 : 1;
  return [...c.votes]
    .sort((a, b) => rank(a) - rank(b) || b.strength - a.strength)
    .map((v) => ({
      ...v,
      side: v.vote === 'NEUTRAL' ? 'neutral' : v.vote === want ? 'with' : 'against',
      state: v.unavailable
        ? 'No data'
        : v.vote === 'NEUTRAL'
          ? v.twoSided
            ? 'Two-sided setup'
            : 'No signal'
          : v.counted
            ? 'Counted'
            : 'Not counted',
    }));
}

export function morningFor(
  morning: MorningCheck | null | undefined,
  symbol: string,
): MorningCandidate | null {
  return morning?.candidates.find((c) => c.symbol === symbol) ?? null;
}

/** Morning statuses counted, in a fixed order, zeros left out: "2 confirmed · 3 waiting". */
export function morningCounts(morning: MorningCheck): string {
  const order: MorningStatus[] = ['confirmed', 'waiting', 'gapped', 'invalidated', 'no-data'];
  const words: Record<MorningStatus, string> = {
    confirmed: 'confirmed',
    waiting: 'waiting',
    gapped: 'gapped',
    invalidated: 'invalidated',
    'no-data': 'no quote',
  };
  return order
    .map((s) => [s, morning.candidates.filter((c) => c.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${words[s]}`)
    .join(' · ');
}

/** The "for which day" line: "For Thu 8 Oct · from the Wed 7 Oct close". */
export function sessionLine(doc: Pick<ReportDocument, 'date' | 'forDate'>): string {
  return `For ${sessionDay(doc.forDate)} · from the ${sessionDay(doc.date)} close`;
}

/** Which of the session's files the report could not use — said on the board, never hidden. */
export function missingData(doc: { data: ReportData }): string[] {
  const out: string[] = [];
  if (!doc.data.indices) out.push('index closes');
  if (!doc.data.fo) out.push('F&O positioning');
  if (!doc.data.news) out.push('company news');
  return out;
}

export function missingDataNote(missing: string[]): string {
  return `Built without ${missing.join(', ')} — ${
    missing.includes('F&O positioning')
      ? 'futures and options are left out of every score.'
      : 'those components are left out of the score.'
  }`;
}

/** Levels as one line: "Above ₹271.65 · Stop ₹252.60 · T1 ₹300.20". */
export function levelsLine(l: Levels): string {
  return `${l.direction === 'LONG' ? 'Above' : 'Below'} ${formatINR(l.trigger)} · Stop ${formatINR(l.invalidation)} · T1 ${formatINR(l.target1)}`;
}

export interface SqueezeSide {
  dir: Direction;
  levels: Levels;
  counted: boolean;
  score: number;
}

/** The two sides of a squeeze in order: the side history supports first. */
export function squeezeSides(c: Candidate, compat: Compatibility[]): SqueezeSide[] {
  const two = c.twoSided;
  if (!two) return [];
  const counted = (side: 'BUY' | 'SELL') =>
    compat.find((x) => x.key === 'volatility-squeeze' && x.vote === side)?.counted ?? true;
  const longScore = c.direction === 'LONG' ? c.score : c.otherScore;
  const shortScore = c.direction === 'SHORT' ? c.score : c.otherScore;
  const out: SqueezeSide[] = [];
  if (two.long)
    out.push({ dir: 'LONG', levels: two.long, counted: counted('BUY'), score: longScore });
  if (two.short) {
    out.push({ dir: 'SHORT', levels: two.short, counted: counted('SELL'), score: shortScore });
  }
  return out.sort((a, b) => Number(b.counted) - Number(a.counted) || b.score - a.score);
}

/** A squeeze row's two triggers: "Buy above ₹120.40 · Sell below ₹112.05". */
export function squeezeLine(sides: SqueezeSide[]): string {
  return sides
    .map((s) => `${s.dir === 'LONG' ? 'Buy above' : 'Sell below'} ${formatINR(s.levels.trigger)}`)
    .join(' · ');
}

/** A scanner's buy or sell count, "*" when that side's vote is not counted. */
export function hitCell(h: StrategyHits, side: 'buy' | 'sell'): string {
  if (h.key === 'volatility-squeeze') return side === 'buy' ? `${h.setups} setups` : '';
  const counted = side === 'buy' ? h.countedBuy : h.countedSell;
  return `${h[side]}${counted ? '' : '*'}`;
}

/** The report picker's rows, newest first: completed reports only. */
export function reportOptions(
  reports: ReportListItem[],
): { date: string; label: string; detail: string }[] {
  return reports
    .filter((r) => r.status === 'completed')
    .map((r) => ({
      date: r.date,
      label: `For ${sessionDay(r.forDate)}`,
      detail: [
        r.regimeLabel,
        r.action ? ACTION_VIEW[r.action].label : null,
        r.picks ? `${r.picks} pick${r.picks === 1 ? '' : 's'}` : 'no picks',
        r.outcome
          ? r.outcome.triggered
            ? `${signed(r.outcome.totalR, 2, 'R')} on ${r.outcome.triggered} triggered`
            : 'none triggered'
          : null,
      ]
        .filter(Boolean)
        .join(' · '),
    }));
}

/** One graded pick's result: "+1.5R", "–" (no trade), "…" (pending). */
export function pickResult(p: { r: number | null; state: PickState }): string {
  if (p.r != null) return signed(p.r, 2, 'R');
  return p.state === 'pending' ? '…' : '–';
}

/* ── polling ─────────────────────────────────────────────────────────────────────────────── */

const IST_MS = 330 * 60_000;

/**
 * How often the report is worth re-reading: every five minutes while it can change — the evening
 * build (18:00–21:45 IST, a little either side) and the morning check (09:20–10:15) on weekdays —
 * and never otherwise. The screen subscribes only while it is focused.
 */
export function reportPollMs(now: Date = new Date()): number | false {
  const ist = new Date(now.getTime() + IST_MS);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  const evening = minute >= 17 * 60 + 55 && minute <= 22 * 60 + 5;
  const morning = minute >= 9 * 60 + 15 && minute <= 10 * 60 + 30;
  return evening || morning ? 5 * 60_000 : false;
}

/* ── admin ───────────────────────────────────────────────────────────────────────────────── */

export const ADMIN_ACTIONS: readonly {
  action: NextDayAction;
  label: string;
  detail: string;
  confirm: string;
  queued: string;
  body: Record<string, unknown>;
}[] = [
  {
    action: 'run',
    label: 'Run the report now',
    detail: 'Analyses even if a file is missing',
    confirm: 'It replaces this session’s report, even if NSE’s index or F&O file is still missing.',
    queued: 'The report',
    body: { force: true },
  },
  {
    action: 'morning',
    label: 'Morning check now',
    detail: 'Re-checks today’s candidates',
    confirm: 'It re-checks today’s candidates against the live open.',
    queued: 'The morning check',
    body: {},
  },
  {
    action: 'measure',
    label: 'Re-measure the scanners',
    detail: 'Backtests every scanner and tier',
    confirm: 'It re-runs the backtest of every scanner and score tier on the stored history.',
    queued: 'The backtest',
    body: {},
  },
  {
    action: 'backfill',
    label: 'Import NSE history',
    detail: 'Resumable · then re-measures',
    confirm:
      'It imports NSE’s end-of-day files for the missing sessions, then re-measures. It can take a while.',
    queued: 'The NSE import',
    body: {},
  },
];

/* ── the library ─────────────────────────────────────────────────────────────────────────── */

/** "+0.17%"; what rounds to zero is printed as zero — never "−0.00%". */
export function signed(v: number | null | undefined, dp = 2, unit = '%'): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const shown = Number(v.toFixed(dp));
  return `${shown > 0 ? '+' : shown < 0 ? '−' : ''}${Math.abs(shown).toFixed(dp)}${unit}`;
}

/** "+0.17% (t 2.3)". */
export function edgeText(e: EdgeStats | null | undefined, horizon: 'd1' | 'd5' = 'd1'): string {
  if (!e || e.signals === 0 || e.excessPct[horizon] == null) return '—';
  const t = e.t[horizon];
  return `${signed(e.excessPct[horizon], 2)}${t == null ? '' : ` (t ${signed(t, 1, '').replace('+', '')})`}`;
}

export type CompatState = 'counted' | 'proven' | 'excluded' | 'provisional';

export function compatState(c: Compatibility | undefined | null): CompatState {
  if (!c) return 'provisional';
  if (!c.counted) return 'excluded';
  if (/provisional/i.test(c.reason)) return 'provisional';
  return /^Measured edge/.test(c.reason) ? 'proven' : 'counted';
}

export const COMPAT_VIEW: Record<CompatState, { label: string; tone: Tone; title: string }> = {
  proven: { label: 'Edge', tone: 'good', title: 'A measured edge (t ≥ 2) — counted' },
  counted: { label: 'Counted', tone: 'none', title: 'History does not contradict it — counted' },
  provisional: {
    label: 'Provisional',
    tone: 'warn',
    title: 'Not measurable yet — counted provisionally',
  },
  excluded: {
    label: 'Excluded',
    tone: 'bad',
    title: 'History contradicts it — shown, never counted',
  },
};

export interface LibrarySide {
  edge: string;
  edge5: string;
  trades: number;
  avgR: number | null;
  winRatePct: number | null;
  state: CompatState;
  reason: string;
}

export interface LibraryRow {
  key: StrategyKey;
  name: string;
  family: string;
  when: 'evening' | 'morning';
  summary: string;
  long: LibrarySide;
  short: LibrarySide;
  today: { buy: number; sell: number; setups: number } | null;
}

export function libraryRows(strategies: LibraryStrategy[]): LibraryRow[] {
  return strategies.map((s) => {
    const side = (dir: 'long' | 'short'): LibrarySide => {
      const m = s.measure?.[dir];
      const c = s.compatibility.find((x) => x.vote === (dir === 'long' ? 'BUY' : 'SELL'));
      return {
        edge: edgeText(m?.edge, 'd1'),
        edge5: edgeText(m?.edge, 'd5'),
        trades: m?.trade.trades ?? 0,
        avgR: m?.trade.avgR ?? null,
        winRatePct: m?.trade.winRatePct ?? null,
        state: compatState(c),
        reason:
          c?.reason ||
          (s.measurable
            ? 'Not measured yet'
            : 'Not measurable on stored history — counted provisionally'),
      };
    };
    return {
      key: s.key,
      name: s.name,
      family: s.family,
      when: s.when,
      summary: s.summary,
      long: side('long'),
      short: side('short'),
      today: s.today ? { buy: s.today.buy, sell: s.today.sell, setups: s.today.setups } : null,
    };
  });
}

/** "3 / 1" buy / sell votes today, or "4 setups" for the squeeze. */
export function todayText(row: Pick<LibraryRow, 'key' | 'today'>): string {
  if (!row.today) return '—';
  return row.key === 'volatility-squeeze'
    ? `${row.today.setups} setups`
    : `${row.today.buy} / ${row.today.sell}`;
}

/** Average R a trade, or a dash when there were none. */
export const avgRText = (s: Pick<LibrarySide, 'trades' | 'avgR'>) =>
  s.trades ? signed(s.avgR, 2, 'R') : '—';
