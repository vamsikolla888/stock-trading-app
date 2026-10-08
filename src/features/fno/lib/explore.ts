import type {
  CommodityContractSearchResult,
  CommodityExchange,
  CommodityUnderlying,
  EquityFnoExchange,
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
/**
 * A row's price with the live stream folded in: the streamed last price for its `streamKey`
 * (`EXCHANGE:SYMBOL`, the server's stream key) when one has arrived, else the REST price.
 */
export function streamedLtp(
  live: ReadonlyMap<string, { ltp: number }> | undefined,
  key: string | null | undefined,
  rest: number | null,
): number | null {
  if (!live || !key) return rest;
  return live.get(key.toUpperCase())?.ltp ?? rest;
}

/** The stream targets for a set of rows' keys — deduplicated, malformed keys left out. */
export function streamTargets(
  keys: readonly (string | null | undefined)[],
): { exchange: string; symbol: string }[] {
  const out = new Map<string, { exchange: string; symbol: string }>();
  for (const key of keys) {
    const parsed = splitStreamKey(key);
    if (parsed) out.set(`${parsed.exchange}:${parsed.symbol}`, parsed);
  }
  return [...out.values()];
}

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

/* ── Exchanges ────────────────────────────────────────────────────────────────────────── */

/** MCX, or NSE's commodity segment (NCO): read-only books — no order is ever placed on them. */
export function isCommodityExchange(
  exchange: string | null | undefined,
): exchange is CommodityExchange {
  return exchange === 'MCX' || exchange === 'NCO';
}

/** NSE / BSE F&O: the books orders, margin and exits go to. */
export function isEquityFnoExchange(
  exchange: string | null | undefined,
): exchange is EquityFnoExchange {
  return exchange === 'NFO' || exchange === 'BFO';
}

/** Every book with a chain / futures screen (orders only on NFO/BFO). */
export function isChainExchange(exchange: string | null | undefined): exchange is FnoExchange {
  return isEquityFnoExchange(exchange) || isCommodityExchange(exchange);
}

/**
 * MCX's trading day in IST: 09:00–23:30, Monday–Friday (the evening session runs past equity
 * hours). Holidays are not known here — the server stays the authority; this only decides how
 * eagerly a commodity screen polls.
 */
export function isMcxSessionOpen(now: number = Date.now()): boolean {
  const ist = new Date(now + 330 * 60_000);
  const weekday = ist.getUTCDay();
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return weekday !== 0 && weekday !== 6 && minute >= 9 * 60 && minute < 23 * 60 + 30;
}

/** A commodity screen's poll: `activeMs` in the MCX session, off outside it. */
export function commodityPollInterval(activeMs: number, now: number = Date.now()): number | false {
  return isMcxSessionOpen(now) ? activeMs : false;
}

/** A stream key (`MCX:GOLD05NOV26FUT`) as its exchange and symbol; null when malformed. */
export function splitStreamKey(
  key: string | null | undefined,
): { exchange: string; symbol: string } | null {
  if (typeof key !== 'string') return null;
  const at = key.indexOf(':');
  if (at <= 0 || at === key.length - 1) return null;
  return { exchange: key.slice(0, at).toUpperCase(), symbol: key.slice(at + 1).toUpperCase() };
}

/** "NSE" / "BSE" / "MCX" / "NSE commodity" — the venue line of a chain screen. */
export function venueLabel(exchange: FnoExchange): string {
  if (exchange === 'BFO') return 'BSE';
  if (exchange === 'MCX') return 'MCX';
  if (exchange === 'NCO') return 'NSE commodity';
  return 'NSE';
}

/* ── Links ────────────────────────────────────────────────────────────────────────────── */

/**
 * The option chain for an underlying (optionally on its futures tab / at one expiry).
 * `contract` charts that contract on arrival (and, on an equity book, opens its ticket).
 */
export function chainHref(
  exchange: FnoExchange,
  underlying: string,
  options: { tab?: 'futures'; expiry?: string | null; contract?: string | null } = {},
) {
  const params: Record<string, string> = { exchange, underlying };
  if (options.tab) params.tab = options.tab;
  if (options.expiry) params.expiry = options.expiry;
  if (options.contract) params.contract = options.contract;
  return { pathname: '/option-chain' as const, params };
}

/**
 * A commodity's chain or futures (MCX, or NSE's commodity segment) — the same screen as an
 * index's, read-only. `contract` charts that contract on arrival. Mirrors the web's
 * commodityChainPath.
 */
export function commodityChainHref(
  exchange: CommodityExchange,
  underlying: string,
  tab: 'options' | 'futures',
  expiry?: string | null,
  contract?: string | null,
) {
  return chainHref(exchange, underlying, {
    tab: tab === 'futures' ? 'futures' : undefined,
    expiry: tab === 'options' ? expiry : null,
    contract,
  });
}

/** A commodity underlying from search: its chain when it lists options (most of MCX doesn't). */
export function commodityHref(
  c: Pick<CommodityUnderlying, 'exchange' | 'underlying' | 'hasOptions'>,
) {
  return commodityChainHref(c.exchange, c.underlying, c.hasOptions ? 'options' : 'futures');
}

/** A commodity contract from search: its chain at its expiry (an option) or its futures. */
export function commodityContractHref(
  c: Pick<
    CommodityContractSearchResult,
    'exchange' | 'underlying' | 'kind' | 'expiry' | 'tradingSymbol'
  >,
) {
  const future = c.kind === 'FUT';
  return commodityChainHref(
    c.exchange,
    c.underlying,
    future ? 'futures' : 'options',
    future ? null : c.expiry,
    c.tradingSymbol,
  );
}

/**
 * Where an Explore commodity future (a shelf card, a "See more" row, a top-traded tile) opens:
 * its commodity's futures with this contract charted. Null for anything that is not on a
 * commodity book or names no contract.
 */
export function exploreCommodityHref(f: {
  exchange: string;
  underlying: string;
  tradingSymbol: string | null;
}) {
  if (!isCommodityExchange(f.exchange)) return null;
  return commodityChainHref(f.exchange, f.underlying, 'futures', null, f.tradingSymbol);
}

/** An underlying's own screen (index or F&O stock): price, chart, full screen, chain, futures. */
export function underlyingHref(exchange: FnoExchange, underlying: string) {
  return { pathname: '/fno-underlying' as const, params: { exchange, underlying } };
}

/**
 * The advanced chart for an F&O underlying (charted through `anchor`, any listed contract of it)
 * or for one contract. `spotSymbol` streams the underlying's price; `prevClose` draws the day's
 * baseline and measures the header's move.
 */
export function fnoChartHref(options: {
  exchange: FnoExchange;
  target: 'underlying' | 'contract';
  /** The underlying (target underlying) or the contract's trading symbol (target contract). */
  subject: string;
  anchor: string;
  label?: string;
  spotSymbol?: string | null;
  prevClose?: number | null;
  fullscreen?: boolean;
}) {
  const params: Record<string, string> & { symbol: string } = {
    symbol: options.subject,
    exchange: options.exchange,
    src: 'fno',
    target: options.target,
    anchor: options.anchor,
  };
  if (options.label) params.label = options.label;
  if (options.spotSymbol) params.spot = options.spotSymbol;
  if (options.prevClose != null && options.prevClose > 0) params.pc = String(options.prevClose);
  if (options.fullscreen) params.full = '1';
  return { pathname: '/chart/[symbol]' as const, params };
}

/**
 * Where an expiry-calendar line opens: the option chain AT that date when options expire
 * then, else the futures tab. The chain refuses a date with no options (422, "not a listed
 * option expiry") rather than silently showing another expiry. A commodity opens the same
 * screen, read-only.
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
/** Same character rule as the server's tradingSymbol schema. */
const TRADING_SYMBOL = /^[A-Z0-9&_-]{3,40}$/;

export interface ChainRouteParams {
  exchange: FnoExchange;
  underlying: string;
  /** Null = the nearest listed expiry. A value the server's `YYYY-MM-DD` rule would refuse is dropped. */
  expiry: string | null;
  tab: 'options' | 'futures';
}

/** An exchange param: any of the four books, else NFO (what the server would default to). */
export function parseFnoExchange(value: string | string[] | undefined | null): FnoExchange {
  const exchange = paramString(value)?.toUpperCase();
  return isChainExchange(exchange) ? exchange : 'NFO';
}

/** /option-chain's params, normalised the way the server will read them. */
export function parseChainParams(params: {
  exchange?: string | string[];
  underlying?: string | string[];
  expiry?: string | string[];
  tab?: string | string[];
}): ChainRouteParams {
  const expiry = paramString(params.expiry);
  return {
    exchange: parseFnoExchange(params.exchange),
    underlying: (paramString(params.underlying) ?? 'NIFTY').toUpperCase(),
    expiry: expiry && ISO_DATE.test(expiry) ? expiry : null,
    tab: paramString(params.tab) === 'futures' ? 'futures' : 'options',
  };
}

/** The `contract` param (a trading symbol to chart on arrival), or null when malformed. */
export function parseContractParam(value: string | string[] | undefined | null): string | null {
  const symbol = paramString(value)?.toUpperCase() ?? null;
  return symbol && TRADING_SYMBOL.test(symbol) ? symbol : null;
}
