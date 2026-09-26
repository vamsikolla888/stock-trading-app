import { useCallback, useEffect, useState } from 'react';

/**
 * Seconds remaining until a deadline, ticking once a second. Derived from a wall-clock
 * end time rather than decrementing a counter, so it stays correct across the JS timer
 * pauses that happen while the app is backgrounded.
 */
export function useCountdown(): { remaining: number; start: (seconds: number) => void } {
  const [endsAt, setEndsAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (endsAt === null) return undefined;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        clearInterval(timer);
        setEndsAt(null);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  const start = useCallback((seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  }, []);
  const remaining = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000));

  return { remaining, start };
}
