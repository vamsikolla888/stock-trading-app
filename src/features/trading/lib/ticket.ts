import type { LiveBroker, OrderSide } from '../types';

export type TicketMode = 'live' | 'paper';
export type TicketProduct = 'delivery' | 'intraday';

export interface TicketParams {
  symbol: string;
  exchange: string;
  side: OrderSide;
  /** Prefilled size — an exit sells the position's own quantity. */
  qty?: number;
  product?: TicketProduct;
  /** Paper screens open the ticket in paper mode; it never silently becomes live. */
  mode?: TicketMode;
  /** The paper profile the order acts against. */
  profileId?: string;
  /** Preselects a live broker when several are connected. */
  broker?: LiveBroker;
}

/** Typed link to the order ticket with its optional prefills (all params are strings). */
export function ticketHref(params: TicketParams) {
  const out: Record<string, string> = {
    symbol: params.symbol,
    exchange: params.exchange.toUpperCase(),
    side: params.side,
  };
  if (params.qty && params.qty > 0) out.qty = String(Math.floor(params.qty));
  if (params.product) out.product = params.product;
  if (params.mode) out.mode = params.mode;
  if (params.profileId) out.profileId = params.profileId;
  if (params.broker) out.broker = params.broker;
  return { pathname: '/order' as const, params: out };
}

/** Reads the ticket's route params back, rejecting anything malformed. */
export function parseTicketParams(raw: Record<string, string | string[] | undefined>): {
  symbol: string;
  exchange: 'NSE' | 'BSE';
  side: OrderSide;
  qty: number | null;
  product: TicketProduct | null;
  mode: TicketMode | null;
  profileId: string | undefined;
  broker: LiveBroker | null;
} {
  const one = (key: string) => {
    const value = raw[key];
    return Array.isArray(value) ? value[0] : value;
  };
  const qty = Number.parseInt(one('qty') ?? '', 10);
  const product = one('product');
  const mode = one('mode');
  const broker = one('broker');
  const profileId = one('profileId');
  return {
    symbol: (one('symbol') ?? '').toUpperCase(),
    exchange: (one('exchange') ?? 'NSE').toUpperCase() === 'BSE' ? 'BSE' : 'NSE',
    side: one('side') === 'SELL' ? 'SELL' : 'BUY',
    qty: Number.isInteger(qty) && qty > 0 ? qty : null,
    product: product === 'delivery' || product === 'intraday' ? product : null,
    mode: mode === 'live' || mode === 'paper' ? mode : null,
    profileId: profileId && /^[a-f\d]{24}$/i.test(profileId) ? profileId : undefined,
    broker: broker === 'mstock' || broker === 'groww' ? broker : null,
  };
}
