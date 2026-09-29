import type {
  ExploreExchange,
  ExploreFuture,
  ExplorePeriod,
  ExploreSection,
  ExploreUnderlying,
  FnoExchange,
} from '../types';

/**
 * Helpers for the Explore screens. The server decides every ranking and every baseline
 * (modules/fno/fno-explore.rules.ts); the app only re-measures a price against THE SAME
 * baseline, so a row can never disagree with the row the server ranked.
 */

/** A price against a baseline, null when either is unusable — same rule as the server's
 *  moveFrom (a zero baseline is unknown, never Infinity). */
export function liveMove(
  ltp: number | null,
  base: number | null,
): { change: number | null; changePct: number | null } {
  if (ltp == null || base == null || !(ltp > 0) || !(base > 0)) {
    return { change: null, changePct: null };
  }
  const change = ltp - base;
  return {
    change: Math.round(change * 100) / 100 + 0,
    changePct: Math.round((change / base) * 10_000) / 100 + 0,
  };
}

/** The baseline a period's move is measured from. */
export function periodBase(
  row: Pick<ExploreUnderlying, 'prevClose' | 'weekBase' | 'monthBase'>,
  period: ExplorePeriod,
): number | null {
  if (period === 'd1') return row.prevClose;
  return period === 'w1' ? row.weekBase : row.monthBase;
}

export const PERIODS: readonly { key: ExplorePeriod; label: string; column: string }[] = [
  { key: 'd1', label: '1D', column: '1D change' },
  { key: 'w1', label: '1W', column: '1W change' },
  { key: 'm1', label: '1M', column: '1M change' },
];

export type SectionKind = 'underlyings' | 'futures' | 'commodities';

export const SECTION_META: Record<
  ExploreSection,
  {
    title: string;
    kind: SectionKind;
    rank: 'topTraded' | 'indexFutures' | 'stockFutures' | 'commodities' | 'commodityFutures' | null;
  }
> = {
  underlyings: { title: 'Top traded', kind: 'underlyings', rank: 'topTraded' },
  stocks: { title: 'F&O stocks', kind: 'underlyings', rank: null },
  'index-futures': { title: 'Index futures', kind: 'futures', rank: 'indexFutures' },
  'stock-futures': { title: 'Stock futures', kind: 'futures', rank: 'stockFutures' },
  commodities: { title: 'Commodities', kind: 'commodities', rank: 'commodities' },
  'commodity-futures': {
    title: 'Commodity futures',
    kind: 'commodities',
    rank: 'commodityFutures',
  },
};

/** Own keys only: `in` would also accept "toString" and "constructor" from the prototype. */
export function isExploreSection(value: unknown): value is ExploreSection {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(SECTION_META, value);
}

export type ListOrder = 'rank' | 'gainers' | 'losers';

const isUnderlying = (row: ExploreUnderlying | ExploreFuture): row is ExploreUnderlying =>
  !('tradingSymbol' in row);

/**
 * One "See more" list, filtered and (for F&O stocks) re-ordered by the chosen period's move.
 * Rows with no move for the period drop out of a gainers/losers order — an unknown move
 * cannot be ranked. The server's own order is kept otherwise.
 */
export function filterExploreRows<R extends ExploreUnderlying | ExploreFuture>(
  rows: readonly R[],
  options: { query: string; order?: ListOrder; period?: ExplorePeriod },
): R[] {
  const needle = options.query.trim().toUpperCase();
  let out = needle
    ? rows.filter(
        (r) =>
          r.underlying.toUpperCase().includes(needle) ||
          r.label.toUpperCase().includes(needle) ||
          (!isUnderlying(r) && r.tradingSymbol.toUpperCase().includes(needle)),
      )
    : [...rows];
  const order = options.order ?? 'rank';
  if (order !== 'rank') {
    const period = options.period ?? 'd1';
    const pct = (r: R) =>
      isUnderlying(r) ? liveMove(r.ltp, periodBase(r, period)).changePct : r.changePct;
    out = out
      .filter((r) => pct(r) != null)
      .sort((a, b) =>
        order === 'gainers'
          ? (pct(b) as number) - (pct(a) as number)
          : (pct(a) as number) - (pct(b) as number),
      );
  }
  return out;
}

/** The option chain for an underlying (optionally on its futures tab / at one expiry). */
export function chainHref(
  exchange: FnoExchange,
  underlying: string,
  options: { tab?: 'futures'; expiry?: string | null } = {},
) {
  const params: Record<string, string> = { exchange, underlying };
  if (options.tab) params.tab = options.tab;
  if (options.expiry) params.expiry = options.expiry;
  return { pathname: '/option-chain' as const, params };
}

/** Only NSE/BSE F&O has a chain screen; MCX is priced here but not traded through Groww. */
export function isChainExchange(exchange: ExploreExchange | string): exchange is FnoExchange {
  return exchange === 'NFO' || exchange === 'BFO';
}

/**
 * Where an expiry-calendar line opens: the option chain AT that date when options expire
 * then, else the futures tab. The chain refuses a date with no options (422, "not a listed
 * option expiry") rather than silently showing another expiry.
 */
export function calendarEntryHref(
  exchange: FnoExchange,
  underlying: string,
  date: string,
  hasOptions: boolean,
) {
  return chainHref(exchange, underlying, hasOptions ? { expiry: date } : { tab: 'futures' });
}

/* ── Route params ─────────────────────────────────────────────────────────────────────── */

/** A route param as one trimmed string: a repeated key arrives as an array, a missing one as undefined. */
export function paramString(value: string | string[] | undefined | null): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  if (typeof first !== 'string') return null;
  const trimmed = first.trim();
  return trimmed ? trimmed : null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ChainRouteParams {
  exchange: FnoExchange;
  underlying: string;
  /** Null = the nearest listed expiry. A value the server's `YYYY-MM-DD` rule would refuse is dropped. */
  expiry: string | null;
  tab: 'options' | 'futures';
}

/** /option-chain's params, normalised the way the server will read them. */
export function parseChainParams(params: {
  exchange?: string | string[];
  underlying?: string | string[];
  expiry?: string | string[];
  tab?: string | string[];
}): ChainRouteParams {
  const exchange = paramString(params.exchange)?.toUpperCase();
  const expiry = paramString(params.expiry);
  return {
    exchange: exchange === 'BFO' ? 'BFO' : 'NFO',
    underlying: (paramString(params.underlying) ?? 'NIFTY').toUpperCase(),
    expiry: expiry && ISO_DATE.test(expiry) ? expiry : null,
    tab: paramString(params.tab) === 'futures' ? 'futures' : 'options',
  };
}
