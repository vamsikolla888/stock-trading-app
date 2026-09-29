import type {
  ExpirySettlementResult,
  FnoBookTotals,
  FnoCharges,
  FnoOrderView,
  FnoPositionView,
  OptionChain,
  OptionChainLeg,
  PaperExchange,
  PaperTicketQuote,
  PayoffAnalysis,
  PayoffLegInput,
  SpotSource,
  StrategyOutlook,
  UnderlyingSummary,
} from '../types';

/** Pure helpers behind the paper F&O screens. */

/** Opened when nothing else was asked for: the most-traded contract, so the least surprising. */
export const PREFERRED_UNDERLYING = 'NIFTY';

/**
 * The underlying the paper chain opens on: a deep-linked one when the catalogue lists it, else
 * NIFTY, else the first listed. A stale or mistyped link falls back rather than opening on
 * nothing. Null until the catalogue has loaded.
 */
export function defaultUnderlying(
  catalogue: readonly Pick<UnderlyingSummary, 'underlying'>[] | undefined,
  linked: string | null | undefined,
): string | null {
  if (!catalogue || catalogue.length === 0) return null;
  const want = linked?.trim().toUpperCase();
  const hit = want ? catalogue.find((u) => u.underlying === want) : undefined;
  const preferred = catalogue.find((u) => u.underlying === PREFERRED_UNDERLYING);
  return (hit ?? preferred ?? catalogue[0])?.underlying ?? null;
}

/** Quick-pick lot sizes on the paper ticket. */
export const QUICK_LOTS = [1, 2, 5, 10] as const;

/** The paper book caps one order at 100 lots (server placeFnoOrderBodySchema). */
export const PAPER_MAX_LOTS = 100;

export function clampPaperLots(n: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(PAPER_MAX_LOTS, Math.max(1, Math.floor(n)));
}

/** Strikes either side of ATM for the paper chain; the server caps the window at 50. */
export const PAPER_WINDOWS = [5, 10, 20, 30] as const;

/** F&O returns = unrealised + realised, as the web's book card sums it. */
export function bookReturns(totals: Pick<FnoBookTotals, 'unrealisedPnl' | 'realisedPnl'>): number {
  return Math.round((totals.unrealisedPnl + totals.realisedPnl) * 100) / 100;
}

/* ── Expiry ───────────────────────────────────────────────────────────────────────────── */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Expired = the expiry date is before today in IST — the server's own settlement rule
 * (`expiry < todayIST()`). NOT `daysToExpiry < 0`: the server clamps that at zero, so an
 * expired leg reads "0 days" for ever and would never be offered for settlement.
 */
export function isExpired(expiry: string, today: string): boolean {
  return ISO_DATE.test(expiry) && ISO_DATE.test(today) && expiry < today;
}

export function expiredCount(
  positions: readonly Pick<FnoPositionView, 'expiry'>[],
  today: string,
): number {
  return positions.filter((p) => isExpired(p.expiry, today)).length;
}

/** "5d" / "today" / "expired" for a held leg, with expiry decided by the date (see above). */
export function positionDteLabel(
  p: Pick<FnoPositionView, 'expiry' | 'daysToExpiry'>,
  today: string,
): string {
  if (isExpired(p.expiry, today)) return 'expired';
  const days = p.daysToExpiry;
  if (!Number.isFinite(days) || days < 0) return '—';
  return days === 0 ? 'today' : `${days}d`;
}

export interface SettlementOutcome {
  tone: 'success' | 'info' | 'warning';
  title: string;
  message: string;
}

/**
 * A settlement run in words. The server skips (and logs) any expired position whose underlying
 * has no closing price yet — an index with no cash row, typically — so "settled 0" after an
 * expired leg was on screen means "not yet", never "nothing had expired".
 */
