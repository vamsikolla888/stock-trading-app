import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';

/**
 * Pauses the sub-tab swipe while a finger is doing something else sideways — scrubbing a chart.
 * The pager is native and does not know a JS view already owns the touch, so without this a
 * horizontal scrub on a chart inside a swipeable tab would turn the page instead. A hold is
 * taken when the touch is granted, long before the finger has moved far enough for the pager to
 * start, and released when the touch ends. Counted, so overlapping holds cannot unlock early.
 */

let holds = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isHeld = () => holds > 0;

/** Takes a hold; call the returned function (any number of times) to release it. */
export function holdTabSwipe(): () => void {
  holds += 1;
  if (holds === 1) emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds === 0) emit();
  };
}

/** True while any hold is taken — the swipeable tabs turn their swipe off. */
export function useTabSwipeHeld(): boolean {
  return useSyncExternalStore(subscribe, isHeld, () => false);
}

/**
 * A component's own hold, for touch handlers: `take` on grant, `release` on release or
 * terminate. Taking twice holds once; unmounting mid-gesture releases.
 */
export function useSwipeHold(): { take: () => void; release: () => void } {
  const release = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      release.current?.();
      release.current = null;
    },
    [],
  );
  return useMemo(
    () => ({
      take: () => {
        release.current ??= holdTabSwipe();
      },
      release: () => {
        release.current?.();
        release.current = null;
      },
    }),
    [],
  );
}
