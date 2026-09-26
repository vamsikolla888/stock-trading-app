import { io, type Socket } from 'socket.io-client';

import { env } from '@/config/env';
import type { IndexSnapshot } from '@/features/market/types';
import { getValidAccessToken } from '@/services/api/client';

type SnapshotListener = (snapshot: IndexSnapshot) => void;

/** Keep the connection this long after the last subscriber leaves, so quick tab switches don't churn it. */
const IDLE_DISCONNECT_MS = 10_000;
const MAX_MANUAL_RETRY_MS = 30_000;

let socket: Socket | null = null;
let lastSnapshot: IndexSnapshot | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryDelayMs = 1_000;
const listeners = new Set<SnapshotListener>();

function clearTimers() {
  if (idleTimer) clearTimeout(idleTimer);
  if (retryTimer) clearTimeout(retryTimer);
  idleTimer = null;
  retryTimer = null;
}

function createSocket(): Socket {
  const next = io(`${env.socketUrl}/indices`, {
    transports: ['websocket'],
    autoConnect: false,
    reconnection: true,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.5,
    timeout: 10_000,
    // The callback form is re-evaluated on every (re)connect, so a rotated access token
    // (15-minute TTL) is always the one presented.
    auth: (cb) => {
      void getValidAccessToken().then((token) => cb({ token: token ?? '' }));
    },
  });

  next.on('indices:update', (snapshot: IndexSnapshot) => {
    lastSnapshot = snapshot;
    retryDelayMs = 1_000;
    listeners.forEach((listener) => listener(snapshot));
  });

  // A handshake the server refused (e.g. an expired token) is not retried automatically by
  // Socket.IO — `active` goes false. Retry with backoff while someone is still listening.
  next.on('connect_error', () => {
    if (next.active || listeners.size === 0) return;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      if (listeners.size > 0) next.connect();
    }, retryDelayMs);
    retryDelayMs = Math.min(retryDelayMs * 2, MAX_MANUAL_RETRY_MS);
  });

  next.on('disconnect', (reason) => {
    // The server kicked us (not a network drop) — Socket.IO won't reconnect on its own.
    if (reason === 'io server disconnect' && listeners.size > 0) next.connect();
  });

  return next;
}

/**
 * The server's live index feed (/indices namespace). Connecting IS the subscription; the
 * server replays its latest snapshot immediately. Works without a connected broker,
 * unlike REST /market/indices. The connection is reference-counted: it opens for the
 * first subscriber and closes shortly after the last one leaves, because an open
 * connection keeps the server's index poller (and its broker calls) running.
 */
export const indicesSocket = {
  subscribe(listener: SnapshotListener): () => void {
    listeners.add(listener);
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (lastSnapshot) listener(lastSnapshot);

    socket ??= createSocket();
    if (!socket.connected && !socket.active) socket.connect();

    return () => {
      listeners.delete(listener);
      if (listeners.size > 0) return;
      idleTimer = setTimeout(() => {
        socket?.disconnect();
        idleTimer = null;
      }, IDLE_DISCONNECT_MS);
    };
  },

  /** Drops the connection and cached snapshot — called on sign-out. */
  reset(): void {
    clearTimers();
    listeners.clear();
    lastSnapshot = null;
    retryDelayMs = 1_000;
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
  },
};