export function settlementOutcome(
  result: Pick<ExpirySettlementResult, 'settled' | 'totalPnl' | 'details'>,
  expiredBefore: number,
  money: (n: number) => string,
  signedMoney: (n: number) => string,
): SettlementOutcome {
  const plural = (n: number) => `${n} position${n === 1 ? '' : 's'}`;
  if (result.settled === 0) {
    return expiredBefore > 0
      ? {
          tone: 'warning',
          title: 'None could be settled yet',
          message: `${plural(expiredBefore)} passed expiry, but settling needs the underlying’s closing price and it is not available yet. Try again later.`,
        }
      : {
          tone: 'info',
          title: 'Nothing to settle',
          message: 'No position had passed expiry, so nothing was settled.',
        };
  }
  const left = Math.max(0, expiredBefore - result.settled);
  const detail = result.details
    .map((d) => `${d.tradingsymbol} at ${money(d.settlementPrice)}`)
    .join(' · ');
  return {
    tone: left > 0 ? 'warning' : 'success',
    title: `Settled ${plural(result.settled)} for ${signedMoney(result.totalPnl)}`,
    message:
      `${detail}${detail ? '. ' : ''}Options settle at intrinsic value, futures against the underlying close.` +
      (left > 0
        ? ` ${plural(left)} still ${left === 1 ? 'waits' : 'wait'} for a closing price.`
        : ''),
  };
}

/** A premium flow in words: negative means premium was RECEIVED (a short). */
export function premiumFlow(flow: number): { amount: number; word: 'received' | 'paid' } {
  return { amount: Math.abs(flow), word: flow < 0 ? 'received' : 'paid' };
}

/** Premium × lots × lot size; null when the contract has never traded (null is not zero). */
export function legOrderValue(
  leg: Pick<OptionChainLeg, 'lastPrice' | 'lotSize'>,
  lots: number,
): { quantity: number; total: number | null } {
  const quantity = lots * leg.lotSize;
  const total = leg.lastPrice != null ? Math.round(leg.lastPrice * quantity * 100) / 100 : null;
  return { quantity, total };
}

/** What the spot actually is, in words — only `cash-snapshot` is a traded price. */
export function spotSourceLabel(source: SpotSource): string {
  switch (source) {
    case 'cash-snapshot':
      return 'cash market price';
    case 'implied-from-parity':
      return 'derived from put-call parity';
    case 'implied-from-future':
      return 'derived from the future';
    default:
      return 'no price available';
  }
}

export function isDerivedSpot(source: SpotSource): boolean {
  return source === 'implied-from-parity' || source === 'implied-from-future';
}

/**
 * The index labels the market indices feed uses, mapped to the derivatives underlying code.
 * Consulted against the real catalogue — an index with no listed options is never linked.
 */
export const INDEX_UNDERLYING: Record<string, string> = {
  'NIFTY 50': 'NIFTY',
  'BANK NIFTY': 'BANKNIFTY',
  SENSEX: 'SENSEX',
  FINNIFTY: 'FINNIFTY',
  MIDCPNIFTY: 'MIDCPNIFTY',
  BANKEX: 'BANKEX',
};

export function indexUnderlying(label: string, catalogue: ReadonlySet<string>): string | null {
  const underlying = INDEX_UNDERLYING[label];
  return underlying && catalogue.has(underlying) ? underlying : null;
}

/**
 * The underlying picker's matches: prefix matches before substring matches, indices first in
 * each group, capped — typing "RE" should offer RELIANCE before names merely containing "RE".
 */
export function matchUnderlyings(
  list: readonly UnderlyingSummary[],
  query: string,
  max = 30,
): UnderlyingSummary[] {
  const q = query.trim().toUpperCase();
  const byIndexFirst = (a: UnderlyingSummary, b: UnderlyingSummary) =>
    Number(b.isIndex) - Number(a.isIndex);
  if (!q) return [...list].sort(byIndexFirst).slice(0, max);
  const prefix: UnderlyingSummary[] = [];
  const contains: UnderlyingSummary[] = [];
  for (const u of list) {
    const name = u.underlying.toUpperCase();
    if (name.startsWith(q)) prefix.push(u);
    else if (name.includes(q)) contains.push(u);
  }
  return [...prefix.sort(byIndexFirst), ...contains.sort(byIndexFirst)].slice(0, max);
}

