import type { StatusTone } from '@/features/settings/lib/status';

import type { PickCategory, ScoreLine } from '../types';
import { CATEGORY_ORDER, dayName } from './picksView';

/**
 * Shaping the strong-picks track record (GET /recommendations/strong-picks/analytics) for the
 * Results view: the range switch, the category rows in their fixed order, the day bars and the
 * one-line summaries. Pure, so the rules are tested.
 */

export type ResultRange = '7' | '30' | '90';

export const RESULT_RANGES: readonly { key: ResultRange; label: string }[] = [
  { key: '7', label: '7D' },
  { key: '30', label: '30D' },
  { key: '90', label: '90D' },
];

/** Below this many closed trades a success rate is too thin to colour as good or bad. */
export const MIN_CLOSED_FOR_TONE = 3;

/** A success rate's tone: only once enough trades closed, and amber (never red) below half. */
export function successTone(rate: number | null, closed: number): StatusTone | undefined {
  if (rate == null || closed < MIN_CLOSED_FOR_TONE) return undefined;
  return rate >= 50 ? 'ok' : 'warn';
}

/** "5 of 8 closed trades in profit" / "4 picks · none closed yet" / "No picks in this window". */
export function scoreSub(l: Pick<ScoreLine, 'picks' | 'closed' | 'profitable'>): string {
  if (!l.picks) return 'No picks in this window';
  if (!l.closed) return `${l.picks} pick${l.picks === 1 ? '' : 's'} · none closed yet`;
  return `${l.profitable} of ${l.closed} closed trade${l.closed === 1 ? '' : 's'} in profit`;
}

/** The category rows in the screen's fixed order, leaving out categories the server omitted. */
export function categoryRows<T extends { category: PickCategory }>(rows: readonly T[]): T[] {
  return CATEGORY_ORDER.flatMap((c) => rows.filter((r) => r.category === c).slice(0, 1));
}

/** Day bars, oldest first: each day's average return of its closed picks (days with none left out). */
export function dayBars(
  byDay: readonly { date: string; avgReturnPct: number | null }[],
): { label: string; value: number }[] {
  return [...byDay]
    .filter(
      (d): d is { date: string; avgReturnPct: number } =>
        typeof d.avgReturnPct === 'number' && Number.isFinite(d.avgReturnPct),
    )
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((d) => ({ label: dayName(d.date, false), value: d.avgReturnPct }));
}
