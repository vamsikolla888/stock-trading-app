import { formatIstDate, formatIstTime, istDayKey } from '@/features/home/lib/istTime';
import { formatINR, formatNumber, formatSignedPercent } from '@/lib/utils/formatters';

import type {
  EntryVerdict,
  IpoIssueType,
  IpoListFilter,
  IpoRecord,
  IpoReportKind,
  IpoReports,
  IpoReportSummary,
  IpoStatus,
  ReportEvidence,
  SetupVerdict,
  VerifiedSubscription,
} from '../types';

/**
 * Words for the IPO centre — pure, so the wording is tested rather than scattered through JSX.
 * Mirrors the web's ipo/lib/reportFormat.ts. A status is always WRITTEN (a word next to every
 * coloured mark), and verdicts describe a setup, never an instruction: this is model-assisted
 * research, not advice.
 */

export type Tone = 'ok' | 'warn' | 'err' | 'neutral' | 'info';

export const FILTERS: readonly { key: IpoListFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Open now' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'closed', label: 'Closed' },
  { key: 'listed', label: 'Listing today' },
];

export type IssueFilter = 'all' | 'mainboard' | 'sme';

export const ISSUE_FILTERS: readonly { key: IssueFilter; label: string }[] = [
  { key: 'all', label: 'All issues' },
  { key: 'mainboard', label: 'Mainboard' },
  { key: 'sme', label: 'SME' },
];

export const STATUS_LABEL: Record<IpoStatus, string> = {
  open: 'Open',
  upcoming: 'Upcoming',
  closed: 'Closed',
  listed: 'Listed',
  unknown: 'Status pending',
};

export const STATUS_TONE: Record<IpoStatus, Tone> = {
  open: 'ok',
  upcoming: 'info',
  closed: 'neutral',
  listed: 'warn',
  unknown: 'neutral',
};

export function issueLabel(type: IpoIssueType): string {
  return type === 'sme' ? 'SME' : type === 'mainboard' ? 'Mainboard' : 'IPO';
}

/** "SME · NSE" — the issue's board and exchange. */
export function boardLine(ipo: Pick<IpoRecord, 'issueType' | 'exchange'>): string {
  return [issueLabel(ipo.issueType), ipo.exchange].filter(Boolean).join(' · ');
}

export const SETUP_VERDICT: Record<SetupVerdict, { word: string; tone: Tone }> = {
  favourable: { word: 'Favourable setup', tone: 'ok' },
  mixed: { word: 'Mixed setup', tone: 'warn' },
  weak: { word: 'Weak setup', tone: 'err' },
  insufficient: { word: 'Not enough data', tone: 'neutral' },
};

export const ENTRY_VERDICT: Record<EntryVerdict, { word: string; tone: Tone }> = {
  favourable: { word: 'Entry conditions favourable', tone: 'ok' },
  wait: { word: 'Wait for confirmation', tone: 'warn' },
  unfavourable: { word: 'Entry not favourable', tone: 'err' },
  insufficient: { word: 'Not enough data', tone: 'neutral' },
};

export function verdictOf(
  kind: IpoReportKind,
  verdict: string | null | undefined,
): { word: string; tone: Tone } {
  const table: Record<string, { word: string; tone: Tone }> =
    kind === 'pre-listing' ? SETUP_VERDICT : ENTRY_VERDICT;
  return (verdict && table[verdict]) || { word: 'Not enough data', tone: 'neutral' };
}

export const LISTING_VIEW: Record<string, string> = {
  'strong-premium': 'Strong listing premium indicated',
  'modest-premium': 'Modest listing premium indicated',
  flat: 'Flat listing indicated',
  discount: 'Listing below issue price possible',
  unclear: 'Listing outcome unclear',
};

export const VALUATION_VIEW: Record<string, { word: string; tone: Tone }> = {
  attractive: { word: 'Attractively priced', tone: 'ok' },
  fair: { word: 'Fairly priced', tone: 'neutral' },
  stretched: { word: 'Richly priced', tone: 'err' },
  unclear: { word: 'Valuation unclear', tone: 'neutral' },
};

