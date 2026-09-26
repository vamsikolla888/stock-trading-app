import * as SecureStore from 'expo-secure-store';

import { appConfig } from '@/config/app';

interface TokenCache {
  accessToken: string | null;
  refreshToken: string | null;
}

// THIS_DEVICE_ONLY keeps tokens out of iCloud/iTunes backups and device migration:
// a restored backup must sign in again rather than inherit someone's session.
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let cache: TokenCache | null = null;
let loadPromise: Promise<TokenCache> | null = null;

function load(): Promise<TokenCache> {
  if (cache) return Promise.resolve(cache);
  if (!loadPromise) {
    loadPromise = Promise.all([
      SecureStore.getItemAsync(appConfig.auth.accessTokenKey, STORE_OPTIONS),
      SecureStore.getItemAsync(appConfig.auth.refreshTokenKey, STORE_OPTIONS),
    ])
      .then(([accessToken, refreshToken]) => {
        // A setTokens/clearTokens that landed while this read was in flight is newer
        // than what the Keychain returned — never let the stale read overwrite it.
        cache ??= { accessToken, refreshToken };
        return cache;
      })
      .finally(() => {
        loadPromise = null;
      });
  }
  return loadPromise;
}

/**
 * Auth tokens live in the Keychain/Keystore (hardware-backed, not MMKV). Reads are
 * served from an in-memory copy after the first load, so attaching the bearer token
 * to every request doesn't cost a native Keychain round trip each time.
 */
export const secureTokens = {
  /** Warms the in-memory cache — call during startup, in parallel with other bootstrap work. */
  preload(): Promise<void> {
    return load().then(() => undefined);
  },
  async getAccessToken(): Promise<string | null> {
    return (await load()).accessToken;
  },
  async getRefreshToken(): Promise<string | null> {
    return (await load()).refreshToken;
  },
  async setTokens(accessToken: string, refreshToken: string): Promise<void> {
    // Update memory first so requests fired while the Keychain write is in flight
    // already use the new pair (the old refresh token is single-use and now dead).
    cache = { accessToken, refreshToken };
    await Promise.all([
      SecureStore.setItemAsync(appConfig.auth.accessTokenKey, accessToken, STORE_OPTIONS),
      SecureStore.setItemAsync(appConfig.auth.refreshTokenKey, refreshToken, STORE_OPTIONS),
    ]);
  },
  async clearTokens(): Promise<void> {
    cache = { accessToken: null, refreshToken: null };
    await Promise.all([
      SecureStore.deleteItemAsync(appConfig.auth.accessTokenKey, STORE_OPTIONS),
      SecureStore.deleteItemAsync(appConfig.auth.refreshTokenKey, STORE_OPTIONS),
    ]);
  },
};
