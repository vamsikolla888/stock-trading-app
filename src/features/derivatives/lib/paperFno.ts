import { rankUnderlyings } from '@/features/fno/lib/underlyingSearch';
import type { FnoContract, FnoUnderlying } from '@/features/fno/types';
import { formatINR, formatSignedINR } from '@/lib/utils/formatters';

import type {
  DerivativeKind,
  FnoBook,
  FnoOrderPreview,
  FnoOrderStatus,
  FnoOrderView,
  FnoPositionView,
  FnoPreviewOutcome,
  FnoWallet,
  PaperExchange,
  PlacePaperFnoOrderInput,
} from '../types';

import { PAPER_MAX_LOTS } from './book';

/**
 * Pure helpers for the paper F&O workspace — ported from the web's lib/paperFno.ts. Money the
 * screen shows LIVE (a position's P&L at the streamed price) is computed here; money the server
 * decides (fills, margin, charges, cash) never is — the ticket renders the server's preview.
 */

/** The one contract shape the paper ticket takes, whichever screen opened it. */
export interface PaperContract {
  exchange: PaperExchange;
  tradingsymbol: string;
  underlying: string;
  kind: DerivativeKind;
  /** Null for a future. */
  strike: number | null;
  expiry: string;
  lotSize: number;
  /** Known from Groww's master; null until the server's preview fills it in. */
  tickSize: number | null;
  freezeQuantity: number | null;
}

export const paperExchange = (exchange: string | null | undefined): PaperExchange =>
  exchange === 'BFO' ? 'BFO' : 'NFO';

/** The paper F&O book holds equity derivatives only — NSE (NFO) and BSE (BFO). */
export const isPaperExchange = (exchange: string | null | undefined): exchange is PaperExchange =>
  exchange === 'NFO' || exchange === 'BFO';

/**
 * From a live F&O search result or chain contract (Groww's master — tick and freeze known).
 * Null for a commodity contract (MCX / NCO): those are read-only in this app and have no paper
 * book, so one is never quietly re-labelled as an NSE contract.
 */
export function paperContractOfFno(c: FnoContract): PaperContract | null {
  if (!isPaperExchange(c.exchange)) return null;
  return {
    exchange: c.exchange,
    tradingsymbol: c.tradingSymbol,
    underlying: c.underlying,
    kind: c.kind,
    strike: c.kind === 'FUT' ? null : c.strike,
    expiry: c.expiry,
    lotSize: c.lotSize,
    tickSize: c.tickSize,
    freezeQuantity: c.freezeQuantity,
  };
}

/** From a book row (position or order). A future's strike is stored as 0 there — null here. */
export function paperContractOfRow(
  r: Pick<
    FnoPositionView,
    'exchange' | 'tradingsymbol' | 'underlying' | 'kind' | 'strike' | 'expiry' | 'lotSize'
  >,
): PaperContract {
  return {
    exchange: paperExchange(r.exchange),
    tradingsymbol: r.tradingsymbol,
    underlying: r.underlying,
    kind: r.kind,
    strike: r.kind === 'FUT' || !(r.strike > 0) ? null : r.strike,
    expiry: r.expiry,
    lotSize: r.lotSize,
    tickSize: null,
    freezeQuantity: null,
  };
}

/** The instrument key a contract streams under ('NFO:NIFTY26O0625000CE'). */
export const streamKey = (exchange: string, tradingsymbol: string) =>
  `${exchange.toUpperCase()}:${tradingsymbol.toUpperCase()}`;

/* ── Live marks ──────────────────────────────────────────────────────────────────────── */

/** A position's unrealised P&L at a (streamed) price: direction × (price − entry) × units.
 *  Null without a price — unknown, never zero. */
export function livePositionPnl(
  p: Pick<FnoPositionView, 'lots' | 'lotSize' | 'avgPrice'>,
  ltp: number | null | undefined,
): number | null {
  if (ltp == null || !Number.isFinite(ltp)) return null;
  const units = Math.abs(p.lots) * p.lotSize;
  return Math.round(Math.sign(p.lots) * (ltp - p.avgPrice) * units * 100) / 100;
}

/** P&L as a percent of the money at work: the premium for a long option, the margin for a
 *  future or a written option. Null with no base. */
