import { AppState } from 'react-native';
import { io } from 'socket.io-client';

import { env } from '@/config/env';
import {
  liveKey,
  splitLiveKey,
  toLiveQuote,
  type LiveQuote,
  type LiveTick,
} from '@/features/market/lib/liveQuote';
import { getValidAccessToken } from '@/services/api/client';

/**
 * Live equity prices over the server's Socket.IO feed (server/src/realtime/socket.ts), for every
 * screen at once.
 *
 * THREE WAYS TO WATCH, matching the server's three feeds:
 *   - 'list'   rows of a list. All of them, app-wide, form ONE `watch:batch` subscription: the
 *              server coalesces their ticks into a single `prices:batch` frame every 300 ms, so
 *              thirty rows cost one message and one render, not thirty.
 *   - 'stream' a screen about one instrument (stock page, chart, order ticket): `watch:symbol` in
 *              stream mode — every tick, unthrottled, and the last known price replayed at once.
 *   - 'fno'    F&O contracts and their underlyings (the live option chain, F&O positions): ONE
 *              app-wide `fno:watch`, fed from the viewer's Groww session (fno-stream.service.ts),
 *              changed-only ticks. Same `EXCHANGE:SYMBOL` keys, same store.
 *
 * ONE STORE, PER-SYMBOL READS. Quotes live here, not in React state or the query cache: a tick for
 * RELIANCE wakes only what reads RELIANCE (useSyncExternalStore per key), and a burst of ticks is
 * delivered in one pass per frame.
 *
 * LIFECYCLE. The connection exists only while something is watched and the app is in the
 * foreground: it opens with the first watch, closes 10 s after the last (quick tab switches do
 * not churn it), drops when the app is backgrounded, and on every (re)connect the server's
 * per-socket state is rebuilt from this registry. Socket.IO multiplexes this namespace over the
 * same WebSocket as the index feed (indicesSocket.ts), so it costs no extra connection.
 *
 * Ticks come from the VIEWER's own broker sessions: equities from their mStock ticker
 * (`watch:symbol` / `watch:batch`), F&O and — for a detail screen — the same stock again from
 * their Groww live feed (`fno:watch`, which carries NSE/BSE cash listings too). Without either,
 * nothing arrives and every screen keeps its REST price, polled as before — which is why nothing
 * here is ever an error state.
 *
 * TWO FEEDS, ONE PRICE. A detail screen's stock is watched on both feeds so it streams whichever
 * broker the viewer has connected. Interleaving two feeds would make the price stutter between
 * two slightly different prints, so each symbol is OWNED by the feed that last delivered it and
 * the other feed's ticks are ignored until the owner has been silent for SOURCE_HOLD_MS. A
 * platform-sourced F&O frame (the server's snapshot fallback, not a broker feed) never stands in
 * for a stock's live price — only for the F&O instruments a screen asked the F&O feed for.
 */

export type WatchMode = 'list' | 'stream' | 'fno';
export type StreamStatus = 'idle' | 'connecting' | 'live' | 'offline';
/** Which feed a tick came from: the broker ticker (mStock) or the F&O feed (Groww). */
export type TickOrigin = 'broker' | 'fno';

/** The F&O feed's own heartbeat (`fno:status`) and the source of its latest frame. */
export interface FeedStatus {
  state: 'live' | 'degraded' | 'closed';
  /** 'groww' = the viewer's Groww session; 'platform' = the server's fallback data. */
  source: 'groww' | 'platform' | null;
  /** 'stream' = pushed from Groww's live feed as trades print; 'poll' = its last-price API. */
  transport: 'stream' | 'poll' | null;
  note: string | null;
  /** The server's cadence for this feed; no frame for 3× this means stale. */
  intervalMs: number;
  /** When this device last heard from the feed. */
  at: number;
}

