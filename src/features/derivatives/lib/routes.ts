import { chainHref, underlyingHref } from '@/features/fno/lib/explore';
import type { FnoContract, FnoUnderlying } from '@/features/fno/types';

import type { DerivativeKind, PaperView } from '../types';

import type { PaperContract } from './paperFno';

/**
 * Links into the paper F&O screens, and the decoding of their route params. A param arrives
 * as whatever the link (or a user editing a deep link) put there — a string, an array, a
 * double-encoded value, nothing — so each one is validated against the server's own rules
 * and anything else is dropped rather than sent to a `.strict()` schema to be refused.
 */

/** The web's /fno/paper trading screen: the book first, discovery last. */
export const PAPER_VIEWS: readonly { key: PaperView; label: string }[] = [
  { key: 'positions', label: 'Positions' },
  { key: 'orders', label: 'Orders' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'explore', label: 'Explore' },
];

type RawParam = string | string[] | undefined | null;

function first(value: RawParam): string | null {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' ? v : null;
}

/** Decodes once more when a value still carries escapes ("M%26M"); a malformed escape is dropped. */
function decoded(value: string): string | null {
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

/** Same character rule as the server's underlyingParamsSchema. */
const UNDERLYING = /^[A-Z0-9&_-]{1,30}$/;
/** An exchange trading symbol ("NIFTY26O0625000CE", "M&M26OCTFUT"). */
const TRADINGSYMBOL = /^[A-Z0-9&_-]{1,40}$/;

export function parseUnderlying(value: RawParam): string | null {
  const raw = first(value);
  if (raw == null) return null;
  const text = decoded(raw)?.trim().toUpperCase();
  return text && UNDERLYING.test(text) ? text : null;
}

/** YYYY-MM-DD that is a real calendar date (the chain query's `expiry`). */
export function parseExpiry(value: RawParam): string | null {
  const raw = first(value)?.trim();
  if (!raw) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  const real =
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  return real ? raw : null;
}

export function parsePaperView(value: RawParam): PaperView {
  const raw = first(value);
  return raw === 'orders' || raw === 'analytics' || raw === 'explore' ? raw : 'positions';
}

/** A positive number from a param, or null. `integer` also requires a whole number. */
function positive(value: RawParam, integer = false): number | null {
  const raw = first(value)?.trim();
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return integer && !Number.isInteger(n) ? null : n;
}

/** A contract to open the paper ticket on, carried by a link (search, the cash paper screen). */
export interface PaperTicketLink {
  contract: PaperContract;
  side: 'BUY' | 'SELL';
  lots: number | null;
}

export interface PaperChainParams {
  underlying: string | null;
  expiry: string | null;
  /** Open the strategy builder on arrival. */
  builder: boolean;
  /** Open the order ticket on this contract on arrival. */
  ticket: PaperTicketLink | null;
}

const KINDS: readonly DerivativeKind[] = ['CE', 'PE', 'FUT'];

/**
 * The deep-linked contract, or null unless every field the ticket needs is valid: the symbol,
 * the kind, a real expiry, a whole lot size, and a strike for an option.
 */
function parseTicketLink(params: Record<string, RawParam>): PaperTicketLink | null {
  const symbol = decoded(first(params.contract) ?? '')
    ?.trim()
    .toUpperCase();
  const underlying = parseUnderlying(params.underlying);
  const kindRaw = first(params.kind)?.toUpperCase();
  const kind = KINDS.find((k) => k === kindRaw);
  const expiry = parseExpiry(params.cexpiry);
  const lotSize = positive(params.lot, true);
  const strike = kind === 'FUT' ? null : positive(params.strike);
  if (!symbol || !TRADINGSYMBOL.test(symbol) || !underlying || !kind || !expiry || !lotSize) {
    return null;
  }
  if (kind !== 'FUT' && strike == null) return null;
  const lots = positive(params.lots, true);
  return {
    contract: {
      exchange: first(params.ex) === 'BFO' ? 'BFO' : 'NFO',
      tradingsymbol: symbol,
      underlying,
      kind,
      strike,
      expiry,
      lotSize,
      tickSize: positive(params.tick),
      freezeQuantity: positive(params.freeze, true),
    },
    side: first(params.side) === 'SELL' ? 'SELL' : 'BUY',
    lots: lots != null && lots <= 100 ? lots : null,
  };
}

export function parsePaperChainParams(params: {
  underlying?: RawParam;
  expiry?: RawParam;
  builder?: RawParam;
  contract?: RawParam;
  ex?: RawParam;
  kind?: RawParam;
  strike?: RawParam;
  lot?: RawParam;
  cexpiry?: RawParam;
  tick?: RawParam;
  freeze?: RawParam;
  side?: RawParam;
  lots?: RawParam;
}): PaperChainParams {
  const builder = first(params.builder);
  return {
    underlying: parseUnderlying(params.underlying),
    expiry: parseExpiry(params.expiry),
    builder: builder === '1' || builder === 'true',
    ticket: params.contract != null ? parseTicketLink(params) : null,
  };
}

/** /paper-option-chain with only the params that are set (an absent key, never "undefined"). */
export function paperChainHref(
  options: {
    underlying?: string | null;
    expiry?: string | null;
    builder?: boolean;
    /** Open the ticket on this contract on arrival. */
    ticket?: { contract: PaperContract; side?: 'BUY' | 'SELL'; lots?: number | null };
  } = {},
): { pathname: '/paper-option-chain'; params: Record<string, string> } {
  const params: Record<string, string> = {};
  if (options.underlying) params.underlying = options.underlying;
  if (options.expiry) params.expiry = options.expiry;
  if (options.builder) params.builder = '1';
  const t = options.ticket;
  if (t) {
    const c = t.contract;
    params.underlying = c.underlying;
    params.contract = c.tradingsymbol;
    params.ex = c.exchange;
    params.kind = c.kind;
    params.cexpiry = c.expiry;
    params.lot = String(c.lotSize);
    if (c.kind !== 'FUT' && c.strike != null) params.strike = String(c.strike);
    if (c.tickSize != null) params.tick = String(c.tickSize);
    if (c.freezeQuantity != null) params.freeze = String(c.freezeQuantity);
    if (t.side === 'SELL') params.side = 'SELL';
    if (t.lots != null && t.lots > 0) params.lots = String(t.lots);
  }
  return { pathname: '/paper-option-chain', params };
}

/**
 * The paper book tab on one of its views. Open with `router.dismissTo`, not push/navigate:
 * from a stack screen both of those PUSH another copy of the whole tab navigator.
 */
export function paperBookHref(view: PaperView): {
  pathname: '/fno/paper';
  params: { view: PaperView };
} {
  return { pathname: '/fno/paper', params: { view } };
}

/** The F&O paper screen with its wallet sheet open — "Add funds" from a ticket or Settings. */
export function paperWalletHref(): {
  pathname: '/fno/paper';
  params: { wallet: '1' };
} {
  return { pathname: '/fno/paper', params: { wallet: '1' } };
}

/* ── Search ──────────────────────────────────────────────────────────────────────────── */

/** Whose search it is: the app's (an F&O pick opens the LIVE chain) or a paper screen's. */
export type SearchScope = 'app' | 'paper';

export function parseSearchScope(value: RawParam): SearchScope {
  return first(value) === 'paper' ? 'paper' : 'app';
}

/** The search screen in a paper screen's scope. */
export function paperSearchHref(): { pathname: '/search'; params: { scope: 'paper' } } {
  return { pathname: '/search', params: { scope: 'paper' } };
}

/** An F&O search hit: an underlying or one contract. */
export type FnoSearchPick =
  | { type: 'underlying'; underlying: Pick<FnoUnderlying, 'exchange' | 'underlying'> }
  | { type: 'contract'; contract: FnoContract };

/**
 * Where an F&O search pick goes. ON A PAPER SCREEN IT NEVER OPENS THE LIVE CHAIN — that is one
 * wrong tap away from a real order: an underlying opens its paper chain, a contract opens the
 * paper ticket on that chain. Anywhere else, the live screens.
 */
export function fnoSearchHref(pick: FnoSearchPick, scope: SearchScope) {
  if (scope === 'paper') {
    if (pick.type === 'underlying')
      return paperChainHref({ underlying: pick.underlying.underlying });
    const c = pick.contract;
    return paperChainHref({
      expiry: c.kind === 'FUT' ? null : c.expiry,
      ticket: {
        contract: {
          exchange: c.exchange === 'BFO' ? 'BFO' : 'NFO',
          tradingsymbol: c.tradingSymbol,
          underlying: c.underlying,
          kind: c.kind,
          strike: c.kind === 'FUT' ? null : c.strike,
          expiry: c.expiry,
          lotSize: c.lotSize,
          tickSize: c.tickSize,
          freezeQuantity: c.freezeQuantity,
        },
      },
    });
  }
  if (pick.type === 'underlying') {
    return underlyingHref(pick.underlying.exchange, pick.underlying.underlying);
  }
  const c = pick.contract;
  return chainHref(
    c.exchange,
    c.underlying,
    c.kind === 'FUT' ? { tab: 'futures' } : { expiry: c.expiry },
  );
}
