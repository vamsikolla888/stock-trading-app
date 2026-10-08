import type { ScreenerReliability, Signal, SignalAction } from '../types';

/**
 * The Signals screen's view logic — pure, mirrors the web's features/signals/pages/Signals.tsx.
 * A signal is ranked by its MEASURED history first (alert-ready, then BUY over SELL over WATCH,
 * then hit rate, past average, and only last the model's 1–5 read of today). Conviction is an
 * ordinal, never a probability.
 */

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'primary';

export type ActionFilter = SignalAction | 'ALL';

export const ACTION_FILTERS: readonly { key: ActionFilter; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BUY', label: 'Buy' },
  { key: 'SELL', label: 'Sell' },
  { key: 'WATCH', label: 'Watch' },
];

export const ACTION_LABEL: Record<SignalAction, string> = {
  BUY: 'Buy',
  SELL: 'Sell',
  WATCH: 'Watch',
};

export const ACTION_TONE: Record<SignalAction, Tone> = {
  BUY: 'success',
  SELL: 'danger',
  WATCH: 'neutral',
};

/** The server's intraday checks (signal.queue.ts), IST; one more runs after the close. */
export const INTRADAY_CHECKS = '10:15, 12:15 and 14:15 IST';

/** Whether a signal alerted: sent, ready to send, or short of the rules. */
export function alertState(signal: Pick<Signal, 'notified' | 'meetsNotifyBar'>): {
  label: string;
  tone: Tone;
} {
  if (signal.notified) return { label: 'Alert sent', tone: 'success' };
  if (signal.meetsNotifyBar) return { label: 'Alert-ready', tone: 'warning' };
  return { label: 'Rules not met', tone: 'neutral' };
}

/** Conviction as an ordinal ("3/5") — deliberately never a percentage or a gauge. */
export function convictionLabel(conviction: number | null | undefined): string {
  if (typeof conviction !== 'number' || !Number.isFinite(conviction) || conviction < 1) return '—';
  return `${Math.min(5, Math.round(conviction))}/5`;
}

const actionRank = (action: SignalAction) => (action === 'BUY' ? 2 : action === 'SELL' ? 1 : 0);
const orLowest = (value: number | null) => value ?? -Infinity;

/** Best first: alert-ready, then the action, the measured record, and the model's read last. */
export function rankSignals(a: Signal, b: Signal): number {
  return (
    Number(b.meetsNotifyBar) - Number(a.meetsNotifyBar) ||
    actionRank(b.action) - actionRank(a.action) ||
    orLowest(b.hitRatePct) - orLowest(a.hitRatePct) ||
    orLowest(b.avgReturnPct) - orLowest(a.avgReturnPct) ||
    b.conviction - a.conviction
  );
}

/** The setup the screen leads with: the best qualified one, else the closest. */
export function featuredSignal(signals: readonly Signal[]): Signal | null {
  return [...signals].sort(rankSignals)[0] ?? null;
}

/** The featured card's eyebrow and its closing line. */
export function featuredWords(signal: Pick<Signal, 'meetsNotifyBar' | 'notified'>): {
  eyebrow: string;
  state: string;
} {
  if (!signal.meetsNotifyBar) {
    return {
      eyebrow: 'Closest setup — not alert-ready',
      state: 'No setup clears every alert rule right now. Context, not a push recommendation.',
    };
  }
  return {
    eyebrow: 'Best qualified setup',
    state: signal.notified
      ? 'Qualified, and its alert was sent.'
      : 'Clears the measured alert rules — ready to notify.',
  };
}

export type SignalSort = 'ranked' | 'hitRate' | 'avgReturn' | 'conviction' | 'symbol';

export const SORTS: readonly { key: SignalSort; label: string }[] = [
  { key: 'ranked', label: 'Best first' },
  { key: 'hitRate', label: 'Hit rate' },
  { key: 'avgReturn', label: 'Past average' },
  { key: 'conviction', label: 'Today strength' },
  { key: 'symbol', label: 'Name (A–Z)' },
];

export interface SignalFilter {
  action: ActionFilter;
  /** Only setups that clear every alert rule. */
  alertReady: boolean;
}

/** The list under the summary, filtered and sorted on the phone from the one day-long fetch. */
export function filterSignals(
  signals: readonly Signal[],
  filter: SignalFilter,
  sort: SignalSort = 'ranked',
): Signal[] {
  const rows = signals.filter(
    (s) =>
      (filter.action === 'ALL' || s.action === filter.action) &&
      (!filter.alertReady || s.meetsNotifyBar),
  );
  switch (sort) {
    case 'hitRate':
      return rows.sort(
        (a, b) => orLowest(b.hitRatePct) - orLowest(a.hitRatePct) || rankSignals(a, b),
      );
    case 'avgReturn':
      return rows.sort(
        (a, b) => orLowest(b.avgReturnPct) - orLowest(a.avgReturnPct) || rankSignals(a, b),
      );
    case 'conviction':
      return rows.sort((a, b) => b.conviction - a.conviction || rankSignals(a, b));
    case 'symbol':
      return rows.sort((a, b) => a.symbol.localeCompare(b.symbol));
    default:
      return rows.sort(rankSignals);
  }
}

export interface SignalSummary {
  total: number;
  alertReady: number;
  alertsSent: number;
  byAction: Record<SignalAction, number>;
}

/** The numbers at the top of the screen. */
export function summarizeSignals(signals: readonly Signal[]): SignalSummary {
  const byAction: Record<SignalAction, number> = { BUY: 0, SELL: 0, WATCH: 0 };
  let alertReady = 0;
  let alertsSent = 0;
  for (const s of signals) {
    byAction[s.action] += 1;
    if (s.meetsNotifyBar) alertReady += 1;
    if (s.notified) alertsSent += 1;
  }
  return { total: signals.length, alertReady, alertsSent, byAction };
}

/** The filter chips, each with its count ("Buy · 4"). */
export function actionChips(summary: SignalSummary): { key: ActionFilter; label: string }[] {
  return ACTION_FILTERS.map(({ key, label }) => {
    const count = key === 'ALL' ? summary.total : summary.byAction[key];
    return { key, label: summary.total > 0 ? `${label} · ${count}` : label };
  });
}

/** What the push notification would say (the server's wording, signal.service.ts pushQualifying). */
export function pushPreview(featured: Signal | null): { title: string; body: string } {
  if (!featured?.meetsNotifyBar) {
    return {
      title: 'Best market pick — when one qualifies',
      body: 'Sent only when hit rate, sample size and past average all pass.',
    };
  }
  const hit = featured.hitRatePct == null ? '—' : `${Math.round(featured.hitRatePct)}%`;
  const matches = featured.sampleTrades == null ? '—' : String(featured.sampleTrades);
  return {
    title:
      featured.action === 'BUY'
        ? `Best market pick — BUY ${featured.symbol}`
        : `Market signal — SELL ${featured.symbol}`,
    body: `${hit} historical hit rate from ${matches} matches.`,
  };
}

/** Best measured hit rate first; ties by larger sample. */
export function sortReliability(rows: readonly ScreenerReliability[]): ScreenerReliability[] {
  return [...rows].sort((a, b) => b.hitRatePct - a.hitRatePct || b.sampleTrades - a.sampleTrades);
}
