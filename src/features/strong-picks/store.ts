import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';

import { DEFAULT_CAPITAL, MAX_CAPITAL, MIN_CAPITAL } from './lib/picksView';

interface StrongPickPrefsState {
  /** Trading capital for position sizing at 1% risk. Stays on this device; never sent. */
  capital: number;
  setCapital: (capital: number) => void;
}

const valid = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= MIN_CAPITAL && n <= MAX_CAPITAL;

/**
 * The reader's capital for the strong-picks position sizes — remembered across launches, like the
 * web keeps it in the browser. Read back values are checked, so a corrupt entry falls back to the
 * default rather than sizing every pick from nonsense.
 */
export const useStrongPickPrefs = create<StrongPickPrefsState>()(
  persist(
    (set) => ({
      capital: DEFAULT_CAPITAL,
      setCapital: (capital) => {
        if (valid(capital)) set({ capital });
      },
    }),
    {
      name: 'strong-pick-prefs',
      storage: createJSONStorage(() => appStorage),
      partialize: ({ capital }) => ({ capital }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<StrongPickPrefsState>;
        return { ...current, capital: valid(saved.capital) ? saved.capital : current.capital };
      },
    },
  ),
);
