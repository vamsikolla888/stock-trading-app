import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';

interface PaperProfileState {
  /**
   * The paper profile last picked on this device — a convenience so reopening the app
   * doesn't silently drop back to Default. Never the source of truth: it's checked against
   * the server's profile list before use (a remembered id may have been deleted elsewhere).
   */
  activeProfileId: string | null;
  setActiveProfileId: (id: string | null) => void;
}

export const usePaperProfileStore = create<PaperProfileState>()(
  persist(
    (set) => ({
      activeProfileId: null,
      setActiveProfileId: (activeProfileId) => set({ activeProfileId }),
    }),
    { name: 'paper-profile-store', storage: createJSONStorage(() => appStorage) },
  ),
);
