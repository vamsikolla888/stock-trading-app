import { isApiError } from '@/types/api';

import type { GrowwAccess } from '../types';

/**
 * What the user's Groww account can do right now, from GET /fno/status or from an account
 * call's error. Market data falls back to the platform feed when Groww's is unavailable;
 * ORDERS, positions and margins need a connected Groww session.
 */

export type AccessProblem = 'not-connected' | 'session-expired' | 'plan' | 'unavailable';

/** A 404 from an account route means no Groww connection; 409 BROKER_SESSION_EXPIRED a lapsed one. */
export function accessProblemFromError(error: unknown): 'not-connected' | 'session-expired' | null {
  if (!isApiError(error)) return null;
  if (error.code === 'BROKER_SESSION_EXPIRED') return 'session-expired';
  if (error.code === 'NOT_FOUND' || error.status === 404) return 'not-connected';
  return null;
}

export function accessProblem(g: GrowwAccess | null | undefined): AccessProblem | null {
  if (!g || g.usable) return null;
  return g.reason;
}

/** Null when orders can be placed (a plan without live data still places orders). */
export function ordersBlockedReason(g: GrowwAccess | null | undefined): string | null {
  const problem = accessProblem(g);
  if (!problem || problem === 'plan') return null;
  if (problem === 'not-connected') return 'Connect your Groww account to place F&O orders.';
  if (problem === 'session-expired') {
    return 'Your Groww session has expired — reconnect Groww to place orders.';
  }
  return 'Groww could not be reached, so orders cannot be placed right now.';
}

export const ACCESS_COPY: Record<
  AccessProblem,
  { title: string; message: string; connect: boolean }
> = {
  'not-connected': {
    title: 'Connect Groww to trade F&O',
    message:
      'Prices here come from the platform feed. Orders, positions and margins need your own Groww Trading API connection.',
    connect: true,
  },
  'session-expired': {
    title: 'Your Groww session has expired',
    message: 'Reconnect Groww to place orders and see your positions.',
    connect: true,
  },
  plan: {
    title: 'Groww live data is not on your API plan',
    message:
      'Orders, positions and margins still work. Prices come from the platform feed and greeks are calculated on the server.',
    connect: false,
  },
  unavailable: {
    title: 'Groww is not answering right now',
    message: 'Prices come from the platform feed until Groww is reachable again.',
    connect: false,
  },
};