export const STAGE_LABEL: Record<string, string> = {
  starting: 'Starting',
  searching: 'Searching the web',
  'deep-research': 'Deep read by the research agent',
  market: 'Reading the live price',
  writing: 'Writing the analysis',
};

export const TIER_LABEL: Record<ReportEvidence['tier'], string> = {
  exchange: 'Exchange / regulator',
  'major-media': 'Financial media',
  'ipo-data': 'IPO data site',
  'broker-research': 'Broker research',
  other: 'Other source',
};

export const AGENT_LABEL: Record<string, string> = {
  used: 'Deep read used',
  'not-configured': 'Deep read not configured',
  skipped: 'Deep read skipped',
  failed: 'Deep read failed',
  timeout: 'Deep read timed out',
};

/** "₹540–568" or "₹568" — the price band. */
export function priceBand(ipo: Pick<IpoRecord, 'priceMin' | 'priceMax'>): string {
  if (ipo.priceMin == null && ipo.priceMax == null) return '—';
  if (ipo.priceMin == null || ipo.priceMax == null || ipo.priceMin === ipo.priceMax) {
    return formatINR(ipo.priceMax ?? ipo.priceMin, 0);
  }
  return `${formatINR(ipo.priceMin, 0)}–${formatNumber(ipo.priceMax, 0)}`;
}

/** "12.4×" — times subscribed. */
export function times(value: number | null | undefined): string {
  return value == null ? '—' : `${formatNumber(value, value >= 100 ? 0 : 2)}×`;
}

/** "+₹42" / "−₹6" — the grey-market premium per share. */
export function gmpText(value: number | null | undefined): string {
  if (value == null) return '—';
  const abs = formatINR(Math.abs(value), 0);
  return value > 0 ? `+${abs}` : value < 0 ? `−${abs}` : abs;
}

export function gmpPctText(value: number | null | undefined): string {
  return formatSignedPercent(value, 1);
}

/** "₹1,250 Cr". */
export function croreText(value: number | null | undefined): string {
  return value == null ? '—' : `₹${formatNumber(value, value >= 100 ? 0 : 2)} Cr`;
}

/** "26 Sep" for a stored IST date, or a fallback. */
export function dateText(iso: string | null | undefined, fallback = '—'): string {
  return formatIstDate(iso) ?? fallback;
}

/** Percent change a → b, both positive; null otherwise. */
export function pctChange(
  from: number | null | undefined,
  to: number | null | undefined,
): number | null {
  if (from == null || to == null || !(from > 0)) return null;
  return ((to - from) / from) * 100;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** The IST day key `days` after the one containing `now`. */
export function istDayKeyPlus(now: Date, days: number): string {
  return istDayKey(new Date(now.getTime() + days * DAY_MS)) ?? '';
}

/** "Sun, 4 Oct" (IST). */
export function istWeekdayDate(iso: string | null | undefined): string | null {
  const key = istDayKey(iso);
  if (!key) return null;
  const weekday = WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()]!.slice(0, 3);
  return `${weekday}, ${formatIstDate(iso)}`;
}

/** "today" / "tomorrow" in IST, else null. */
export function listingWhen(
  listingDate: string | null | undefined,
  now: Date = new Date(),
): 'today' | 'tomorrow' | null {
  const key = istDayKey(listingDate);
  if (!key) return null;
  if (key === istDayKeyPlus(now, 0)) return 'today';
  return key === istDayKeyPlus(now, 1) ? 'tomorrow' : null;
}

/** When a report was made: "18:02 IST · Sun, 4 Oct". */
export function madeAt(iso: string | null | undefined): string | null {
  const time = formatIstTime(iso);
  return time ? `${time} IST · ${istWeekdayDate(iso)}` : null;
}