export function livePnlPct(
  pnl: number | null,
  p: Pick<FnoPositionView, 'lots' | 'lotSize' | 'avgPrice' | 'kind' | 'marginBlocked'>,
): number | null {
  if (pnl == null) return null;
  const longOption = p.kind !== 'FUT' && p.lots > 0;
  const base = longOption ? p.avgPrice * Math.abs(p.lots) * p.lotSize : p.marginBlocked;
  return base > 0 ? Math.round((pnl / base) * 10000) / 100 : null;
}

/** The book marked at live prices: Σ unrealised over the priced positions, and how many had no
 *  price (so a partial total is never presented as complete). */
export function liveBook<T extends Pick<FnoPositionView, 'lots' | 'lotSize' | 'avgPrice'>>(
  positions: readonly T[],
  priceOf: (p: T) => number | null,
): { unrealised: number; unpriced: number; priced: number } {
  let unrealised = 0;
  let unpriced = 0;
  for (const p of positions) {
    const pnl = livePositionPnl(p, priceOf(p));
    if (pnl == null) unpriced++;
    else unrealised += pnl;
  }
  return {
    unrealised: Math.round(unrealised * 100) / 100,
    unpriced,
    priced: positions.length - unpriced,
  };
}

/** The order that closes a position: the opposite side, all of its lots. */
export function exitOrderFor(p: Pick<FnoPositionView, 'lots'>): {
  side: 'BUY' | 'SELL';
  lots: number;
} {
  return { side: p.lots > 0 ? 'SELL' : 'BUY', lots: Math.abs(p.lots) };
}

/* ── Ticket inputs ───────────────────────────────────────────────────────────────────── */

/**
 * What the lots box holds. Keeps an EMPTY box empty (null) instead of snapping it back to 1 the
 * moment it is cleared — "clear, type 3" must read 3, not 13.
 */
