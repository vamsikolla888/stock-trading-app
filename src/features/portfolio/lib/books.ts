import { isApiError } from '@/types/api';

import type { LinkedPortfolioSnapshot, ManualPortfolioSnapshot, PortfolioSnapshot } from '../types';

import {
  dayMove,
  fromBrokerHolding,
  fromLinkedHolding,
  fromManualHolding,
  type HoldingView,
} from './portfolio';

/**
 * Today's holdings, BOOK BY BOOK (web: dashboard/hooks/useTodayBook.ts) — Groww first, then
 * mStock, then holdings added by hand (owner, 2026-10-07). Never blended: each broker's figures
 * are that broker's, and a hand-entered book can claim less. A broker that is not connected is
 * not a book; one that is connected but could not be read IS one, carrying the reason — an
 * expired session should be seen, not hidden.
 */

export type BookId = 'groww' | 'mstock' | 'manual';

const BOOK_ORDER: readonly BookId[] = ['groww', 'mstock', 'manual'];

export const BOOK_LABEL: Record<BookId, string> = {
  groww: 'Groww',
  mstock: 'mStock',
  manual: 'Added by hand',
};

/** Where each broker book lives in full; hand-added holdings have no screen on the phone. */
export const BOOK_HREF: Record<BookId, '/trade/groww' | '/trade/mstock' | null> = {
  groww: '/trade/groww',
  mstock: '/trade/mstock',
  manual: null,
};

export interface BookRead {
  connected: boolean;
  sessionExpired: boolean;
  /** Why the read failed, in words a person can act on; null when it did not fail. */
  message: string | null;
}

export const SESSION_EXPIRED_MESSAGE = 'Session expired — reconnect to see these holdings.';

/** Not connected → no book. Anything else that failed is a book with a reason. */
export function readBook(error: unknown): BookRead {
  if (!error) return { connected: true, sessionExpired: false, message: null };
  if (isApiError(error)) {
    if (error.code === 'NOT_FOUND' || error.status === 404) {
      return { connected: false, sessionExpired: false, message: null };
    }
    if (error.code === 'BROKER_SESSION_EXPIRED') {
      return { connected: true, sessionExpired: true, message: SESSION_EXPIRED_MESSAGE };
    }
    return { connected: true, sessionExpired: false, message: error.message };
  }
  return {
    connected: true,
    sessionExpired: false,
    message: 'Could not read this account just now.',
  };
}

export interface BookBase {
  id: BookId;
  label: string;
  /** `error`: connected, but the last read failed — `message` says why; rows are the last known. */
  state: 'ready' | 'error';
  message: string | null;
  sessionExpired: boolean;
  asOf: string | null;
  stale: boolean;
  /** Only rows with shares in them. */
  holdings: HoldingView[];
  /** Available to trade, when the broker reported it (never mStock's 0 for a failed funds call). */
  availableCash: number | null;
}

export interface BookSources {
  groww: { data: LinkedPortfolioSnapshot | undefined; error: unknown };
  mstock: { data: PortfolioSnapshot | undefined; error: unknown };
  manual: { data: ManualPortfolioSnapshot | undefined };
}

export function homeBooks({ groww, mstock, manual }: BookSources): BookBase[] {
  const out: BookBase[] = [];

  const g = readBook(groww.error);
  if (groww.data || (groww.error && g.connected)) {
    const d = groww.data;
    out.push({
      id: 'groww',
      label: BOOK_LABEL.groww,
      state: g.message ? 'error' : 'ready',
      message: g.message,
      sessionExpired: g.sessionExpired,
      asOf: d?.asOf ?? null,
      stale: d?.stale ?? false,
      holdings: (d?.holdings ?? []).filter((h) => h.qty > 0).map(fromLinkedHolding),
      availableCash: d?.funds?.available ?? null,
    });
  }

  const m = readBook(mstock.error);
  // `/portfolio` serves the user's PRIMARY connection — only an mStock one is this book.
  if (
    (mstock.data && mstock.data.broker === 'mstock') ||
    (!mstock.data && mstock.error && m.connected)
  ) {
    const d = mstock.data;
    out.push({
      id: 'mstock',
      label: BOOK_LABEL.mstock,
      state: m.message ? 'error' : 'ready',
      message: m.message,
      sessionExpired: m.sessionExpired,
      asOf: d?.asOf ?? null,
      stale: d?.stale ?? false,
      holdings: (d?.holdings ?? []).filter((h) => h.qty > 0).map(fromBrokerHolding),
      // `availableCash` is 0, not null, when mStock's funds call failed — only the funds
      // block says whether the figure is real.
      availableCash: d?.funds?.available ?? null,
    });
  }

  const hand = manual.data?.holdings ?? [];
  if (hand.length > 0) {
    out.push({
      id: 'manual',
      label: BOOK_LABEL.manual,
      state: 'ready',
      message: null,
      sessionExpired: false,
      asOf: null,
      stale: false,
      holdings: hand.map(fromManualHolding),
      availableCash: null,
    });
  }

  return out.sort((a, b) => BOOK_ORDER.indexOf(a.id) - BOOK_ORDER.indexOf(b.id));
}

export interface BookFigures {
  /** Null unless every holding is priced: a partial sum understates the book and reads as a loss. */
  value: number | null;
  invested: number;
  pnl: number | null;
  pnlPct: number | null;
  priced: number;
  count: number;
  /** The session's move, only when every row has one. */
  day: { abs: number; pct: number | null } | null;
}

export function bookFigures(holdings: readonly HoldingView[]): BookFigures {
  let value = 0;
  let invested = 0;
  let priced = 0;
  for (const holding of holdings) {
    invested += holding.invested;
    if (holding.value !== null) {
      value += holding.value;
      priced += 1;
    }
  }
  const all = holdings.length > 0 && priced === holdings.length;
  return {
    value: all ? value : null,
    invested,
    pnl: all ? value - invested : null,
    pnlPct: all && invested > 0 ? ((value - invested) / invested) * 100 : null,
    priced,
    count: holdings.length,
    day: dayMove(holdings),
  };
}

export type HomeBook = BookBase & { figures: BookFigures };

/** The slide for a requested book: that book when it is among them, otherwise the first. */
export function bookIndex(ids: readonly BookId[], requested: BookId | null | undefined): number {
  const i = requested ? ids.indexOf(requested) : -1;
  return i >= 0 ? i : 0;
}
