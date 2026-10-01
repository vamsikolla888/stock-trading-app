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
 * Ticks come from the VIEWER's own broker session (the server subscribes each symbol on that
 * user's mStock ticker). Without one nothing arrives, and every screen simply keeps its REST
 * price — polled as before — which is why nothing here is ever an error state.
 */

export type WatchMode = 'list' | 'stream' | 'fno';
export type StreamStatus = 'idle' | 'connecting' | 'live' | 'offline';

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
  return {
    exchange,
    symbol,
    ltp: tick?.ltp,
    change: null,
    changePct: null,
    prevClose: typeof tick?.c === 'number' ? tick.c : null,
    direction: null,
    volume: typeof tick?.v === 'number' ? tick.v : null,
    ohlc: null,
  };
}

export class PriceStream {
  private socket: StreamSocket | null = null;
  private readonly refs: Record<WatchMode, Map<string, number>> = {
    list: new Map(),
    stream: new Map(),
    fno: new Map(),
  };
  private readonly quotes = new Map<string, LiveQuote>();
  private readonly listeners = new Map<string, Set<Listener>>();
  private readonly statusListeners = new Set<Listener>();
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

  /** The F&O instruments the app-wide `fno:watch` carries, in watch order. */
  fnoTargets(): string[] {
    return [...this.refs.fno.keys()].slice(0, MAX_FNO_INSTRUMENTS);
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

  /** Folds ticks into the store; subscribers hear about it once, before the next frame. */
  ingest(ticks: readonly LiveTick[]): void {
    const now = this.deps.now();
    for (const tick of ticks) {
      if (!tick || typeof tick.symbol !== 'string') continue;
      const key = liveKey(tick.exchange, tick.symbol);
      // A late frame for a symbol nothing watches any more is not stored: it would outlive
      // the screen and resurface as a stale "live" price.
      if (!this.isWatched(key)) continue;
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
        if (this.isWatched(key) || !this.quotes.delete(key)) return;
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
    socket.on('price:update', (tick: LiveTick) => this.ingest([tick]));
    socket.on('prices:batch', (frame: { ticks?: LiveTick[] }) => {
      if (Array.isArray(frame?.ticks)) this.ingest(frame.ticks);
    });
    socket.on('fno:ticks', (frame: { ticks?: FnoWireTick[] }) => {
      if (Array.isArray(frame?.ticks)) this.ingest(frame.ticks.map(fromFnoTick));
    });
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
    this.dirty.clear();
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
