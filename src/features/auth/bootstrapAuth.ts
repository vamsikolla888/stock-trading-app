import { queryPersister } from '@/lib/query/persister';
import { queryClient } from '@/lib/query/queryClient';
import { waitForHydration } from '@/lib/storage/hydration';
import { secureTokens } from '@/lib/storage/secureTokens';
import { toast } from '@/lib/utils/toast';
import { authApi } from '@/services/api/authApi';
import { registerAuthHandlers } from '@/services/api/client';
import { indicesSocket } from '@/services/realtime/indicesSocket';
import { priceStream } from '@/services/realtime/priceStream';
import { useAuthStore } from '@/store/authStore';
import { usePreferencesStore } from '@/store/preferencesStore';
import type { LoginResponse } from '@/types/auth';

import { useAuthFlowStore } from './authFlowStore';

let registered = false;

/**
 * Makes a server-issued session this device's: tokens into the Keychain first, then the
 * profile — flipping the store is what moves the user into the app, so nothing may be missing
 * by then. One path for every way a session is born (password, second factor, email change).
 */
export async function startSession({
  user,
  accessToken,
  refreshToken,
}: LoginResponse): Promise<void> {
  await secureTokens.setTokens(accessToken, refreshToken);
  usePreferencesStore.getState().setLastSignedInEmail(user.email);
  useAuthStore.getState().setUser(user);
  // After the flip, not before: the code screen redirects to sign-in when its challenge
  // disappears, and by now the signed-out stack is already gone.
  useAuthFlowStore.getState().clearChallenge();
}

/**
 * Tears down everything tied to the signed-in user. Order matters: the socket closes
 * and tokens are wiped before the store flips, because flipping the store is what
 * navigates away — nothing should still be able to act on the old session by then.
 * The persisted query cache and recent searches are dropped too, so the next person to
 * sign in on this device never sees the previous user's data or history.
 */
export async function endSession(): Promise<void> {
  indicesSocket.reset();
  priceStream.reset();
  await secureTokens.clearTokens();
  useAuthStore.getState().signOut();
  usePreferencesStore.getState().clearRecentSearches();
  queryClient.clear();
  await queryPersister.removeClient();
}

/**
 * The Sign out button: revokes this device's session on the server (so a copied refresh token
 * stops working and the device leaves Profile › Devices), then ends it locally. The server call
 * is best-effort and time-boxed — offline, or already revoked, the local sign-out still happens.
 */
export async function signOut(): Promise<void> {
  try {
    const refreshToken = await secureTokens.getRefreshToken();
    if (refreshToken) await authApi.logout(refreshToken);
  } catch {
    // Nothing to tell the user: they asked to leave this device, and they will.
  }
  await endSession();
}

/** Wires the axios client's refresh/401 hooks to the auth store — call once at app startup. */
export function registerApiAuthHandlers(): void {
  if (registered) return;
  registered = true;

  registerAuthHandlers({
    refresh: (refreshToken) => authApi.refresh(refreshToken),
    onUnauthorized: () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      void endSession();
      toast.info('Session expired', 'Please sign in again to continue.');
    },
  });
}

/**
 * Runs once on cold start behind the splash screen, with no network round trip: the
 * session is live if the Keychain holds a refresh token and the profile is on disk.
 * Whether that token is still accepted is settled by the first API call (proactive
 * refresh, or refresh-on-401), so a revoked session signs out on first use.
 */
export async function restoreSession(): Promise<void> {
  const { setUser, setHydrated } = useAuthStore.getState();

  try {
    const [refreshToken] = await Promise.all([
      secureTokens.getRefreshToken(),
      waitForHydration(useAuthStore),
    ]);
    const { user } = useAuthStore.getState();

    if (refreshToken && user) {
      setUser(user);
    } else {
      // Half a session (a token without a profile, or the reverse) is unusable.
      if (refreshToken) await secureTokens.clearTokens();
      setUser(null);
    }
  } catch {
    // A transient Keychain read failure must not destroy a valid session on disk.
    // `isAuthenticated` starts false and is never persisted, so doing nothing shows
    // sign-in for this launch while leaving the stored tokens and profile intact
    // (calling setUser(null) here would persist the wipe).
  } finally {
    setHydrated();
  }
}