/** Positions grouped by underlying, in first-seen order. */
export function groupByUnderlying(
  positions: readonly FnoPositionView[],
): { underlying: string; positions: FnoPositionView[] }[] {
  const groups = new Map<string, FnoPositionView[]>();
  for (const p of positions) {
    const list = groups.get(p.underlying);
    if (list) list.push(p);
    else groups.set(p.underlying, [p]);
  }
  return [...groups.entries()].map(([underlying, list]) => ({ underlying, positions: list }));
}

/* ── Payoff of what is held ───────────────────────────────────────────────────────────── */

/** The server prices at most eight legs in one payoff (payoffBodySchema). */
export const PAYOFF_MAX_LEGS = 8;
/** payoffLegSchema's `price` bound. */
const PAYOFF_MAX_PRICE = 1_000_000;

/**
 * A held position as payoff legs: the SIGNED lot count becomes the side (the wire wants
 * positive lots), and each leg is priced at its ENTRY — the curve then answers "what does this
 * pay me at expiry" against what it actually cost, not what re-opening it today would.
 *
 * A leg is capped at 100 lots on the wire (payoffLegSchema) but a position is not — two
 * 100-lot fills make a 200-lot line — so a big line is sent as several same-priced legs,
 * which sum to exactly the same curve.
 */
export function payoffLegs(
  positions: readonly Pick<FnoPositionView, 'tradingsymbol' | 'exchange' | 'lots' | 'avgPrice'>[],
): PayoffLegInput[] {
  const legs: PayoffLegInput[] = [];
  for (const p of positions) {
    const side = p.lots < 0 ? 'SELL' : 'BUY';
    let remaining = Number.isFinite(p.lots) ? Math.abs(Math.trunc(p.lots)) : 0;
    while (remaining > 0) {
      const lots = Math.min(PAPER_MAX_LOTS, remaining);
      const leg: PayoffLegInput = { tradingsymbol: p.tradingsymbol, side, lots };
      if (p.exchange === 'NFO' || p.exchange === 'BFO') leg.exchange = p.exchange as PaperExchange;
      // The schema wants a positive, bounded price; anything else is priced live instead.
      if (p.avgPrice > 0 && p.avgPrice <= PAYOFF_MAX_PRICE) leg.price = p.avgPrice;
      legs.push(leg);
      remaining -= lots;
    }
  }
  return legs;
}

export interface PayoffGroup {
  underlying: string;
  positions: FnoPositionView[];
  /** Wire legs after splitting; more than eight cannot be priced in one request. */
  legCount: number;
  tooMany: boolean;
}

/** The book, one payoff per underlying (the x-axis is ONE underlying's price). */
export function payoffGroups(positions: readonly FnoPositionView[]): PayoffGroup[] {
  return groupByUnderlying(positions).map((g) => {
    const legCount = payoffLegs(g.positions).length;
    return { ...g, legCount, tooMany: legCount > PAYOFF_MAX_LEGS };
  });
}

export interface PayoffBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
}

export interface PayoffGeometry {
  /** The curve, as an SVG path. */
  line: string;
  /** The region between the curve and the zero line, closed. */
  area: string;
  zeroY: number;
  xMin: number;
  xMax: number;
  plotTop: number;
  plotBottom: number;
  /** Break-evens inside the plotted window, with their x. */
  breakEvens: { value: number; x: number }[];
  /** The spot's x, or null when it falls outside the window. */
  spotX: number | null;
  /** Where the curve keeps running past the window (an unlimited side), or null. */
  edge: { x: number; y: number; rightward: boolean; loss: boolean } | null;
}

/**
 * Screen geometry for an expiry payoff. ZERO IS ALWAYS INSIDE THE Y-RANGE — the whole chart is
 * read against the break-even line. Null for fewer than two points (nothing to draw).
 */
