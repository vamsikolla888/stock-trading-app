import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';

export interface RecentSearch {
  symbol: string;
  exchange: string;
  name: string;
}

const MAX_RECENT_SEARCHES = 8;

interface PreferencesState {
  biometricsEnabled: boolean;
  notificationsEnabled: boolean;
  currency: 'USD' | 'EUR' | 'GBP';
  /** Set once the welcome screen has been passed — later sign-outs land on sign-in directly. */
  hasSeenWelcome: boolean;
  /** Prefills the sign-in email after a sign-out or an expired session. */
  lastSignedInEmail: string | null;
  /** The eye toggle on portfolio values — remembered, so values stay hidden in public. */
  hideValues: boolean;
  recentSearches: RecentSearch[];
  setBiometricsEnabled: (enabled: boolean) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setCurrency: (currency: PreferencesState['currency']) => void;
  markWelcomeSeen: () => void;
  setLastSignedInEmail: (email: string | null) => void;
  toggleHideValues: () => void;
  addRecentSearch: (entry: RecentSearch) => void;
  clearRecentSearches: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      biometricsEnabled: false,
      notificationsEnabled: true,
      currency: 'USD',
      hasSeenWelcome: false,
      lastSignedInEmail: null,
      hideValues: false,
      recentSearches: [],
      setBiometricsEnabled: (biometricsEnabled) => set({ biometricsEnabled }),
      setNotificationsEnabled: (notificationsEnabled) => set({ notificationsEnabled }),
      setCurrency: (currency) => set({ currency }),
      markWelcomeSeen: () => set({ hasSeenWelcome: true }),
      setLastSignedInEmail: (lastSignedInEmail) => set({ lastSignedInEmail }),
      toggleHideValues: () => set((state) => ({ hideValues: !state.hideValues })),
      addRecentSearch: (entry) =>
        set((state) => ({
          recentSearches: [
            entry,
            ...state.recentSearches.filter(
              (item) => !(item.symbol === entry.symbol && item.exchange === entry.exchange),
            ),
          ].slice(0, MAX_RECENT_SEARCHES),
        })),
      clearRecentSearches: () => set({ recentSearches: [] }),
    }),
    {
      name: 'preferences-store',
      storage: createJSONStorage(() => appStorage),
    },
  ),
);
