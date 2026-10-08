import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';

import { clampSizing, SIZING_LIMITS, type SizingPrefs } from './lib/view';

interface NextDaySizingState {
  /** The reader's own capital and risk per trade; null = size by the report's defaults. */
  prefs: SizingPrefs | null;
  setPrefs: (prefs: SizingPrefs | null) => void;
}

const valid = (p: unknown): p is SizingPrefs => {
  if (typeof p !== 'object' || p === null) return false;
  const { capital, riskPct } = p as Partial<SizingPrefs>;
  return (
    typeof capital === 'number' &&
    typeof riskPct === 'number' &&
    capital >= SIZING_LIMITS.minCapital &&
    capital <= SIZING_LIMITS.maxCapital &&
    riskPct >= SIZING_LIMITS.minRisk &&
    riskPct <= SIZING_LIMITS.maxRisk
  );
};

/**
 * The capital and risk every next-day candidate is sized for — remembered on this device only,
 * as the web keeps it in the browser; never sent. A corrupt entry falls back to the report's.
 */
export const useNextDaySizing = create<NextDaySizingState>()(
  persist(
    (set) => ({
      prefs: null,
      setPrefs: (prefs) => set({ prefs: prefs && valid(prefs) ? prefs : null }),
    }),
    {
      name: 'next-day-sizing',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ prefs }) => ({ prefs }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<NextDaySizingState>;
        return { ...current, prefs: valid(saved.prefs) ? saved.prefs : null };
      },
    },
  ),
);

/** The prefs in force: the reader's own, else the report's (₹10 lakh at 0.5% by default). */
export function useSizingPrefs(fallback: SizingPrefs | null | undefined): SizingPrefs {
  const prefs = useNextDaySizing((state) => state.prefs);
  const base = fallback ?? { capital: 1_000_000, riskPct: 0.5 };
  return prefs ? clampSizing(prefs, base) : base;
}