export function payoffGeometry(
  analysis: Pick<PayoffAnalysis, 'points' | 'breakEvens' | 'unlimitedProfit' | 'unlimitedLoss'>,
  spot: number | null | undefined,
  box: PayoffBox,
): PayoffGeometry | null {
  const points = analysis.points.filter(
    (p) => Number.isFinite(p.underlyingPrice) && Number.isFinite(p.profit),
  );
  if (points.length < 2 || !(box.width > 0) || !(box.height > 0)) return null;

  let xMin = Infinity;
  let xMax = -Infinity;
  let rawLo = 0;
  let rawHi = 0;
  for (const p of points) {
    xMin = Math.min(xMin, p.underlyingPrice);
    xMax = Math.max(xMax, p.underlyingPrice);
    rawLo = Math.min(rawLo, p.profit);
    rawHi = Math.max(rawHi, p.profit);
  }
  const padY = (rawHi - rawLo) * 0.12 || 1;
  const yLo = rawLo - padY;
  const yHi = rawHi + padY;
  const plotW = box.width - box.padLeft - box.padRight;
  const plotH = box.height - box.padTop - box.padBottom;
  const xSpan = xMax - xMin || 1;
  const ySpan = yHi - yLo || 1;
  const px = (v: number) => box.padLeft + ((v - xMin) / xSpan) * plotW;
  const py = (v: number) => box.padTop + (1 - (v - yLo) / ySpan) * plotH;
  const r = (n: number) => Math.round(n * 100) / 100;

  const zeroY = r(py(0));
  const line = points
    .map((p, i) => `${i ? 'L' : 'M'}${r(px(p.underlyingPrice))} ${r(py(p.profit))}`)
    .join(' ');
  const area = `${line} L${r(px(xMax))} ${zeroY} L${r(px(xMin))} ${zeroY} Z`;

  let edge: PayoffGeometry['edge'] = null;
  if (analysis.unlimitedProfit || analysis.unlimitedLoss) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first !== undefined && last !== undefined) {
      const rightward = Math.abs(last.profit) >= Math.abs(first.profit);
      const end = rightward ? last : first;
      edge = {
        x: rightward ? box.width - box.padRight : box.padLeft,
        y: r(py(end.profit)),
        rightward,
        loss: end.profit < 0,
      };
    }
  }

  return {
    line,
    area,
    zeroY,
    xMin,
    xMax,
    plotTop: box.padTop,
    plotBottom: box.padTop + plotH,
    breakEvens: analysis.breakEvens
      .filter((b) => Number.isFinite(b) && b >= xMin && b <= xMax)
      .map((b) => ({ value: b, x: r(px(b)) })),
    spotX:
      spot != null && Number.isFinite(spot) && spot >= xMin && spot <= xMax ? r(px(spot)) : null,
    edge,
  };
}

/** "Unlimited" is a WORD, never a number — a short call shown as "max loss ₹0" inverts it. */
export function boundLabel(value: number | null, format: (n: number) => string): string {
  return value == null ? 'Unlimited' : format(value);
}

/* ── Strategies ───────────────────────────────────────────────────────────────────────── */

/** The basket name the server stores, bounded to its 60-character limit. */
export function basketName(strategy: string, underlying: string, expiry: string): string {
  return `${strategy} · ${underlying} ${expiry}`.slice(0, 60);
}

export type OutlookTone = 'success' | 'danger' | 'warning' | 'neutral';

/** Volatile is neither a gain nor a loss claim — direction is not the bet. */
export function outlookTone(outlook: StrategyOutlook): OutlookTone {
  switch (outlook) {
    case 'bullish':
      return 'success';
    case 'bearish':
      return 'danger';
    case 'volatile':
      return 'warning';
    default:
      return 'neutral';
  }
}

/* ── Orders ───────────────────────────────────────────────────────────────────────────── */

/** "Premium paid ₹1,240.00 · charges ₹21.30 · margin ₹98,000" — a fill in words. */
export function fillSummary(
  o: Pick<FnoOrderView, 'premiumFlow' | 'charges' | 'marginDelta'>,
  money: (n: number) => string,
): string {
  const flow = premiumFlow(o.premiumFlow);
  const parts = [`Premium ${flow.word} ${money(flow.amount)}`, `charges ${money(o.charges.total)}`];
  if (o.marginDelta !== 0) {
    parts.push(
      `margin ${o.marginDelta > 0 ? 'blocked' : 'released'} ${money(Math.abs(o.marginDelta))}`,
    );
  }
  return parts.join(' · ');
}

/** Filled / rejected counts for a placed basket. */
export function basketOutcome(orders: readonly Pick<FnoOrderView, 'status'>[]): {
  filled: number;
  total: number;
} {
  return { filled: orders.filter((o) => o.status === 'FILLED').length, total: orders.length };
}

