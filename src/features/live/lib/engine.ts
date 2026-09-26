import { istDayKey } from '@/features/insights/lib/dates';

import type { AutoTradeActivity, AutoTradeConfigResponse, AutoTradeEvent } from '../types';

/**
 * What the auto-trade engine is doing, derived for the Live board — ported from the web
 * client's live-engine.ts. The engine follows ONE source (the recommendations batch or a
 * single strategy), so there is no per-strategy P&L to show; the board says so.
 */

export type EngineSource = 'recommendations' | 'strategy' | 'none';

export interface EngineState {
  configured: boolean;
  enabled: boolean;
  source: EngineSource;
  strategyId: string | null;
  strategyName: string | null;
  haltedReason: string | null;
  lastRunAt: string | null;
  maxPositions: number | null;
  summary: string;
}

export function engineState(
  config: AutoTradeConfigResponse | null | undefined,
  strategies: readonly { id: string; name: string }[],
): EngineState {
  if (!config?.configured) {
    return {
      configured: false,
      enabled: false,
      source: 'none',
      strategyId: null,
      strategyName: null,
      haltedReason: null,
      lastRunAt: null,
      maxPositions: null,
      summary: 'Not set up on this account yet',
    };
  }
  const source: EngineSource =
    config.config.candidateSource === 'strategy' ? 'strategy' : 'recommendations';
  const strategyId = source === 'strategy' ? (config.config.strategyId ?? null) : null;
  const strategyName = strategyId
    ? (strategies.find((s) => s.id === strategyId)?.name ?? null)
    : null;
  let summary: string;
  if (source === 'strategy') {
    summary =
      strategyId === null
        ? 'Set to follow a strategy, but none is selected'
        : strategyName
          ? `Following ${strategyName}`
          : 'Following a strategy that is no longer in your library';
  } else {
    summary = 'Following the daily recommendations batch';
  }
  return {
    configured: true,
    enabled: config.config.enabled,
    source,
    strategyId,
    strategyName,
    haltedReason: config.haltedReason,
    lastRunAt: config.lastRunAt,
    maxPositions:
      typeof config.config.maxPositions === 'number' ? config.config.maxPositions : null,
    summary,
  };
}

export interface TodayTally {
  filled: number;
  rejected: number;
  declined: number;
  buys: number;
  sells: number;
  /** Null when no exit closed today — different from closing one at exactly zero. */
  realisedToday: number | null;
}

/** Today's activity on the IST trading day. Rejected (account refused) ≠ declined (rules said no). */
export function todayTally(
  activity: Pick<AutoTradeActivity, 'events' | 'skippedToday'> | null | undefined,
  now: Date,
): TodayTally {
  const today = istDayKey(now);
  const events = (activity?.events ?? []).filter((e) => istDayKey(e.at) === today);
  let realised = 0;
  let sawRealised = false;
  for (const e of events) {
    if (e.side === 'SELL' && e.status === 'FILLED' && e.realisedPnl !== null) {
      realised += e.realisedPnl;
      sawRealised = true;
    }
  }
  return {
    filled: events.filter((e) => e.status === 'FILLED').length,
    rejected: events.filter((e) => e.status === 'REJECTED').length,
    declined: (activity?.skippedToday ?? []).reduce((n, s) => n + s.count, 0),
    buys: events.filter((e) => e.side === 'BUY' && e.status === 'FILLED').length,
    sells: events.filter((e) => e.side === 'SELL' && e.status === 'FILLED').length,
    realisedToday: sawRealised ? realised : null,
  };
}

const EXIT_WORDS: Record<string, string> = {
  TARGET: 'Target hit',
  STOP: 'Stop hit',
  MAX_HOLD: 'Max hold reached',
  REVIEW_DROPPED: 'Review dropped it',
};

/** Unknown reasons fall through as-is, so a new server reason still shows. */
export function exitWord(reason: string | null): string | null {
  if (!reason) return null;
  return EXIT_WORDS[reason] ?? reason;
}

export type EventToneName = 'success' | 'danger' | 'warning' | 'neutral' | 'primary';

/** A rejected order never happened — it reads as "look at this", not as a loss. */
export function eventTone(e: Pick<AutoTradeEvent, 'status' | 'side' | 'realisedPnl'>): {
  tone: EventToneName;
  label: string;
} {
  if (e.status === 'REJECTED') return { tone: 'warning', label: 'Rejected' };
  if (e.status === 'CANCELLED') return { tone: 'neutral', label: 'Cancelled' };
  if (e.status === 'PENDING') return { tone: 'primary', label: 'Pending' };
  if (e.side === 'BUY') return { tone: 'primary', label: 'Bought' };
  if (e.realisedPnl === null) return { tone: 'neutral', label: 'Sold' };
  return { tone: e.realisedPnl >= 0 ? 'success' : 'danger', label: 'Sold' };
}

export interface BookDayChange {
  /** Null unless EVERY holding has a price and a previous close — a partial sum misleads. */
  change: number | null;
  changePct: number | null;
}

/** Today's rupee move across held positions, from each holding's LTP and previous close. */
export function bookDayChange(
  positions: readonly { quantity: number; ltp: number | null; prevClose: number | null }[],
): BookDayChange {
  if (positions.length === 0) return { change: 0, changePct: null };
  let move = 0;
  let base = 0;
  for (const p of positions) {
    if (p.ltp == null || p.prevClose == null || !(p.prevClose > 0)) {
      return { change: null, changePct: null };
    }
    move += (p.ltp - p.prevClose) * p.quantity;
    base += p.prevClose * p.quantity;
  }
  return { change: move, changePct: base > 0 ? (move / base) * 100 : null };
}
