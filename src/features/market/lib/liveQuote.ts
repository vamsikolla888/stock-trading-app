/**
 * Live prices — the pure half. The socket store (services/realtime/priceStream.ts) turns wire
 * ticks into LiveQuotes with `toLiveQuote`; screens lay a quote over their REST row with
 * `overlayQuote`. Kept free of React and the socket so every rule here is pinned by tests.
 *
 * Ported from the web client (shared/realtime/useLivePrices.ts, liveChange.ts) so both apps say
 * the same thing about the same stock at the same moment.
 */

/** A `price:update` / `prices:batch` tick — the server's TickPayload (realtime/tickBus.ts). */
export interface LiveTick {
  exchange: string;
  symbol: string;
  ltp: number;
  /**
   * NULL, never a fabricated zero, when the broker's tick had no Change field. The broker sends
   * `Change: 0` on every tick for some accounts, so the move is MEASURED against the previous
   * close (see overlayQuote) and this is only a last resort.
   */
  change: number | null;
  changePct: number | null;
  /** The previous close the server measured `change` against. */
  prevClose: number | null;
  direction: 'up' | 'down' | null;
  volume: number | null;
  ohlc: { open: number; high: number; low: number; close: number } | null;
}

/** What a screen reads for one symbol. */
export interface LiveQuote {
  ltp: number;
  prevClose: number | null;
  /** The tick's own move — used only when no previous close can be found. */
  changePct: number | null;
  volume: number | null;
  ohlc: LiveTick['ohlc'];
  /** Which way the price moved on its LAST change — what a cell's flash shows. */
  dir: 'up' | 'down' | null;
  /** Counts price changes; a flash keys on it so two moves the same way each replay. */
  seq: number;
  /** Receipt time, epoch ms. */
  at: number;
}

/** `NSE:RELIANCE` — exchange-qualified, as the server's rooms are: NSE:X and BSE:X differ. */
export function liveKey(exchange: string | null | undefined, symbol: string): string {
  return `${(exchange || 'NSE').toUpperCase()}:${symbol.toUpperCase()}`;
}

/** Inverse of liveKey; splits on the FIRST colon, so a symbol containing one stays whole. */
export function splitLiveKey(key: string): { exchange: string; symbol: string } {
  const at = key.indexOf(':');
  return at === -1
    ? { exchange: 'NSE', symbol: key }
    : { exchange: key.slice(0, at), symbol: key.slice(at + 1) };
}

const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A tick folded onto the previous quote. Returns `prev` itself when nothing a screen shows
 * changed, so subscribers are not woken for a duplicate. Null for a tick with no usable price.
 */
export function toLiveQuote(
  prev: LiveQuote | undefined,
  tick: LiveTick,
  now: number,
): LiveQuote | null {
  if (!positive(tick.ltp)) return null;
  const volume = finite(tick.volume) ? tick.volume : (prev?.volume ?? null);
  if (prev && prev.ltp === tick.ltp && prev.volume === volume) return prev;
  const moved = prev != null && prev.ltp !== tick.ltp;
  return {
    ltp: tick.ltp,
    prevClose: positive(tick.prevClose) ? tick.prevClose : (prev?.prevClose ?? null),
    changePct: finite(tick.changePct) ? tick.changePct : (prev?.changePct ?? null),
    volume,
    ohlc: tick.ohlc ?? prev?.ohlc ?? null,
    dir: moved ? (tick.ltp > prev.ltp ? 'up' : 'down') : (prev?.dir ?? null),
    seq: (prev?.seq ?? 0) + (moved || !prev ? 1 : 0),
    at: now,
  };
}

/** Today's move from a price and the previous close it is measured against; null unless both usable. */
export function changePctFrom(
  price: number | null | undefined,
  prevClose: number | null | undefined,
): number | null {
  if (!positive(price) || !positive(prevClose)) return null;
  return ((price - prevClose) / prevClose) * 100;
}

/** The previous close a REST row implies: from its own move in rupees, else in percent. */
export function impliedPrevClose(
  price: number | null | undefined,
  changeAbs: number | null | undefined,
  changePct: number | null | undefined,
): number | null {
  if (!positive(price)) return null;
  if (finite(changeAbs)) {
    const prev = price - changeAbs;
    if (prev > 0) return prev;
  }
  if (finite(changePct) && changePct > -100) {
    const prev = price / (1 + changePct / 100);
    if (prev > 0) return prev;
  }
  return null;
}

/** A REST row as a screen already has it. */
export interface QuoteBase {
  price: number | null | undefined;
  prevClose?: number | null;
  changeAbs?: number | null;
  changePct?: number | null;
}

export interface QuoteView {
  price: number | null;
  change: number | null;
  changePct: number | null;
  /** True when `price` came from the live feed rather than the REST row. */
  live: boolean;
}

/**
 * The price and move a row shows: the live tick over the REST baseline, and the move MEASURED
 * from that price against the most trustworthy previous close — the row's own (stocks_snapshot's
 * documented previous close), else what the row implies, else the tick's — so the percentage
 * always describes the price beside it. Only with no previous close anywhere does a
 * precomputed percentage (the tick's, then the row's) stand in. Null means unknown, never 0 %.
 */
export function overlayQuote(base: QuoteBase, live: LiveQuote | undefined): QuoteView {
  const restPrice = positive(base.price) ? base.price : null;
  const price = live?.ltp ?? restPrice;
  const prevClose =
    (positive(base.prevClose) ? base.prevClose : null) ??
    impliedPrevClose(restPrice, base.changeAbs, base.changePct) ??
    live?.prevClose ??
    null;
  const measured = changePctFrom(price, prevClose);
  if (measured !== null && price !== null && prevClose !== null) {
    return { price, change: price - prevClose, changePct: measured, live: live != null };
  }
  if (live) {
    return { price: live.ltp, change: null, changePct: live.changePct, live: true };
  }
  return {
    price: restPrice,
    change: finite(base.changeAbs) ? base.changeAbs : null,
    changePct: finite(base.changePct) ? base.changePct : null,
    live: false,
  };
}