/** The order log's page size — the web's, and well inside the server's cap of 200. */
export const PAPER_ORDERS_LIMIT = 100;

export type PaperOrderFilter = 'all' | 'filled' | 'rejected';

export const PAPER_ORDER_FILTERS: readonly { key: PaperOrderFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'filled', label: 'Filled' },
  { key: 'rejected', label: 'Rejected' },
];

export function filterPaperOrders<T extends Pick<FnoOrderView, 'status'>>(
  orders: readonly T[],
  filter: PaperOrderFilter,
): T[] {
  if (filter === 'filled') return orders.filter((o) => o.status === 'FILLED');
  if (filter === 'rejected') return orders.filter((o) => o.status === 'REJECTED');
  return [...orders];
}

export function countPaperOrders(
  orders: readonly Pick<FnoOrderView, 'status'>[],
): Record<PaperOrderFilter, number> {
  const filled = orders.filter((o) => o.status === 'FILLED').length;
  return { all: orders.length, filled, rejected: orders.length - filled };
}

/** A contract note's lines, in the order a broker prints them. */
export function chargeLines(c: FnoCharges): { label: string; value: number }[] {
  return [
    { label: 'Brokerage', value: c.brokerage },
    { label: 'STT', value: c.stt },
    { label: 'Exchange transaction', value: c.exchangeTxn },
    { label: 'SEBI fee', value: c.sebiFee },
    { label: 'GST', value: c.gst },
    { label: 'Stamp duty', value: c.stampDuty },
  ];
}

/* ── Chain ────────────────────────────────────────────────────────────────────────────── */

/**
 * The latest quote for a ticket's contract in a (refreshed) chain — an option leg by symbol,
 * or the chain's future. Null when the contract is no longer in the chain's window.
 */
export function chainQuote(
  chain: Pick<OptionChain, 'rows' | 'future'> | null | undefined,
  tradingsymbol: string,
): PaperTicketQuote | null {
  if (!chain) return null;
  for (const row of chain.rows) {
    const leg =
      row.call?.tradingsymbol === tradingsymbol
        ? row.call
        : row.put?.tradingsymbol === tradingsymbol
          ? row.put
          : null;
    if (leg) {
      return {
        lastPrice: leg.lastPrice,
        impliedVolatility: leg.impliedVolatility,
        delta: leg.greeks?.delta ?? null,
      };
    }
  }
  if (chain.future?.tradingsymbol === tradingsymbol) {
    return { lastPrice: chain.future.lastPrice, impliedVolatility: null, delta: null };
  }
  return null;
}

/* ── Explore ──────────────────────────────────────────────────────────────────────────── */

/** The fields of GET /market/indices (and its socket) the paper Explore reads. */
export interface IndexQuoteLike {
  exchange: string;
  symbol: string;
  label?: string;
  ltp: number | null;
  change?: number | null;
  changePct?: number | null;
  /** Server-computed (IST): an option on this index expires today. */
  isExpiryToday?: boolean;
}

export interface PaperIndexTile {
  key: string;
  label: string;
  ltp: number;
  change: number | null;
  changePct: number | null;
  /** The chain to open, or null when the catalogue lists no options on this index. */
  underlying: string | null;
  expiryToday: boolean;
}

/** Priced indices, each linked to its paper chain only when the catalogue really lists one. */
export function paperIndexTiles(
  indices: readonly IndexQuoteLike[],
  catalogue: ReadonlySet<string>,
): PaperIndexTile[] {
  const out: PaperIndexTile[] = [];
  for (const idx of indices) {
    if (typeof idx.ltp !== 'number' || !Number.isFinite(idx.ltp)) continue;
    const label = idx.label ?? idx.symbol;
    out.push({
      key: `${idx.exchange}:${idx.symbol}`,
      label,
      ltp: idx.ltp,
      change: idx.change ?? null,
      changePct: idx.changePct ?? null,
      underlying: indexUnderlying(label, catalogue),
      expiryToday: idx.isExpiryToday === true,
    });
  }
  return out;
}