/** One line for a list row: "Setup 72 · Favourable setup", "Report being prepared…", or null. */
export function researchLine(
  kind: IpoReportKind,
  summary: IpoReportSummary | null | undefined,
): { text: string; tone: Tone } | null {
  if (!summary) return null;
  if (summary.status === 'queued' || summary.status === 'running') {
    return { text: 'Report being prepared…', tone: 'info' };
  }
  if (summary.composite == null && summary.status === 'failed') {
    return { text: 'Report failed — retrying', tone: 'neutral' };
  }
  const v = verdictOf(kind, summary.verdict);
  return {
    text: `${kind === 'pre-listing' ? 'Setup' : 'Entry'} ${summary.composite ?? '—'} · ${v.word}`,
    tone: v.tone,
  };
}

/** The research line a row shows: the entry report once it exists, else the setup report. */
export function rowResearch(ipo: Pick<IpoRecord, 'research'>): { text: string; tone: Tone } | null {
  return (
    researchLine('post-listing', ipo.research?.postListing) ??
    researchLine('pre-listing', ipo.research?.preListing)
  );
}

/** The schedule line under a report's tab. */
export function scheduleLine(
  reports: Pick<IpoReports, 'schedule'>,
  kind: IpoReportKind,
  now: Date = new Date(),
): string | null {
  const { preListingDueBy, postListingFrom, schedulerEnabled } = reports.schedule;
  if (kind === 'pre-listing') {
    if (!preListingDueBy || new Date(preListingDueBy).getTime() < now.getTime() - DAY_MS) {
      return null;
    }
    const due = `${formatIstTime(preListingDueBy)} IST, ${istWeekdayDate(preListingDueBy)}`;
    return schedulerEnabled
      ? `Prepared automatically on the listing eve — ready by ${due}.`
      : `Automatic evening reports are off on this server; generate one here (due by ${due}).`;
  }
  if (!postListingFrom) return null;
  return schedulerEnabled
    ? `Prepared automatically on listing day at 10:20 and 12:20 IST (${istWeekdayDate(postListingFrom)}); refresh any time after ${formatIstTime(postListingFrom)} IST.`
    : `Available from ${formatIstTime(postListingFrom)} IST on ${istWeekdayDate(postListingFrom)}, once trading starts after the IPO call auction.`;
}

/** How the score moved since the previous report: "+4 since 17:32 IST", or null. */
export function scoreChange(
  current: number | null | undefined,
  previous: { composite: number | null; generatedAt: string | null } | null,
): string | null {
  if (current == null || !previous || previous.composite == null || !previous.generatedAt) {
    return null;
  }
  const delta = current - previous.composite;
  const when = formatIstTime(previous.generatedAt);
  if (delta === 0) return `Unchanged since ${when} IST`;
  return `${delta > 0 ? '+' : '−'}${Math.abs(delta)} since ${when} IST`;
}

/* ───────────────────────── the next few days ───────────────────────── */

export type IpoEventKind = 'lists' | 'closes' | 'opens';

export const EVENT_WORD: Record<IpoEventKind, string> = {
  lists: 'Lists',
  closes: 'Closes',
  opens: 'Opens',
};

export const EVENT_TONE: Record<IpoEventKind, Tone> = {
  lists: 'ok',
  closes: 'warn',
  opens: 'info',
};

export interface IpoDay {
  key: string;
  label: string;
  events: { kind: IpoEventKind; ipo: IpoRecord }[];
}

const KIND_ORDER: Record<IpoEventKind, number> = { lists: 0, closes: 1, opens: 2 };

/**
 * Today and the next `days − 1` IST calendar days, each with the IPOs that list, close or open
 * on it — the order a trader acts in: listings first, then last days to apply, then new issues.
 */
