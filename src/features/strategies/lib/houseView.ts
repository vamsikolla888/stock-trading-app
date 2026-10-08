import type { StatusTone } from '@/features/settings/lib/status';
import { formatINR, formatNumber } from '@/lib/utils/formatters';
import { getErrorMessage, isApiError } from '@/types/api';

import type {
  CheckGroup,
  CheckStatus,
  RegimeState,
  ReplayLine,
  ReplaySetup,
  ScanDay,
  SectorState,
  SectorStrength,
  SetupCounts,
  SetupStatus,
  SwingCheck,
  SwingConfig,
  SwingSetup,
} from '../types';

/**
 * Words and small arithmetic for the platform strategy (Institutional Breakout Swing) — the port
 * of the web's houseView.ts. The six steps are WRITTEN FROM the server's config, so the screen
 * cannot quote a threshold the scan does not use. Dates are assembled by hand (no Intl), so the
 * labels are identical on every engine.
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
const MINUS = '−';

/** "Fri, 2 Oct" for a YYYY-MM-DD day key; the key back when it doesn't parse. */
export function dayLabel(day: string, withWeekday = true): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return day;
  const ms = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(ms);
  if (!Number.isFinite(ms)) return day;
  const core = `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
  return withWeekday ? `${WEEKDAYS[date.getUTCDay()]}, ${core}` : core;
}

export const REGIME_VIEW: Record<RegimeState, { label: string; tone: StatusTone }> = {
  'risk-on': { label: 'Risk-on', tone: 'ok' },
  cautious: { label: 'Cautious', tone: 'warn' },
  'risk-off': { label: 'Risk-off', tone: 'bad' },
  unknown: { label: 'Not measured', tone: 'neutral' },
};

/** Never throws on a state it doesn't know — an unknown regime reads "Not measured". */
export function regimeView(state: string | null | undefined): { label: string; tone: StatusTone } {
  return REGIME_VIEW[(state ?? 'unknown') as RegimeState] ?? REGIME_VIEW.unknown;
}

export const CHECK_VIEW: Record<CheckStatus, { mark: string; word: string; tone: StatusTone }> = {
  pass: { mark: '✓', word: 'passed', tone: 'ok' },
  warn: { mark: '!', word: 'caution', tone: 'warn' },
  fail: { mark: '✕', word: 'failed', tone: 'bad' },
  na: { mark: '–', word: 'not checked', tone: 'neutral' },
};

/** The checklist's groups, numbered as the six steps are (step 2, the market, is the regime). */
export const GROUP_LABEL: Record<CheckGroup, string> = {
  liquidity: '1 · Liquidity',
  move: '3 · The day’s move & volume',
  trend: '4 · Trend & strength',
  catalyst: '5 · Catalyst & quality',
  plan: '6 · The trade',
};
export const GROUP_ORDER: readonly CheckGroup[] = [
  'liquidity',
  'move',
  'trend',
  'catalyst',
  'plan',
];

/** A setup's checks in the six steps' order, each group with its passes, cautions and failures. */
export function groupChecks(
  checks: readonly SwingCheck[],
): { group: CheckGroup; label: string; checks: SwingCheck[] }[] {
  return GROUP_ORDER.flatMap((group) => {
    const rows = checks.filter((c) => c.group === group);
    return rows.length ? [{ group, label: GROUP_LABEL[group], checks: rows }] : [];
  });
}

/** "9 passed · 2 caution · 1 not checked" — a checklist in one line. */
export function checkTally(checks: readonly SwingCheck[]): string {
  const order: CheckStatus[] = ['pass', 'warn', 'fail', 'na'];
  return order
    .map((status) => ({ status, n: checks.filter((c) => c.status === status).length }))
    .filter((row) => row.n > 0)
    .map((row) => `${row.n} ${CHECK_VIEW[row.status].word}`)
    .join(' · ');
}

/** How a replayed setup ended, in a trader's words. Only the three closed outcomes are trades. */
export const SETUP_STATUS_VIEW: Record<
  SetupStatus,
  { label: string; tone: StatusTone; trade: boolean }
> = {
  target: { label: 'Target hit', tone: 'ok', trade: true },
  stop: { label: 'Stop hit', tone: 'bad', trade: true },
  time: { label: 'Time exit', tone: 'neutral', trade: true },
  'not-triggered': { label: 'Never triggered', tone: 'neutral', trade: false },
  gapped: { label: 'Gapped past entry', tone: 'neutral', trade: false },
  invalidated: { label: 'Opened at the stop', tone: 'neutral', trade: false },
  open: { label: 'Open', tone: 'info', trade: false },
  pending: { label: 'Awaiting trigger', tone: 'info', trade: false },
};
export const SETUP_STATUS_ORDER: readonly SetupStatus[] = [
  'target',
  'stop',
  'time',
  'not-triggered',
  'gapped',
  'invalidated',
  'open',
  'pending',
];

/** Every setup's ending as a share of all setups, in a fixed order; empty endings are left out. */
export function outcomeShares(
  counts: Partial<Record<SetupStatus, number>> & Pick<SetupCounts, 'setups'>,
): { key: SetupStatus; label: string; count: number; pct: number }[] {
  const total = counts.setups || 0;
  return SETUP_STATUS_ORDER.flatMap((key) => {
    const n = counts[key] ?? 0;
    return n
      ? [
          {
            key,
            label: SETUP_STATUS_VIEW[key].label,
            count: n,
            pct: total ? Math.round((n / total) * 1000) / 10 : 0,
          },
        ]
      : [];
  });
}

export type ReplayFilter = 'all' | 'trades' | 'none';

/** The replay's setup list filtered to trades (target, stop, time) or to the ones that weren't. */
export function filterReplaySetups(
  setups: readonly ReplaySetup[],
  show: ReplayFilter,
): ReplaySetup[] {
  if (show === 'all') return [...setups];
  return setups.filter((s) => SETUP_STATUS_VIEW[s.status].trade === (show === 'trades'));
}

/** "Fri, 2 Oct · 6 setups (2 A) · Risk-on" — one scan day in the picker. */
export function scanDayLabel(d: ScanDay): string {
  const day = dayLabel(d.date);
  if (d.status !== 'completed')
    return `${day} · ${d.status === 'failed' ? 'scan failed' : 'no data'}`;
  const setups = `${d.setups} setup${d.setups === 1 ? '' : 's'}${d.gradeA ? ` (${d.gradeA} A)` : ''}`;
  return `${day} · ${setups} · ${regimeView(d.regime).label}`;
}

const signed = (n: number, dp: number) =>
  `${n > 0 ? '+' : n < 0 ? MINUS : ''}${Math.abs(n).toFixed(dp)}`;

/** "+0.31R" / "−0.42R"; a dash when unknown. */
export function formatR(r: number | null | undefined): string {
  return typeof r === 'number' && Number.isFinite(r) ? `${signed(r, 2)}R` : '—';
}

/** A grade or setup-type line in words: "12 trades · 58% win · +0.84% a trade · +0.31R". */
export function lineSummary(l: ReplayLine | undefined): string {
  if (!l || !l.setups) return 'No setups';
  if (!l.trades) return `${l.setups} setup${l.setups === 1 ? '' : 's'} · none traded`;
  return [
    `${l.trades} trade${l.trades === 1 ? '' : 's'}`,
    l.winRate != null ? `${Math.round(l.winRate)}% win` : null,
    l.expectancyPct != null ? `${signed(l.expectancyPct, 2)}% a trade` : null,
    l.avgR != null ? `${signed(l.avgR, 2)}R` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** The trade a setup defines, as one sentence — the plan exactly as the scan wrote it. */
export function planSentence(s: Pick<SwingSetup, 'trigger' | 'plan' | 'metrics'>): string {
  const p = s.plan;
  const close = s.metrics.close;
  const high50 = s.metrics.high50;
  const why =
    s.trigger === 'pullback'
      ? 'Bounced off its rising 20/50 EMA.'
      : `Broke out above its ${high50 != null && close != null && close > high50 ? '50' : '20'}-day high.`;
  const risk = p.riskPct != null ? `, ${p.riskPct.toFixed(1)}% risk` : '';
  return `${why} Buy only above ${formatINR(p.entry)}; exit below ${formatINR(p.stop)} (the swing low${risk}), book at ${formatINR(p.target)} (2R). An order that never triggers is no trade.`;
}

/** The six steps, worded from the scan's own thresholds. */
export function methodSteps(c: SwingConfig): { title: string; body: string }[] {
  return [
    {
      title: 'Liquid names only',
      body: `Nifty 500 and F&O stocks with an average traded value of ₹${c.minAvgTradedValueCr} crore a day or more, priced ₹${c.minPrice} or above.`,
    },
    {
      title: 'Read the market first',
      body: 'Nifty against its 50- and 200-day averages sets how many longs to take: risk-on keeps every grade, cautious keeps A and B, risk-off keeps only A.',
    },
    {
      title: 'A real move on real volume',
      body: `Up ${c.minDayMovePct}–${c.idealMaxDayMovePct}% on the day (up to ${c.maxDayMovePct}% with caution), closing in the top ${Math.round((1 - c.minCloseLocation) * 100)}% of its range on at least ${c.minVolumeRatio}× the 20-day average volume (${c.strongVolumeRatio}× is institutional-sized) — and either breaking above its ${c.breakoutLookback}- or ${c.longBreakoutLookback}-day high or bouncing off a rising 20/50 EMA.`,
    },
    {
      title: 'In a trend, ahead of the market',
      body: `Above its 50 and 200 EMA with the 50 above the 200, making higher highs and lows, beating Nifty over one and three months, in a strong sector, and not stretched more than ${c.extendedFromEma20Pct}% above the 20 EMA.`,
    },
    {
      title: 'No reason to stay away',
      body: 'Promoter pledge, fundamental red flags, results or ex-dates inside the holding window, and the tone of recent news.',
    },
    {
      title: 'Define the trade before entering',
      body: `Buy above the breakout candle’s high (no more than ${c.maxChasePct}% past it), stop just below the swing low with risk between ${c.minRiskPct}% and ${c.maxRiskPct}%, target ${c.targetR}R, held up to ${c.horizonDays} sessions. Size so the stop costs 1% of capital.`,
    },
  ];
}

/** How a trade is managed once the order is in — worded from the same config. */
export function managementRules(c: SwingConfig): string[] {
  return [
    `A buy-above order at the trigger, good for ${c.horizonDays} sessions. If it never trades there, there is no trade.`,
    `Skip it if the first session opens at the stop, or if the fill would be more than ${c.maxChasePct}% past the trigger — chasing a gap is a different, worse trade.`,
    `Stop just below the swing low; target ${c.targetR}R. If a day touches both, the stop is assumed first.`,
    `No exit by then? Close at the end of session ${c.horizonDays}.`,
    'One position per stock. Size every trade so the stop costs 1% of capital.',
  ];
}

export const SECTOR_TONE: Record<SectorState, StatusTone> = {
  strong: 'ok',
  neutral: 'neutral',
  weak: 'bad',
  unknown: 'neutral',
};

/** Sectors strongest first by median one-month return; unmeasured ones last. */
export function sectorsByStrength(sectors: readonly SectorStrength[]): SectorStrength[] {
  return [...sectors].sort(
    (a, b) => (b.medianReturn21Pct ?? -Infinity) - (a.medianReturn21Pct ?? -Infinity),
  );
}

/** The funnel's bar widths, 0–100 of the first step; a step with anything left stays visible. */
export function funnelWidths(steps: readonly { remaining: number }[]): number[] {
  const top = Math.max(1, steps[0]?.remaining ?? 1);
  return steps.map((s) =>
    s.remaining > 0 ? Math.max(1, Math.round((s.remaining / top) * 1000) / 10) : 0,
  );
}

/** "1.6×" volume against the 20-day average, or a dash. */
export function formatVolumeRatio(ratio: number | null): string {
  return ratio == null ? '—' : `${formatNumber(ratio, 1)}×`;
}

/** The setup type in a word. */
export function triggerLabel(trigger: SwingSetup['trigger']): string {
  return trigger === 'pullback' ? 'EMA bounce' : 'Breakout';
}

/** The toast after an admin queues a scan or a replay: queued, or one was already waiting. */
export function houseJobMessage(
  kind: 'scan' | 'replay',
  alreadyQueued: boolean,
): {
  title: string;
  message: string;
} {
  if (alreadyQueued) {
    return { title: 'Already queued', message: 'This page refreshes when it finishes.' };
  }
  return kind === 'scan'
    ? { title: 'Scan queued', message: 'Takes a minute or two.' }
    : { title: 'Replay queued', message: 'Takes a few minutes.' };
}

/** A failed admin action in words: a 403 reads "Administrators only", else the server's message. */
export function adminActionError(error: unknown): string {
  if (isApiError(error) && error.status === 403) return 'Administrators only.';
  return getErrorMessage(error);
}