/** The server's per-batch ceiling (MAX_BATCH_SYMBOLS); beyond it rows keep their REST price. */
export const MAX_BATCH_SYMBOLS = 60;
/** The server's per-user F&O ceiling (fno-stream.service.ts MAX_INSTRUMENTS_PER_USER). */
export const MAX_FNO_INSTRUMENTS = 600;
const BATCH_KEY = 'app';
const FNO_KEY = 'app';
/** A list mounting thirty rows sends one batch, not thirty. */
const BATCH_DEBOUNCE_MS = 120;
const IDLE_DISCONNECT_MS = 10_000;
/** An unwatched quote is kept this long, so coming back to a screen paints it at once. */
const QUOTE_RETAIN_MS = 30_000;
const RETRY_START_MS = 1_000;
const RETRY_MAX_MS = 30_000;
/** A symbol's feed keeps it this long after its last tick before the other feed may take over. */
export const SOURCE_HOLD_MS = 5_000;
/** The server's instrument grammar (fno-stream.service.ts INSTRUMENT_RE): anything else is dropped. */
const FNO_INSTRUMENT_RE = /^(NFO|BFO|NSE|BSE|MCX|NCO):[A-Z0-9&_-]{1,40}$/;
/** Cash listings Groww's feed carries — a detail screen's stock rides it too. */
const isCashKey = (key: string) => key.startsWith('NSE:') || key.startsWith('BSE:');

/** The part of a Socket.IO client this store uses — narrow, so tests can fake it. */
export interface StreamSocket {
  readonly connected: boolean;
  readonly active: boolean;
  connect(): unknown;
  disconnect(): unknown;
  emit(event: string, payload?: unknown): unknown;
  on(event: string, listener: (...args: never[]) => void): unknown;
  removeAllListeners(): unknown;
}

export interface PriceStreamDeps {
  createSocket: () => StreamSocket;
  now: () => number;
  /** Runs `fn` before the next frame. */
  frame: (fn: () => void) => void;
}

type Listener = () => void;

/** An `fno:ticks` entry: instrument key, price, and (when the feed has them) close, OI, volume. */
interface FnoWireTick {
  i: string;
  ltp: number;
  c?: number;
  oi?: number;
  v?: number;
}

/** F&O ticks carry no move of their own; it is measured against the close when there is one. */
export function fromFnoTick(tick: FnoWireTick): LiveTick {
  const { exchange, symbol } = splitLiveKey(String(tick?.i ?? ''));
  const ltp = tick?.ltp;
  const prevClose = typeof tick?.c === 'number' && tick.c > 0 ? tick.c : null;
  const measurable = prevClose != null && typeof ltp === 'number' && Number.isFinite(ltp);
  return {
    exchange,
    symbol,
    ltp,
    change: measurable ? ltp - prevClose : null,
    changePct: measurable ? ((ltp - prevClose) / prevClose) * 100 : null,
    prevClose,
    direction: null,
    volume: typeof tick?.v === 'number' ? tick.v : null,
    ohlc: null,
  };
}

const positiveNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

/** An `fno:status` / `fno:ticks` frame's feed fields, or null when it carries none. */
function feedFields(
  frame: unknown,
): Partial<Pick<FeedStatus, 'state' | 'source' | 'transport' | 'note' | 'intervalMs'>> {
  if (!frame || typeof frame !== 'object') return {};
  const f = frame as Record<string, unknown>;
  const out: Partial<Pick<FeedStatus, 'state' | 'source' | 'transport' | 'note' | 'intervalMs'>> =
    {};
  if (f.state === 'live' || f.state === 'degraded' || f.state === 'closed') out.state = f.state;
  if (f.source === 'groww' || f.source === 'platform') out.source = f.source;
  if (f.transport === 'stream' || f.transport === 'poll') out.transport = f.transport;
  if (typeof f.note === 'string' || f.note === null) out.note = (f.note as string | null) || null;
  if (typeof f.intervalMs === 'number' && f.intervalMs > 0) out.intervalMs = f.intervalMs;
  return out;
}

export class PriceStream {
  private socket: StreamSocket | null = null;
  private readonly refs: Record<WatchMode, Map<string, number>> = {
    list: new Map(),
    stream: new Map(),
    fno: new Map(),
  };
  private readonly quotes = new Map<string, LiveQuote>();
  /** Which feed owns each symbol, and when it last delivered (any tick, changed or not). */
  private readonly owners = new Map<string, { origin: TickOrigin; at: number }>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly statusListeners = new Set<Listener>();
  private feed: FeedStatus | null = null;
  private readonly feedListeners = new Set<Listener>();
  private readonly dirty = new Set<string>();
  private readonly evictTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private frameQueued = false;
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = RETRY_START_MS;
  /** The sets the SERVER holds for this socket ('' = none), so only real changes are sent. */
  private sentBatch = '';
  private sentFno = '';
  private foreground = true;
  private status: StreamStatus = 'idle';

  constructor(private readonly deps: PriceStreamDeps) {}

  /* ── Watching ────────────────────────────────────────────────────────────────────── */

