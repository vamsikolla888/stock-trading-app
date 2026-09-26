import type {
  FnoBookTotals,
  FnoOrderView,
  FnoPositionView,
  OptionChainLeg,
  PaperExchange,
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
  return (hit ?? preferred ?? catalogue[0]).underlying;
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

export function expiredCount(positions: readonly Pick<FnoPositionView, 'daysToExpiry'>[]): number {
  return positions.filter((p) => p.daysToExpiry < 0).length;
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

/**
 * A held position as a payoff leg: the SIGNED lot count becomes the side (the wire wants
 * positive lots), and the leg is priced at its ENTRY — the curve then answers "what does this
 * pay me at expiry" against what it actually cost, not what re-opening it today would.
 */
export function payoffLegs(
  positions: readonly Pick<FnoPositionView, 'tradingsymbol' | 'exchange' | 'lots' | 'avgPrice'>[],
): PayoffLegInput[] {
  return positions.map((p) => {
    const leg: PayoffLegInput = {
      tradingsymbol: p.tradingsymbol,
      side: p.lots < 0 ? 'SELL' : 'BUY',
      lots: Math.abs(p.lots),
    };
    if (p.exchange === 'NFO' || p.exchange === 'BFO') leg.exchange = p.exchange as PaperExchange;
    // The schema wants a positive price; a zero-cost entry (a settled leg) is priced live.
    if (p.avgPrice > 0) leg.price = p.avgPrice;
    return leg;
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
    const rightward = Math.abs(last.profit) >= Math.abs(first.profit);
    const end = rightward ? last : first;
    edge = {
      x: rightward ? box.width - box.padRight : box.padLeft,
      y: r(py(end.profit)),
      rightward,
      loss: end.profit < 0,
    };
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
