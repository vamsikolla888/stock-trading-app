import type { PaperView } from '../types';

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

export interface PaperChainParams {
  underlying: string | null;
  expiry: string | null;
  /** Open the strategy builder on arrival. */
  builder: boolean;
}

export function parsePaperChainParams(params: {
  underlying?: RawParam;
  expiry?: RawParam;
  builder?: RawParam;
}): PaperChainParams {
  const builder = first(params.builder);
  return {
    underlying: parseUnderlying(params.underlying),
    expiry: parseExpiry(params.expiry),
    builder: builder === '1' || builder === 'true',
  };
}

/** /paper-option-chain with only the params that are set (an absent key, never "undefined"). */
export function paperChainHref(
  options: {
    underlying?: string | null;
    expiry?: string | null;
    builder?: boolean;
  } = {},
): { pathname: '/paper-option-chain'; params: Record<string, string> } {
  const params: Record<string, string> = {};
  if (options.underlying) params.underlying = options.underlying;
  if (options.expiry) params.expiry = options.expiry;
  if (options.builder) params.builder = '1';
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
