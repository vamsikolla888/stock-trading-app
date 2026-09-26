import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { appStorage } from '@/lib/storage/appStorage';
import type { AuthUser } from '@/types/auth';

interface AuthState {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** True until the cold-start session check finishes, so routing can wait before deciding. */
  isHydrating: boolean;
  setUser: (user: AuthUser | null) => void;
  setHydrated: () => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      isAuthenticated: false,
      isHydrating: true,
      setUser: (user) => set({ user, isAuthenticated: user !== null }),
      setHydrated: () => set({ isHydrating: false }),
      signOut: () => set({ user: null, isAuthenticated: false }),
    }),
    {
      name: 'auth-store',
      version: 1,
      storage: createJSONStorage(() => appStorage),
      // Only the user profile is persisted; `isAuthenticated` is decided on every cold
      // start from the Keychain refresh token (see restoreSession), never trusted from disk.
      partialize: (state) => ({ user: state.user }),
      // v0 persisted a `fullName`-shaped user from a different backend — drop it.
      migrate: () => ({ user: null }),
    },
  ),
);