export function parseLots(text: string): number | null {
  const digits = text.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** The sandbox's own per-order cap (server paper-fno-order-rules.ts MAX_LOTS_PER_ORDER). */
export const MAX_LOTS_PER_ORDER = PAPER_MAX_LOTS;

/** The most lots one order may carry: the exchange freeze quantity (limit + 1 in the master)
 *  in whole lots, never above the sandbox cap — the server's own rule, so the stepper stops
 *  where the server would refuse. */
export function maxLotsFor(lotSize: number, freezeQuantity: number | null | undefined): number {
  if (!(lotSize > 0)) return 0;
  const byFreeze =
    freezeQuantity != null && freezeQuantity > 1
      ? Math.floor((freezeQuantity - 1) / lotSize)
      : Infinity;
  return Math.max(0, Math.min(MAX_LOTS_PER_ORDER, byFreeze));
}

const tickPaise = (tick: number | null | undefined) =>
  Math.round((tick != null && tick > 0 ? tick : 0.05) * 100);

/** A price snapped to the nearest tick (integer paise, so ₹0.05 steps are exact). */
export function snapToTick(price: number, tick: number | null | undefined): number {
  const t = tickPaise(tick);
  return Math.max(t, Math.round(Math.round(price * 100) / t) * t) / 100;
}

/** One tick up or down, landing ON the tick grid; a price off the grid snaps to the nearest
 *  grid line in the direction asked. */
export function stepPrice(price: number, tick: number | null | undefined, dir: 1 | -1): number {
  const t = tickPaise(tick);
  const p = Math.round(price * 100);
  const onGrid = p % t === 0;
  const next =
    dir > 0 ? (onGrid ? p + t : Math.ceil(p / t) * t) : onGrid ? p - t : Math.floor(p / t) * t;
  return Math.max(t, next) / 100;
}

/** On the tick grid (the server refuses a limit that is not). Unknown tick = accepted. */
export function onTick(price: number, tick: number | null | undefined): boolean {
  if (tick == null || !(tick > 0)) return true;
  const t = Math.round(tick * 100);
  return t <= 0 || Math.round(price * 100) % t === 0;
}

/* ── The preview ─────────────────────────────────────────────────────────────────────── */

/** The inputs an estimate answers, as one comparable string — so the screen can tell the
 *  estimate for what is typed now from the previous one still on screen. */
export function inputSignature(
  i: Pick<PlacePaperFnoOrderInput, 'side' | 'lots' | 'type' | 'limitPrice'> | null,
): string {
  if (!i) return '';
  const type = i.type ?? 'MARKET';
  return `${i.side}|${i.lots}|${type}|${type === 'LIMIT' ? (i.limitPrice ?? '') : ''}`;
}

export function previewSignature(
  p: Pick<FnoOrderPreview, 'side' | 'lots' | 'type' | 'limitPrice'>,
): string {
  return `${p.side}|${p.lots}|${p.type}|${p.type === 'LIMIT' ? (p.limitPrice ?? '') : ''}`;
}

/**
 * The commit button states the whole action, so the last thing read before the tap is what is
 * about to happen: "Buy 2 lots · ₹18,045.20", "Sell 1 lot · receive ₹9,112.40",
 * "Place limit buy · 2 lots · holds ₹7,600.00", "Place after-market buy · 1 lot".
 * `estimate` is the ticket's own figure, used only when there is no server preview.
 */
export function commitLabel(o: {
  side: 'BUY' | 'SELL';
  lots: number | null;
  pending: boolean;
  outcome: FnoPreviewOutcome | null;
  cashDelta: number | null;
  reservedAmount: number;
  estimate?: number | null;
}): string {
  if (o.pending) return 'Placing…';
  if (!o.lots || o.lots < 1) return 'Enter lots';
  const verb = o.side === 'BUY' ? 'Buy' : 'Sell';
  const lots = `${o.lots} lot${o.lots === 1 ? '' : 's'}`;
  if (o.outcome === 'after-hours') return `Place after-market ${verb.toLowerCase()} · ${lots}`;
  if (o.outcome === 'rest') {
    const holds = o.reservedAmount > 0 ? ` · holds ${formatINR(o.reservedAmount)}` : '';
    return `Place limit ${verb.toLowerCase()} · ${lots}${holds}`;
  }
  if (o.outcome === 'fill' && o.cashDelta != null) {
    return o.cashDelta < 0
      ? `${verb} ${lots} · ${formatINR(-o.cashDelta)}`
      : `${verb} ${lots} · receive ${formatINR(o.cashDelta)}`;
  }
  if (o.outcome == null && o.estimate != null) return `${verb} ${lots} · ${formatINR(o.estimate)}`;
  return `${verb} ${lots}`;
}

/** What placing the order now would do, in plain words — the line above the button. */
export function outcomeWords(
  pv: Pick<FnoOrderPreview, 'outcome' | 'basisPrice' | 'price' | 'limitPrice' | 'blockedReason'>,
): { text: string; tone: 'success' | 'info' | 'warning' | 'danger' } {
  switch (pv.outcome) {
    case 'fill': {
      const at = pv.basisPrice ?? pv.price?.ltp ?? null;
      return {
        text: `Fills now${at != null ? ` at about ${formatINR(at)}` : ''}.`,
        tone: 'success',
      };
    }
    case 'rest':
      return {
        text: `Rests as an open order until the price reaches ${formatINR(pv.limitPrice)}.`,
        tone: 'info',
      };
    case 'after-hours':
      return {
        text: 'After-market order — fills at the first price after the market opens at 09:15 IST.',
        tone: 'info',
      };
    case 'rejected':
      return { text: pv.blockedReason ?? 'This order would be rejected.', tone: 'danger' };
    default:
      return { text: pv.blockedReason ?? 'This order cannot be placed as it is.', tone: 'warning' };
  }
}

/**
 * The value line. An after-market MARKET order is SIZED at the last price + 10% (it can gap at
 * the open) but expected near the last price — so the value is shown at the last price, marked
 * approximate, and the sizing is what it holds.
 */
export function estimateValue(
  pv: Pick<
    FnoOrderPreview,
    'outcome' | 'type' | 'price' | 'basisPrice' | 'orderValue' | 'quantity'
  >,
): { atPrice: number | null; value: number | null; approximate: boolean } {
  const amo = pv.outcome === 'after-hours' && pv.type === 'MARKET';
  if (amo) {
    const at = pv.price?.ltp ?? null;
    return {
      atPrice: at,
      value: at != null ? Math.round(at * pv.quantity * 100) / 100 : null,
      approximate: true,
    };
  }
  return { atPrice: pv.basisPrice, value: pv.orderValue, approximate: false };
}

/**
 * Max loss in words. The server gives a number only for an opening long option (premium +
 * charges); a future or a written call is UNLIMITED — a word, never a number — and a written put
 * loses down to the underlying reaching zero.
 */
export function maxLossLabel(
  pv: Pick<FnoOrderPreview, 'maxLoss' | 'openingLots' | 'basisPrice' | 'contract'>,
  side: 'BUY' | 'SELL',
): string | null {
  if (pv.maxLoss != null) return formatINR(pv.maxLoss);
  if (!(pv.openingLots > 0)) return null;
  const { kind, strike, lotSize } = pv.contract;
  if (kind === 'FUT' || (kind === 'CE' && side === 'SELL')) return 'Unlimited';
  if (kind === 'PE' && side === 'SELL' && pv.basisPrice != null && strike != null) {
    const worst = Math.max(0, strike - pv.basisPrice) * pv.openingLots * lotSize;
    return `${formatINR(worst)} if it goes to zero`;
  }
  return null;
}

/** The risk of the order in one sentence, by kind and side. */
export function riskSentence(kind: DerivativeKind, side: 'BUY' | 'SELL'): string {
  if (kind === 'FUT') {
    return 'A future moves rupee for rupee with the underlying, for you or against you — losses are not capped at the margin.';
  }
  if (side === 'BUY')
    return 'Buying an option pays the premium, and the premium is the most it can lose.';
  return kind === 'CE'
    ? 'Writing a call collects the premium and blocks margin — its loss is unlimited if the underlying rises.'
    : 'Writing a put collects the premium and blocks margin — it loses all the way down to the underlying reaching zero.';
}

/* ── Price sources ───────────────────────────────────────────────────────────────────── */

const PRICE_SOURCE_WORD: Record<string, string> = {
  stream: 'live stream',
  groww: 'Groww',
  platform: 'platform feed',
  settlement: 'expiry close',
};

/** 'stream' → "live stream", 'groww' → "Groww"; unknown sources read as themselves. */
export const priceSourceWord = (s: string | null | undefined): string =>
  s ? (PRICE_SOURCE_WORD[s] ?? s) : '—';

/** How old a timestamp is: "just now", "12s ago", "3 min ago", "earlier". Empty when unknown. */
export function ageWords(iso: string | null | undefined, now: number): string {
  if (!iso) return '';
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return '';
  const age = Math.max(0, Math.round((now - at) / 1000));
  if (age < 2) return 'just now';
  if (age < 60) return `${age}s ago`;
  if (age < 3600) return `${Math.round(age / 60)} min ago`;
  return 'earlier';
}

/** A position's LTP provenance, for the row: "live", "Groww · 12s ago", "no price". */
export function ltpProvenance(
  p: Pick<FnoPositionView, 'ltp' | 'ltpSource' | 'ltpAsOf'>,
  streamed: boolean,
  now: number,
): string {
  if (streamed) return 'live';
  if (p.ltp == null) return 'no price';
  if (!p.ltpSource) return 'last price';
  const age = ageWords(p.ltpAsOf, now);
  return age ? `${priceSourceWord(p.ltpSource)} · ${age}` : priceSourceWord(p.ltpSource);
}

/* ── Orders ──────────────────────────────────────────────────────────────────────────── */

export type OrderTone = 'success' | 'warning' | 'danger' | 'neutral' | 'primary';

/** An order's state in a word and a tone. A resting after-market order reads as such. */
export function orderStatusView(o: Pick<FnoOrderView, 'status' | 'afterHours' | 'settlement'>): {
  label: string;
  tone: OrderTone;
} {
  const status: FnoOrderStatus = o.status;
  if (status === 'FILLED') return { label: o.settlement ? 'Settled' : 'Filled', tone: 'success' };
  if (status === 'PENDING') {
    return o.afterHours
      ? { label: 'After-market', tone: 'primary' }
      : { label: 'Open', tone: 'warning' };
  }
  if (status === 'REJECTED') return { label: 'Rejected', tone: 'danger' };
  return { label: 'Cancelled', tone: 'neutral' };
}

/** The receipt line for a placed order, in the server's own terms. */
export function receiptWords(
  o: Pick<
    FnoOrderView,
    | 'status'
    | 'afterHours'
    | 'settlement'
    | 'quantity'
    | 'price'
    | 'priceSource'
    | 'cashDelta'
    | 'realisedPnl'
    | 'limitPrice'
    | 'reservedAmount'
    | 'note'
  >,
): { title: string; detail: string | null } {
  if (o.status === 'FILLED') {
    const parts = [`${o.quantity.toLocaleString('en-IN')} qty at ${formatINR(o.price)}`];
    if (o.priceSource) parts.push(priceSourceWord(o.priceSource));
    if (o.cashDelta != null) parts.push(`cash ${formatSignedINR(o.cashDelta)}`);
    if (o.realisedPnl != null) parts.push(`booked ${formatSignedINR(o.realisedPnl)}`);
    return {
      title: o.settlement ? 'Settled' : 'Filled in your paper book',
      detail: parts.join(' · '),
    };
  }
  if (o.status === 'PENDING') {
    const held =
      (o.reservedAmount ?? 0) > 0 ? `${formatINR(o.reservedAmount)} held until it fills.` : '';
    return o.afterHours
      ? {
          title: 'After-market order placed — fills when the market opens',
          detail: held || null,
        }
      : {
          title: `Resting at your limit${o.limitPrice != null ? ` of ${formatINR(o.limitPrice)}` : ''}`,
          detail: held || null,
        };
  }
  if (o.status === 'CANCELLED') return { title: 'Order cancelled', detail: o.note };
  return { title: 'Rejected', detail: o.note ?? 'The server gave no reason.' };
}

/* ── The session ─────────────────────────────────────────────────────────────────────── */

const IST_OFFSET_MS = 330 * 60_000;
const OPEN_MIN = 9 * 60 + 15;
const CLOSE_MIN = 15 * 60 + 30;
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** The server's own session rule (fnoSessionOpen): weekdays, 09:15–15:30 IST inclusive. */
export function sessionOpenAt(now: number): boolean {
  const ist = new Date(now + IST_OFFSET_MS);
  const day = ist.getUTCDay();
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return day >= 1 && day <= 5 && minutes >= OPEN_MIN && minutes <= CLOSE_MIN;
}

/** When the session next opens, in words: "today 09:15", "tomorrow 09:15", "Mon 09:15".
 *  Exchange holidays are not known here — the server stays the authority. */
export function nextOpenWords(now: number): string {
  const ist = new Date(now + IST_OFFSET_MS);
  const minutes = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  let day = ist.getUTCDay();
  let ahead = 0;
  if (!(day >= 1 && day <= 5 && minutes < OPEN_MIN)) {
    do {
      ahead++;
      day = (day + 1) % 7;
    } while (day === 0 || day === 6);
  }
  const when = ahead === 0 ? 'today' : ahead === 1 ? 'tomorrow' : WEEKDAY[day];
  return `${when} 09:15`;
}

/** The market-state line: the server's `sessionOpen` when it said, else the clock. */
export function marketStateWords(
  sessionOpen: boolean | null | undefined,
  now: number,
): { open: boolean; text: string } {
  const open = sessionOpen ?? sessionOpenAt(now);
  return open
    ? { open, text: 'Market open · till 15:30 IST' }
    : { open, text: `Market closed · opens ${nextOpenWords(now)} IST` };
}

/* ── The account ─────────────────────────────────────────────────────────────────────── */

/** The F&O paper account's headline figures — unknown is null, never zero. */
export interface FnoAccountView {
  /** cash − reserved: what a new order may draw on. */
  available: number | null;
  cash: number | null;
  /** Held back by resting orders. */
  reserved: number | null;
  /** Resting orders holding it; null when the server did not say (older server). */
  pendingOrders: number | null;
  startingCapital: number | null;
  marginBlocked: number | null;
  /** Open P&L at live prices over the priced positions. */
  unrealised: number | null;
  /** Positions with no price — left out of `unrealised`, so it is visibly partial. */
  unpriced: number;
  realised: number | null;
  charges: number | null;
  /** Realised − charges + open, live. */
  totalPnl: number | null;
}

/**
 * The account card's figures: the book's own `funds` (one request, current with the book) and,
 * on an older server without them, the wallet endpoint's equivalents.
 */
export function fnoAccountView(
  book: Pick<FnoBook, 'positions' | 'totals' | 'funds'> | undefined,
  wallet: Pick<FnoWallet, 'capital' | 'cash' | 'availableCash' | 'blockedCash'> | undefined,
  live: { unrealised: number; unpriced: number } | null,
): FnoAccountView {
  const funds = book?.funds ?? null;
  const t = book?.totals;
  const unrealised = book
    ? book.positions.length === 0
      ? 0
      : (live?.unrealised ?? t?.unrealisedPnl ?? null)
    : null;
  const realised = t ? t.realisedPnl : null;
  const charges = t ? t.totalCharges : null;
  return {
    available: funds?.available ?? wallet?.availableCash ?? null,
    cash: funds?.cash ?? wallet?.cash ?? null,
    reserved: funds?.reserved ?? wallet?.blockedCash ?? null,
    pendingOrders: funds?.pendingOrders ?? null,
    startingCapital: funds?.startingCapital ?? wallet?.capital ?? null,
    marginBlocked: t ? t.marginBlocked : null,
    unrealised,
    unpriced: live?.unpriced ?? 0,
    realised,
    charges,
    totalPnl:
      realised != null && charges != null && unrealised != null
        ? Math.round((realised - charges + unrealised) * 100) / 100
        : null,
  };
}

/* ── Search ──────────────────────────────────────────────────────────────────────────── */

/** An F&O search hit, with what a row shows. */
export type FnoSearchHit =
  { type: 'underlying'; underlying: FnoUnderlying } | { type: 'contract'; contract: FnoContract };

/**
 * F&O hits for a query: underlyings filtered locally from the cached universe (prefix matches
 * first, indices first within each), then the server's contract matches. Capped, so the F&O
 * group never buries the stock results above it.
 */
export function fnoSearchHits(
  universe: readonly FnoUnderlying[],
  contracts: readonly FnoContract[] | undefined,
  query: string,
  limits: { underlyings: number; contracts: number } = { underlyings: 3, contracts: 6 },
): FnoSearchHit[] {
  if (!query.trim()) return [];
  // The server's own ranking (fno-search.rules.ts): "bank nifty", "fin nifty", "index" all work.
  const underlyings = rankUnderlyings(universe, query, limits.underlyings).map((underlying) => ({
    type: 'underlying' as const,
    underlying,
  }));
  const picked = (contracts ?? [])
    .slice(0, limits.contracts)
    .map((contract) => ({ type: 'contract' as const, contract }));
  return [...underlyings, ...picked];
}

/** A hit's row: title, the line under it, a tag, and its lot. */
export function fnoHitView(hit: FnoSearchHit): {
  key: string;
  title: string;
  sub: string;
  tag: string;
  lot: number | null;
} {
  if (hit.type === 'underlying') {
    const u = hit.underlying;
    return {
      key: `u:${u.exchange}:${u.underlying}`,
      title: u.underlying,
      sub: `${u.isIndex ? 'Index' : 'Stock'} · ${u.exchange === 'BFO' ? 'BSE' : 'NSE'} · option chain`,
      tag: 'F&O',
      lot: u.lotSize,
    };
  }
  const c = hit.contract;
  const title =
    c.kind === 'FUT'
      ? `${c.underlying} FUT`
      : `${c.underlying} ${c.strike != null ? c.strike.toLocaleString('en-IN') : ''} ${c.kind}`
          .replace(/\s+/g, ' ')
          .trim();
  return {
    key: `c:${c.exchange}:${c.tradingSymbol}`,
    title,
    sub: `${expiryWords(c.expiry)} expiry · ${c.tradingSymbol}`,
    tag: c.kind,
    lot: c.lotSize,
  };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27 Oct" for a YYYY-MM-DD expiry; the raw text when it is not one. */
export function expiryWords(expiry: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${Number(m[3])} ${month}` : expiry;
}