export function ipoNextDays(
  ipos: readonly IpoRecord[],
  now: Date = new Date(),
  days = 3,
): IpoDay[] {
  const out: IpoDay[] = Array.from({ length: days }, (_, i) => {
    const key = istDayKeyPlus(now, i);
    return {
      key,
      label:
        i === 0
          ? 'Today'
          : i === 1
            ? 'Tomorrow'
            : (WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()] ?? key),
      events: [],
    };
  });
  const byKey = new Map(out.map((day) => [day.key, day]));
  for (const ipo of ipos) {
    const dates: [IpoEventKind, string | null][] = [
      ['lists', ipo.listingDate],
      ['closes', ipo.closeDate],
      ['opens', ipo.openDate],
    ];
    for (const [kind, date] of dates) {
      const day = date ? byKey.get(istDayKey(date) ?? '') : undefined;
      if (day) day.events.push({ kind, ipo });
    }
  }
  for (const day of out) {
    day.events.sort(
      (a, b) =>
        KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
        a.ipo.companyName.localeCompare(b.ipo.companyName),
    );
  }
  return out;
}

/** An IPO's research call on Today: which report, where it stands, its score and suggestion. */
export interface IpoCall {
  /** The SETUP report before listing, the ENTRY report from listing day. */
  label: 'Setup' | 'Entry';
  state: 'ready' | 'preparing' | 'failed';
  /** 0–100, the report's composite. */
  score: number | null;
  /** The suggestion in the IPO centre's own words ("Favourable setup", "Wait for confirmation"). */
  verdict: string;
  tone: Tone;
  /** The report's one-line summary, when it has one. */
  headline: string | null;
}

/**
 * The research call Today shows for an event (web: dashboard/lib/today.ts ipoCall): the
 * listing-day ENTRY report for an IPO that lists, once it exists, else the SETUP report. Null
 * when no report exists — never a made-up score.
 */
export function ipoCall(
  research: IpoRecord['research'] | undefined,
  kind: IpoEventKind,
): IpoCall | null {
  const post = research?.postListing ?? null;
  const pre = research?.preListing ?? null;
  const pick =
    kind === 'lists' && post
      ? { s: post, k: 'post-listing' as const }
      : pre
        ? { s: pre, k: 'pre-listing' as const }
        : post
          ? { s: post, k: 'post-listing' as const }
          : null;
  if (!pick) return null;
  const label = pick.k === 'pre-listing' ? 'Setup' : 'Entry';
  const { s } = pick;
  if (s.status === 'queued' || s.status === 'running') {
    return {
      label,
      state: 'preparing',
      score: null,
      verdict: 'Report being prepared',
      tone: 'neutral',
      headline: null,
    };
  }
  if (s.status === 'failed' && s.composite == null) {
    return {
      label,
      state: 'failed',
      score: null,
      verdict: 'Report unavailable',
      tone: 'neutral',
      headline: null,
    };
  }
  const v = verdictOf(pick.k, s.verdict);
  return {
    label,
    state: 'ready',
    score: s.composite,
    verdict: v.word,
    tone: v.tone,
    headline: s.headline?.trim() || null,
  };
}

/** "Lists today", "Closes tomorrow", "Opens on Friday". */
export function eventLine(kind: IpoEventKind, dayLabel: string): string {
  const when =
    dayLabel === 'Today' || dayLabel === 'Tomorrow' ? dayLabel.toLowerCase() : `on ${dayLabel}`;
  return `${EVENT_WORD[kind]} ${when}`;
}

const CATEGORIES = [
  ['qib', 'QIB'],
  ['nii', 'NII'],
  ['retail', 'Retail'],
  ['employee', 'Employee'],
  ['total', 'Total'],
] as const;

/**
 * Category-wise subscription a report may state: only figures it verified against a source's
 * text — never one it lists as unverified, or as stale (from an earlier day of bidding).
 */
export function verifiedCategories(
  sub: VerifiedSubscription | null | undefined,
  withTotal = true,
): [label: string, value: number][] {
  if (!sub) return [];
  const excluded = new Set([...sub.unverified, ...(sub.stale ?? [])].map((k) => k.toLowerCase()));
  return CATEGORIES.flatMap(([key, label]) => {
    const value = sub[key];
    if (value == null || excluded.has(key) || (!withTotal && key === 'total')) return [];
    return [[label, value] as [string, number]];
  });
}
