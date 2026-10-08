import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import {
  priceStream,
  type FeedStatus,
  type StreamStatus,
  type TickOrigin,
  type WatchMode,
} from '@/services/realtime/priceStream';

import { liveKey, type LiveQuote } from './lib/liveQuote';

/**
 * React bindings for the live price store (services/realtime/priceStream.ts).
 *
 * WATCHING FOLLOWS FOCUS. Tabs keep visited screens mounted; a screen the user cannot see must
 * not hold broker subscriptions. Every screen wrapper (GroupScreen, StackScreen) puts its tree in
 * a LiveScope that is active only while the screen is focused, and every hook below watches only
 * inside an active scope — rows pause when their screen is covered and resume when it returns,
 * with no code in the screens themselves. Outside any scope (a sheet portalled to the root) a
 * hook is active.
 */

const LiveScopeContext = createContext(true);

export function LiveScope({ active, children }: { active: boolean; children: React.ReactNode }) {
  // Nested scopes AND together: a focused tab inside an unfocused stack is still hidden.
  const parent = useContext(LiveScopeContext);
  return <LiveScopeContext.Provider value={parent && active}>{children}</LiveScopeContext.Provider>;
}

export function useLiveScopeActive(): boolean {
  return useContext(LiveScopeContext);
}

const noopUnsubscribe = () => undefined;

export interface LiveQuoteOptions {
  /** 'stream' for a screen about this one instrument: every tick, unthrottled. */
  mode?: WatchMode;
  enabled?: boolean;
}

/**
 * The live quote for one symbol, or undefined until its first tick (render the REST price until
 * then — `overlayQuote` does exactly that). Re-renders only when THIS symbol's price changes.
 */
export function useLiveQuote(
  exchange: string | null | undefined,
  symbol: string | null | undefined,
  options: LiveQuoteOptions = {},
): LiveQuote | undefined {
  const scopeActive = useContext(LiveScopeContext);
  const mode = options.mode ?? 'list';
  const key = symbol ? liveKey(exchange, symbol) : null;
  const watching = Boolean(key) && scopeActive && options.enabled !== false;

  useEffect(() => {
    if (!watching || !key) return undefined;
    return priceStream.retain(key, mode);
  }, [watching, key, mode]);

  const subscribe = useCallback(
    (onChange: () => void) => (key ? priceStream.subscribeKey(key, onChange) : noopUnsubscribe),
    [key],
  );
  const getSnapshot = useCallback(() => (key ? priceStream.getQuote(key) : undefined), [key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface LiveTarget {
  exchange: string | null | undefined;
  symbol: string;
}

/** Stable while the symbol SET is unchanged, however often the caller rebuilds its array. */
function signatureOf(targets: readonly LiveTarget[]): string {
  return [...new Set(targets.map((t) => liveKey(t.exchange, t.symbol)))].sort().join('\n');
}

/**
 * Live quotes for a set of symbols, keyed by liveKey — for figures that combine several prices
 * (a portfolio's value, a list's day move, an option chain). Re-renders when any of them ticks.
 * `mode: 'fno'` watches F&O contracts (`NFO:<tradingSymbol>`) on the F&O feed.
 */
export function useLiveQuotes(
  targets: readonly LiveTarget[],
  options: { enabled?: boolean; mode?: Exclude<WatchMode, 'stream'> } = {},
): ReadonlyMap<string, LiveQuote> {
  const scopeActive = useContext(LiveScopeContext);
  const mode = options.mode ?? 'list';
  const signature = signatureOf(targets);
  const keys = useMemo(() => (signature ? signature.split('\n') : []), [signature]);
  const watching = scopeActive && options.enabled !== false;

  useEffect(() => {
    if (!watching || keys.length === 0) return undefined;
    const releases = keys.map((key) => priceStream.retain(key, mode));
    return () => releases.forEach((release) => release());
  }, [watching, keys, mode]);

  const subscribe = useCallback(
    (onChange: () => void) => {
      const offs = keys.map((key) => priceStream.subscribeKey(key, onChange));
      return () => offs.forEach((off) => off());
    },
    [keys],
  );
  // A string of per-key sequence numbers: equal by value while nothing ticked, so React
  // skips the render; the map itself is rebuilt only when it changes.
  const getVersion = useCallback(
    () =>
      keys
        .map((key) => {
          const quote = priceStream.getQuote(key);
          return quote ? `${quote.seq}.${quote.at}` : '-';
        })
        .join(','),
    [keys],
  );
  const version = useSyncExternalStore(subscribe, getVersion, getVersion);

  return useMemo(() => {
    void version;
    const map = new Map<string, LiveQuote>();
    for (const key of keys) {
      const quote = priceStream.getQuote(key);
      if (quote) map.set(key, quote);
    }
    return map;
  }, [keys, version]);
}

/** Whether the live feed is connected — for a "Live" marker, never for gating content. */
export function useStreamStatus(): StreamStatus {
  return useSyncExternalStore(
    (onChange) => priceStream.subscribeStatus(onChange),
    () => priceStream.getStatus(),
    () => priceStream.getStatus(),
  );
}

/** The F&O feed's heartbeat (Groww or the platform, pushed or polled), or null before one. */
export function useFeedStatus(): FeedStatus | null {
  return useSyncExternalStore(
    (onChange) => priceStream.subscribeFeed(onChange),
    () => priceStream.getFeedStatus(),
    () => priceStream.getFeedStatus(),
  );
}

/** A symbol counts as live this long after its last tick — a quiet stock still trades rarely. */
export const LIVE_WINDOW_MS = 60_000;

export interface Liveness {
  /** A broker feed delivered this symbol within LIVE_WINDOW_MS. */
  live: boolean;
  /** Which broker it streams from, for "Live · Groww". Null when not live. */
  via: 'mStock' | 'Groww' | null;
}

/** Pure: whether a symbol's last tick still makes it live at `now`. */
export function livenessOf(
  last: { origin: TickOrigin; at: number } | undefined,
  now: number,
): Liveness {
  if (!last || now - last.at > LIVE_WINDOW_MS) return { live: false, via: null };
  return { live: true, via: last.origin === 'fno' ? 'Groww' : 'mStock' };
}

/**
 * Whether one symbol is streaming right now, and from which broker — for the "Live" marker on a
 * detail screen. Re-checked every 2 s (a tick wakes it sooner), so it turns "refreshing" by itself
 * when the feed goes quiet.
 */
export function useLiveness(
  exchange: string | null | undefined,
  symbol: string | null | undefined,
): Liveness {
  const key = symbol ? liveKey(exchange, symbol) : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 2_000);
    return () => clearInterval(timer);
  }, []);
  // Re-render on this symbol's ticks too, so "Live" appears with the first one.
  useSyncExternalStore(
    useCallback(
      (onChange: () => void) => (key ? priceStream.subscribeKey(key, onChange) : noopUnsubscribe),
      [key],
    ),
    useCallback(() => (key ? priceStream.getQuote(key) : undefined), [key]),
    useCallback(() => (key ? priceStream.getQuote(key) : undefined), [key]),
  );
  const last = key ? priceStream.getLastTick(key) : undefined;
  return livenessOf(last, Math.max(now, last?.at ?? 0));
}
