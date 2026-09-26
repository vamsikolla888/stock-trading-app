import { isApiError } from '@/types/api';

import type {
  LinkedPortfolioSnapshot,
  ManualPortfolioSnapshot,
  PortfolioSnapshot,
  PositionRow,
} from '../types';

import {
  dayMove,
  fromBrokerHolding,
  fromLinkedHolding,
  fromLinkedPosition,
  fromManualHolding,
  type HoldingView,
} from './portfolio';

export type BrokerState = 'connected' | 'not-connected' | 'session-expired' | 'error' | 'loading';

export interface PortfolioOverview {
  source: 'broker' | 'manual' | 'none';
  brokerState: BrokerState;
  /** The connected broker whose orders the Orders tab reads ('mstock', 'groww'…). */
  brokerId: string | null;
  brokerName: string | null;
  holdings: HoldingView[];
  positions: PositionRow[];
  totals: {
    value: number | null;
    invested: number;
    pnl: number | null;
    pnlPct: number | null;
  } | null;
  day: { abs: number; pct: number | null } | null;
  availableCash: number | null;
  stale: boolean;
  asOf: string | null;
  isLoading: boolean;
  error: unknown;
  refetch: () => Promise<unknown>;
}

const BROKER_LABELS: Record<string, string> = { mstock: 'mStock', groww: 'Groww' };

export function brokerLabel(id: string): string {
  return BROKER_LABELS[id] ?? id;
}

/** How a book request ended, in the terms the UI cares about. */
export function brokerStateOf(error: unknown, hasData: boolean, pending: boolean): BrokerState {
  if (hasData) return 'connected';
  if (pending) return 'loading';
  if (isApiError(error)) {
    if (error.code === 'NOT_FOUND' || error.status === 404) return 'not-connected';
    if (error.code === 'BROKER_SESSION_EXPIRED') return 'session-expired';
  }
  return error ? 'error' : 'not-connected';
}

const STATE_PRIORITY: readonly BrokerState[] = [
  'connected',
  'session-expired',
  'error',
  'loading',
  'not-connected',
];

/** The more actionable of two brokers' states: any live book wins, then a lapsed session. */
export function combineBrokerStates(a: BrokerState, b: BrokerState): BrokerState {
  return STATE_PRIORITY.find((state) => state === a || state === b) ?? 'not-connected';
}

export interface OverviewInputs {
  mstock: { data: PortfolioSnapshot | undefined; state: BrokerState; error: unknown };
  linked: {
    id: string | null;
    data: LinkedPortfolioSnapshot | undefined;
    state: BrokerState;
    error: unknown;
    /** Still deciding whether there is a linked book (connections or the book in flight). */
    resolving: boolean;
  };
  manual: {
    needed: boolean;
    data: ManualPortfolioSnapshot | undefined;
    error: unknown;
    isPending: boolean;
  };
}

/**
 * Picks the book to show, in the web Dashboard's order: the live mStock snapshot, then an
 * API-linked broker's (Groww), then hand-tracked holdings — each only when it holds
 * something. Positions, cash and the broker state come from whichever broker is live.
 */
export function resolveOverview({
  mstock,
  linked,
  manual,
}: OverviewInputs): Omit<PortfolioOverview, 'refetch'> {
  const brokerState = linked.id ? combineBrokerStates(mstock.state, linked.state) : mstock.state;
  const liveBroker: 'mstock' | 'linked' | null = mstock.data
    ? 'mstock'
    : linked.data
      ? 'linked'
      : null;

  const base = {
    brokerState,
    brokerId: liveBroker === 'mstock' ? 'mstock' : liveBroker === 'linked' ? linked.id : null,
    brokerName:
      liveBroker === 'mstock' && mstock.data
        ? brokerLabel(mstock.data.broker)
        : liveBroker === 'linked' && linked.data
          ? linked.data.label
          : null,
    positions: mstock.data
      ? (mstock.data.positionRows ?? [])
      : (linked.data?.positions.map(fromLinkedPosition) ?? []),
    // `availableCash` is 0, not null, when the broker's funds call failed — only the funds
    // block says whether the figure is real.
    availableCash: mstock.data
      ? (mstock.data.funds?.available ?? null)
      : (linked.data?.funds?.available ?? null),
  };

  if (mstock.data && mstock.data.holdings.length > 0) {
    const holdings = mstock.data.holdings.map(fromBrokerHolding);
    return {
      ...base,
      source: 'broker',
      holdings,
      totals: mstock.data.totals,
      day: dayMove(holdings),
      stale: mstock.data.stale,
      asOf: mstock.data.asOf,
      isLoading: false,
      error: null,
    };
  }

  if (linked.data && linked.data.holdings.length > 0) {
    const holdings = linked.data.holdings.map(fromLinkedHolding);
    const { totals } = linked.data;
    return {
      ...base,
      source: 'broker',
      holdings,
      totals: {
        invested: totals.invested,
        value: totals.value,
        pnl: totals.unrealised,
        pnlPct: totals.unrealisedPct,
      },
      day: dayMove(holdings),
      stale: linked.data.stale,
      asOf: linked.data.asOf,
      isLoading: false,
      error: null,
    };
  }

  if (manual.data && manual.data.holdings.length > 0) {
    const holdings = manual.data.holdings.map(fromManualHolding);
    // Unpriced rows count at cost in the server's totals; show value and returns only
    // when every row has a live price.
    const priced =
      !manual.data.priceUnavailable && holdings.every((holding) => holding.value !== null);
    return {
      ...base,
      source: 'manual',
      holdings,
      totals: {
        invested: manual.data.totals.invested,
        value: priced ? manual.data.totals.value : null,
        pnl: priced ? manual.data.totals.pnl : null,
        pnlPct: priced ? manual.data.totals.pnlPct : null,
      },
      day: null,
      stale: false,
      asOf: null,
      isLoading: false,
      error: null,
    };
  }

  const isLoading =
    mstock.state === 'loading' || linked.resolving || (manual.needed && manual.isPending);
  const error =
    mstock.state === 'error'
      ? mstock.error
      : linked.id && linked.state === 'error'
        ? linked.error
        : manual.needed
          ? manual.error
          : null;

  return {
    ...base,
    source: 'none',
    holdings: [],
    totals: null,
    day: null,
    stale: false,
    asOf: null,
    isLoading,
    error: isLoading ? null : error,
  };
}
