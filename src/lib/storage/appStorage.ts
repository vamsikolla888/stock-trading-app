/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, see below */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';

const ENCRYPTION_KEY_STORE_ID = 'mmkv.encryptionKey';

/**
 * Expo Go ships a fixed set of native modules, and MMKV (a Nitro module) isn't one of
 * them — evaluating react-native-mmkv there throws. Expo Go is only a development tool,
 * so there the app falls back to AsyncStorage: unencrypted, but auth tokens live in
 * SecureStore either way. Every real build (dev client, preview, production) uses
 * encrypted MMKV and fails loudly if it's missing, rather than quietly storing
 * financial data unencrypted.
 */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * MMKV encrypts its on-disk file with a key we control. We generate that key once and
 * keep it in the Keychain/Keystore (via expo-secure-store) rather than hardcoding it, so
 * the encrypted store is only readable on this device/app install.
 */
async function getOrCreateEncryptionKey(): Promise<string> {
  const existing = await SecureStore.getItemAsync(ENCRYPTION_KEY_STORE_ID);
  if (existing) return existing;

  const bytes = await Crypto.getRandomBytesAsync(32);
  const key = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  await SecureStore.setItemAsync(ENCRYPTION_KEY_STORE_ID, key);
  return key;
}

async function createMmkvBackend(): Promise<StorageBackend> {
  // Required lazily, never imported at the top: evaluating react-native-mmkv looks up its
  // native module immediately, which is exactly what crashes under Expo Go.
  const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
  const mmkv = createMMKV({ id: 'app-storage', encryptionKey: await getOrCreateEncryptionKey() });
  return {
    get: async (key) => mmkv.getString(key) ?? null,
    set: async (key, value) => mmkv.set(key, value),
    remove: async (key) => {
      mmkv.remove(key);
    },
  };
}

type AsyncStorageModule = typeof import('@react-native-async-storage/async-storage');

function createAsyncStorageBackend(): StorageBackend {
  // Lazy for the same reason: each backend's native module is only touched when chosen.
  const AsyncStorage = (require('@react-native-async-storage/async-storage') as AsyncStorageModule)
    .default;
  return {
    get: (key) => AsyncStorage.getItem(key),
    set: (key, value) => AsyncStorage.setItem(key, value),
    remove: (key) => AsyncStorage.removeItem(key),
  };
}

let backendPromise: Promise<StorageBackend> | undefined;

function backend(): Promise<StorageBackend> {
  backendPromise ??= (
    isExpoGo ? Promise.resolve().then(createAsyncStorageBackend) : createMmkvBackend()
  ).catch((error: unknown) => {
    // Don't cache a failed Keychain read: the next access tries again.
    backendPromise = undefined;
    throw error;
  });
  return backendPromise;
}

/**
 * Idempotent and safe to call concurrently: the root layout awaits it to gate the splash
 * screen, and the adapter below awaits it lazily, so any zustand `persist` store hydrates
 * correctly regardless of module-evaluation order.
 */
export function initStorage(): Promise<void> {
  return backend().then(() => undefined);
}

/**
 * Async-shaped storage adapter — the one to use for zustand `persist` and the React Query
 * persister, since both accept promise-returning storage and will await initialization
 * instead of racing the Keychain-backed key bootstrap above.
 */
export const appStorage = {
  getItem: async (key: string): Promise<string | null> => (await backend()).get(key),
  setItem: async (key: string, value: string): Promise<void> => (await backend()).set(key, value),
  removeItem: async (key: string): Promise<void> => (await backend()).remove(key),
};
