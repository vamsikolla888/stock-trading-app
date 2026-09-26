import { useEffect, useState } from 'react';

/**
 * The current time in ms, re-read every `intervalMs` (default a minute). Use it for anything
 * time-relative a screen renders — "5 min ago", staleness, today's date — instead of calling
 * `Date.now()` during render, which is impure and never updates on its own.
 */
export function useNow(intervalMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
}