  /** Starts watching `key` (liveKey); returns the release. Reference-counted per mode. */
  retain(key: string, mode: WatchMode): () => void {
    const map = this.refs[mode];
    const count = (map.get(key) ?? 0) + 1;
    map.set(key, count);
    this.cancelEvict(key);
    if (count === 1) this.watchAdded(key, mode);
    this.ensureConnection();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.release(key, mode);
    };
  }

  private release(key: string, mode: WatchMode): void {
    const map = this.refs[mode];
    const count = (map.get(key) ?? 0) - 1;
    if (count > 0) {
      map.set(key, count);
      return;
    }
    if (!map.delete(key)) return;
    this.watchRemoved(key, mode);
    if (!this.isWatched(key)) this.scheduleEvict(key);
    if (this.totalRefs() === 0) this.scheduleIdleDisconnect();
  }

  private watchAdded(key: string, mode: WatchMode): void {
    if (mode === 'stream') this.emitSymbol('watch:symbol', key);
    // The sets may change either way: a streamed key leaves the batch (one feed per symbol).
    this.scheduleBatchSync();
  }

  private watchRemoved(key: string, mode: WatchMode): void {
    if (mode === 'stream') this.emitSymbol('unwatch:symbol', key);
    this.scheduleBatchSync();
  }

  private emitSymbol(event: 'watch:symbol' | 'unwatch:symbol', key: string): void {
    if (!this.socket?.connected) return;
    const { exchange, symbol } = splitLiveKey(key);
    this.socket.emit(event, { exchange, symbol, mode: 'stream' });
  }

  /** The list keys the batch carries: not streamed already, the first N in watch order. */
  batchTargets(): string[] {
    const out: string[] = [];
    for (const key of this.refs.list.keys()) {
      if (this.refs.stream.has(key)) continue;
      out.push(key);
      if (out.length >= MAX_BATCH_SYMBOLS) break;
    }
    return out;
  }

  /**
   * The instruments the app-wide `fno:watch` carries: what F&O screens asked for, in watch order,
   * then each detail screen's stock (an NSE/BSE listing), so it streams from Groww's feed for a
   * viewer whose mStock ticker isn't live.
   */
  fnoTargets(): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const add = (key: string) => {
      if (seen.has(key) || !FNO_INSTRUMENT_RE.test(key)) return;
      seen.add(key);
      out.push(key);
    };
    for (const key of this.refs.fno.keys()) add(key);
    for (const key of this.refs.stream.keys()) if (isCashKey(key)) add(key);
    return out.slice(0, MAX_FNO_INSTRUMENTS);
  }

  private scheduleBatchSync(): void {
    if (this.batchTimer) return;
    this.batchTimer = setTimeout(() => {
      this.batchTimer = null;
      this.syncBatch();
      this.syncFno();
    }, BATCH_DEBOUNCE_MS);
  }

  /** `fno:watch` replaces the set too; an emptied set is released with `fno:unwatch`. */
  private syncFno(): void {
    if (!this.socket?.connected) return;
    const instruments = this.fnoTargets();
    const signature = instruments.join('\n');
    if (signature === this.sentFno) return;
    if (instruments.length === 0) {
      this.socket.emit('fno:unwatch', { key: FNO_KEY });
    } else {
      this.socket.emit('fno:watch', { key: FNO_KEY, instruments });
    }
    this.sentFno = signature;
  }

  /** `watch:batch` REPLACES the set server-side, so the whole list is sent and it diffs. */
  private syncBatch(): void {
    if (!this.socket?.connected) return;
    const targets = this.batchTargets();
    const signature = targets.join('\n');
    if (signature === this.sentBatch) return;
    if (targets.length === 0) {
      this.socket.emit('unwatch:batch', { key: BATCH_KEY });
    } else {
      this.socket.emit('watch:batch', { key: BATCH_KEY, targets: targets.map(splitLiveKey) });
    }
    this.sentBatch = signature;
  }

  private isWatched(key: string): boolean {
    return this.refs.list.has(key) || this.refs.stream.has(key) || this.refs.fno.has(key);
  }

  private totalRefs(): number {
    return this.refs.list.size + this.refs.stream.size + this.refs.fno.size;
  }

  /* ── Reading ─────────────────────────────────────────────────────────────────────── */

  getQuote(key: string): LiveQuote | undefined {
    return this.quotes.get(key);
  }

  subscribeKey(key: string, listener: Listener): () => void {
    let set = this.listeners.get(key);
    if (!set) {
      set = new Set();
      this.listeners.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = this.listeners.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(key);
    };
  }

  /**
   * The feed that last delivered `key` and when — any tick, changed or not — so a screen can
   * say "Live" while a quiet stock is still being confirmed, and which broker it streams from.
   */
  getLastTick(key: string): { origin: TickOrigin; at: number } | undefined {
    return this.owners.get(key);
  }

  getFeedStatus(): FeedStatus | null {
    return this.feed;
  }

  subscribeFeed(listener: Listener): () => void {
    this.feedListeners.add(listener);
    return () => this.feedListeners.delete(listener);
  }

  private updateFeed(frame: unknown): void {
    const fields = feedFields(frame);
    const prev = this.feed;
    const next: FeedStatus = {
      state: fields.state ?? prev?.state ?? 'live',
      source: fields.source ?? prev?.source ?? null,
      transport: fields.transport ?? prev?.transport ?? null,
      note: 'note' in fields ? (fields.note ?? null) : (prev?.note ?? null),
      intervalMs: fields.intervalMs ?? prev?.intervalMs ?? 5_000,
      at: this.deps.now(),
    };
    this.feed = next;
    this.feedListeners.forEach((listener) => listener());
  }

  getStatus(): StreamStatus {
    return this.status;
  }

  subscribeStatus(listener: Listener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private setStatus(next: StreamStatus): void {
    if (next === this.status) return;
    this.status = next;
    this.statusListeners.forEach((listener) => listener());
  }

  /* ── Ticks ───────────────────────────────────────────────────────────────────────── */

  /**
   * Folds ticks into the store; subscribers hear about it once, before the next frame.
   * `platform`: the F&O frame came from the server's fallback data, not a broker feed.
   */
  ingest(
    ticks: readonly LiveTick[],
    origin: TickOrigin = 'broker',
    options: { platform?: boolean } = {},
  ): void {
    const now = this.deps.now();
    for (const tick of ticks) {
      if (!tick || typeof tick.symbol !== 'string') continue;
      const key = liveKey(tick.exchange, tick.symbol);
      // A late frame for a symbol nothing watches any more is not stored: it would outlive
      // the screen and resurface as a stale "live" price.
      if (!this.isWatched(key)) continue;
      // The platform's fallback is a saved snapshot, not a feed: fine for an F&O screen that
      // asked for it (and says so), never a stand-in for a stock's live price.
      if (origin === 'fno' && options.platform && !this.refs.fno.has(key)) continue;
      // One feed per symbol: the other feed waits until the owner has gone quiet.
      const owner = this.owners.get(key);
      if (owner && owner.origin !== origin && now - owner.at < SOURCE_HOLD_MS) continue;
      if (!positiveNumber(tick.ltp)) continue;
      this.owners.set(key, { origin, at: now });
      const prev = this.quotes.get(key);
      const next = toLiveQuote(prev, tick, now);
      if (!next || next === prev) continue;
      this.quotes.set(key, next);
      this.dirty.add(key);
    }
    if (this.dirty.size > 0 && !this.frameQueued) {
      this.frameQueued = true;
      this.deps.frame(() => this.flush());
    }
  }

  private flush(): void {
    this.frameQueued = false;
    const keys = [...this.dirty];
    this.dirty.clear();
    for (const key of keys) this.notify(key);
  }

  private notify(key: string): void {
    this.listeners.get(key)?.forEach((listener) => listener());
  }

  private scheduleEvict(key: string): void {
    this.cancelEvict(key);
    this.evictTimers.set(
      key,
      setTimeout(() => {
        this.evictTimers.delete(key);
        if (this.isWatched(key)) return;
        this.owners.delete(key);
        if (!this.quotes.delete(key)) return;
        this.notify(key); // readers fall back to their REST price
      }, QUOTE_RETAIN_MS),
    );
  }

  private cancelEvict(key: string): void {
    const timer = this.evictTimers.get(key);
    if (!timer) return;
    clearTimeout(timer);
    this.evictTimers.delete(key);
  }

  /* ── Connection ──────────────────────────────────────────────────────────────────── */

  private ensureConnection(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
    if (!this.foreground || this.totalRefs() === 0) return;
    this.socket ??= this.openSocket();
    if (!this.socket.connected && !this.socket.active) {
      this.setStatus('connecting');
      this.socket.connect();
    }
  }

  private openSocket(): StreamSocket {
    const socket = this.deps.createSocket();
    socket.on('connect', () => {
      this.retryDelay = RETRY_START_MS;
      this.setStatus('live');
      // A new connection holds no subscriptions server-side: rebuild them from the registry.
      this.sentBatch = '';
      this.sentFno = '';
      for (const key of this.refs.stream.keys()) this.emitSymbol('watch:symbol', key);
      this.syncBatch();
      this.syncFno();
    });
    socket.on('disconnect', (reason: string) => {
      const wanted = this.foreground && this.totalRefs() > 0;
      this.setStatus(wanted ? 'connecting' : 'idle');
      // Kicked by the server (not a network drop): Socket.IO will not reconnect by itself.
      if (wanted && reason === 'io server disconnect') socket.connect();
    });
    // A refused handshake (an expired token, say) is not retried by Socket.IO itself.
    socket.on('connect_error', () => {
      if (socket.active) return;
      this.setStatus('offline');
      if (this.retryTimer) clearTimeout(this.retryTimer);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        if (this.foreground && this.totalRefs() > 0 && !socket.active) socket.connect();
      }, this.retryDelay);
      this.retryDelay = Math.min(this.retryDelay * 2, RETRY_MAX_MS);
    });
    socket.on('price:update', (tick: LiveTick) => this.ingest([tick], 'broker'));
    socket.on('prices:batch', (frame: { ticks?: LiveTick[] }) => {
      if (Array.isArray(frame?.ticks)) this.ingest(frame.ticks, 'broker');
    });
    socket.on('fno:ticks', (frame: { ticks?: FnoWireTick[]; source?: unknown }) => {
      this.updateFeed(frame);
      if (Array.isArray(frame?.ticks)) {
        this.ingest(frame.ticks.map(fromFnoTick), 'fno', {
          platform: frame.source === 'platform',
        });
      }
    });
    // The F&O feed's heartbeat: live / degraded / closed, Groww or the platform, pushed or polled.
    socket.on('fno:status', (frame: unknown) => this.updateFeed(frame));
    return socket;
  }

  private scheduleIdleDisconnect(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      if (this.totalRefs() > 0) return;
      this.socket?.disconnect();
      this.setStatus('idle');
    }, IDLE_DISCONNECT_MS);
  }

  /** Backgrounded: drop the connection (the server releases the broker subscriptions). */
  setForeground(foreground: boolean): void {
    if (foreground === this.foreground) return;
    this.foreground = foreground;
    if (foreground) {
      this.ensureConnection();
      return;
    }
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.disconnect();
    this.setStatus('idle');
  }

  /** Sign-out: everything tied to the session goes, including the connection. */
  reset(): void {
    for (const timer of [this.batchTimer, this.idleTimer, this.retryTimer]) {
      if (timer) clearTimeout(timer);
    }
    this.batchTimer = this.idleTimer = this.retryTimer = null;
    this.evictTimers.forEach((timer) => clearTimeout(timer));
    this.evictTimers.clear();
    this.refs.list.clear();
    this.refs.stream.clear();
    this.refs.fno.clear();
    const keys = [...this.quotes.keys()];
    this.quotes.clear();
    this.owners.clear();
    this.dirty.clear();
    this.feed = null;
    this.feedListeners.forEach((listener) => listener());
    this.sentBatch = '';
    this.sentFno = '';
    this.retryDelay = RETRY_START_MS;
    this.socket?.removeAllListeners();
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('idle');
    keys.forEach((key) => this.notify(key));
  }
}

const frame =
  typeof requestAnimationFrame === 'function'
    ? (fn: () => void) => {
        requestAnimationFrame(fn);
      }
    : (fn: () => void) => {
        setTimeout(fn, 16);
      };

export const priceStream = new PriceStream({
  createSocket: () =>
    io(env.socketUrl, {
      transports: ['websocket'],
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 5_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
      // Re-evaluated on every (re)connect, so a rotated access token is always the one sent.
      auth: (cb) => {
        void getValidAccessToken().then((token) => cb({ token: token ?? '' }));
      },
    }) as unknown as StreamSocket,
  now: () => Date.now(),
  frame,
});

// Background → no connection; foreground → reconnect and resubscribe. 'inactive' (iOS app
// switcher, a system sheet) is transient and keeps the stream.
AppState.addEventListener('change', (state) => {
  if (state === 'active') priceStream.setForeground(true);
  else if (state === 'background') priceStream.setForeground(false);
});
