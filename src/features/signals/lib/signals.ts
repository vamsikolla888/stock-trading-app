import type { ScreenerReliability, Signal, SignalAction } from '../types';

export type Tone = 'success' | 'danger' | 'warning' | 'neutral' | 'primary';

export const ACTION_FILTERS: readonly { key: SignalAction | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'BUY', label: 'Buy' },
  { key: 'SELL', label: 'Sell' },
  { key: 'WATCH', label: 'Watch' },
];

export const ACTION_TONE: Record<SignalAction, Tone> = {
  BUY: 'success',
  SELL: 'danger',
  WATCH: 'neutral',
};

/** Whether a signal alerted: delivered, qualified but not sent, or below the bar. */
export function alertState(signal: Pick<Signal, 'notified' | 'meetsNotifyBar'>): {
  label: string;
  tone: Tone;
} {
  if (signal.notified) return { label: 'Alerted', tone: 'success' };
  if (signal.meetsNotifyBar) return { label: 'Qualified, not sent', tone: 'warning' };
  return { label: 'Below the alert bar', tone: 'neutral' };
}

/** Conviction as an ordinal ("3/5") — deliberately never a percentage or a gauge. */
export function convictionLabel(conviction: number | null | undefined): string {
  if (typeof conviction !== 'number' || !Number.isFinite(conviction)) return '—';
  return `${Math.max(0, Math.min(5, Math.round(conviction)))}/5`;
}

/** Best measured hit rate first; ties by larger sample. */
export function sortReliability(rows: readonly ScreenerReliability[]): ScreenerReliability[] {
  return [...rows].sort((a, b) => b.hitRatePct - a.hitRatePct || b.sampleTrades - a.sampleTrades);
}
